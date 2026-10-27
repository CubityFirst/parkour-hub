import * as THREE from 'three';
import { Collider, CollisionWorld } from '../world/CollisionWorld';
import { BodyState, TUNING } from './PlayerPhysics';

export interface ParkourEvents {
  onVault(): void;
  onMantle(): void;
  onWallrunStart(side: number): void;
  onWallJump(): void;
  onWallrunEnd(): void;
}

/** A short scripted move (vault or mantle) that temporarily overrides physics. */
export interface ScriptedMove {
  kind: 'vault' | 'mantle';
  t: number;
  dur: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  exitVel: THREE.Vector3;
}

interface ObstacleHit {
  col: Collider;
  normal: THREE.Vector3;
  top: number;
}

const GRAVITY = 24;
const WALLRUN_BUDGET = 2.0; // seconds of wall running per airborne stretch

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Vaulting, ledge mantling and wall running — detection and execution.
 * Geometry probes are simple AABB queries against the collision world.
 */
export class ParkourSystem {
  scripted: ScriptedMove | null = null;

  readonly wallrun = {
    active: false,
    /** -1 = wall on the left, +1 = wall on the right */
    side: 0,
    timeLeft: 0,
    dir: new THREE.Vector3(),
    normal: new THREE.Vector3(1, 0, 0),
    colliderId: 0,
    speed: 0,
  };

  private cooldown = 0; // wallrun re-attach cooldown
  private autoCooldown = 0; // auto-mantle cooldown after scripted moves
  private lastWallId = 0;
  private budget = WALLRUN_BUDGET;

  constructor(private events: ParkourEvents) {}

  reset(): void {
    this.scripted = null;
    this.wallrun.active = false;
    this.cooldown = 0;
    this.autoCooldown = 0;
    this.lastWallId = 0;
    this.budget = WALLRUN_BUDGET;
  }

  tick(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.autoCooldown = Math.max(0, this.autoCooldown - dt);
  }

  /** Called whenever the player stands on ground: restores wallrun resources. */
  onGrounded(): void {
    this.budget = WALLRUN_BUDGET;
    this.lastWallId = 0;
  }

  /* ------------------------------- vault & mantle ------------------------------- */

  /** Used by the HUD to show the contextual "E — VAULT" hint. */
  canVault(body: BodyState, world: CollisionWorld, forward: THREE.Vector3): boolean {
    const hit = this.findObstacle(body, world, forward, 1.45, 1.35, 0.35);
    return hit !== null && this.landingPast(body, world, hit.col, forward) !== null;
  }

  tryVault(body: BodyState, world: CollisionWorld, forward: THREE.Vector3): boolean {
    if (this.scripted || this.wallrun.active) return false;
    const hit = this.findObstacle(body, world, forward, 1.45, 1.35, 0.35);
    if (!hit) return false;
    const end = this.landingPast(body, world, hit.col, forward);
    if (!end) return false;
    const speed = Math.hypot(body.vel.x, body.vel.z);
    const exit = forward.clone().multiplyScalar(Math.max(speed * 0.92, 5));
    this.scripted = { kind: 'vault', t: 0, dur: 0.34, start: body.pos.clone(), end, exitVel: exit };
    this.events.onVault();
    return true;
  }

  /** Pull-up onto a chest-high ledge. Auto-triggered mid-air (ledge recovery). */
  tryMantle(body: BodyState, world: CollisionWorld, forward: THREE.Vector3, auto = false): boolean {
    if (this.scripted || this.wallrun.active) return false;
    if (auto && this.autoCooldown > 0) return false;
    const hit = this.findObstacle(body, world, forward, 2.4, 0.95, 1.0);
    if (!hit) return false;
    const end = this.landingPast(body, world, hit.col, forward);
    if (!end) return false;
    const speed = Math.hypot(body.vel.x, body.vel.z);
    const exit = forward.clone().multiplyScalar(Math.min(Math.max(speed * 0.55, 2), 5));
    this.scripted = { kind: 'mantle', t: 0, dur: 0.44, start: body.pos.clone(), end, exitVel: exit };
    this.events.onMantle();
    return true;
  }

  /** Advance a scripted vault/mantle. The controller skips physics while busy. */
  stepScripted(body: BodyState, dt: number): void {
    const s = this.scripted;
    if (!s) return;
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    const xz = smooth(k);
    // rise first, then travel — reads as "up and over"
    const yK = smooth(Math.min(1, k * (s.kind === 'mantle' ? 1.7 : 1.35)));
    body.pos.x = lerp(s.start.x, s.end.x, xz);
    body.pos.z = lerp(s.start.z, s.end.z, xz);
    body.pos.y = lerp(s.start.y, s.end.y, yK) + (s.kind === 'vault' ? Math.sin(k * Math.PI) * 0.12 : 0);
    if (k >= 1) {
      body.pos.copy(s.end);
      body.vel.copy(s.exitVel);
      body.vel.y = 0;
      body.grounded = true; // verified by the next physics step
      this.scripted = null;
      this.autoCooldown = 0.25;
    }
  }

  /* ------------------------------- wall running ------------------------------- */

  /** Attempt to attach to a runnable wall while airborne. */
  tryAttachWallrun(body: BodyState, world: CollisionWorld, camRight: THREE.Vector3): boolean {
    if (this.wallrun.active || this.scripted) return false;
    if (this.cooldown > 0 || this.budget <= 0) return false;

    const hs = Math.hypot(body.vel.x, body.vel.z);
    if (hs < 5) return false;

    const p = body.pos;
    const hw = body.halfWidth;
    const reach = 0.85;
    const min = new THREE.Vector3(p.x - hw - reach, p.y + 0.2, p.z - hw - reach);
    const max = new THREE.Vector3(p.x + hw + reach, p.y + 1.7, p.z + hw + reach);

    let best: { col: Collider; normal: THREE.Vector3; dist: number } | null = null;
    world.query(min, max, (c) => {
      if (!c.wallRunnable || c.id === this.lastWallId) return;
      // wall must extend well above the feet and not start overhead
      if (c.max.y < p.y + 1.5 || c.min.y > p.y + 0.9) return;

      // horizontal distance from player center to the closest wall face
      const qx = Math.max(c.min.x, Math.min(p.x, c.max.x));
      const qz = Math.max(c.min.z, Math.min(p.z, c.max.z));
      let dx = p.x - qx;
      let dz = p.z - qz;
      let dist = Math.hypot(dx, dz);
      if (dist < 0.0001) {
        // overlapping in xz (pressed against the face): use center offset
        const cx = (c.min.x + c.max.x) / 2;
        const cz = (c.min.z + c.max.z) / 2;
        const ox = p.x - cx;
        const oz = p.z - cz;
        if (Math.abs(ox) > Math.abs(oz)) {
          dx = Math.sign(ox); dz = 0; dist = Math.max(0, Math.abs(ox) - (c.max.x - c.min.x) / 2);
        } else {
          dx = 0; dz = Math.sign(oz); dist = Math.max(0, Math.abs(oz) - (c.max.z - c.min.z) / 2);
        }
      }
      if (dist > hw + reach) return;

      const n = new THREE.Vector3(dx, 0, dz).normalize();
      // must be moving roughly parallel to the wall
      const tangent = new THREE.Vector3(n.z, 0, -n.x);
      const along = body.vel.x * tangent.x + body.vel.z * tangent.z;
      if (Math.abs(along) < 0.55 * hs) return;

      if (!best || dist < best.dist) best = { col: c, normal: n, dist };
    });
    if (!best) return false;

    const b: { col: Collider; normal: THREE.Vector3; dist: number } = best;
    const tangent = new THREE.Vector3(b.normal.z, 0, -b.normal.x);
    if (tangent.x * body.vel.x + tangent.z * body.vel.z < 0) tangent.negate();
    // normal points from wall toward player; wall on the right ⇒ normal ≈ -right
    const side = b.normal.x * camRight.x + b.normal.z * camRight.z >= 0 ? -1 : 1;

    const w = this.wallrun;
    w.active = true;
    w.side = side;
    w.normal.copy(b.normal);
    w.dir.copy(tangent);
    w.colliderId = b.col.id;
    w.speed = Math.max(hs, 7.4);
    w.timeLeft = Math.min(this.budget, 2.0);
    body.vel.y = Math.max(body.vel.y * 0.25, 1.4); // small lift on attach
    this.events.onWallrunStart(side);
    return true;
  }

  /**
   * Maintain the wall run: pins velocity along the wall with reduced gravity.
   * Call before the physics step; the physics step runs with noGravity/noAccel.
   */
  updateWallrun(body: BodyState, world: CollisionWorld, dt: number, jump: boolean): void {
    const w = this.wallrun;
    if (!w.active) return;

    w.timeLeft -= dt;
    this.budget -= dt;

    if (jump) {
      this.wallJump(body);
      return;
    }
    if (!this.wallStillNear(body, world) || w.timeLeft <= 0 || this.budget <= 0) {
      this.endWallrun();
      return;
    }

    body.vel.x = w.dir.x * w.speed - w.normal.x * 1.7;
    body.vel.z = w.dir.z * w.speed - w.normal.z * 1.7;
    // strongly reduced gravity with a gentle sink floor — a wall run must be
    // able to cross its gap without dropping below the landing rooftop
    body.vel.y = Math.max(body.vel.y - GRAVITY * 0.15 * dt, -0.35);
  }

  endWallrun(): void {
    const w = this.wallrun;
    if (!w.active) return;
    w.active = false;
    this.lastWallId = w.colliderId;
    this.cooldown = 0.4;
    this.events.onWallrunEnd();
  }

  private wallJump(body: BodyState): void {
    const w = this.wallrun;
    body.vel.x = w.dir.x * w.speed + w.normal.x * 4.6;
    body.vel.z = w.dir.z * w.speed + w.normal.z * 4.6;
    body.vel.y = 7.8;
    this.endWallrun();
    this.events.onWallJump();
  }

  private wallStillNear(body: BodyState, world: CollisionWorld): boolean {
    const p = body.pos;
    const hw = body.halfWidth;
    const reach = 0.9;
    const min = new THREE.Vector3(p.x - hw - reach, p.y + 0.2, p.z - hw - reach);
    const max = new THREE.Vector3(p.x + hw + reach, p.y + 1.6, p.z + hw + reach);
    let found = false;
    world.query(min, max, (c) => {
      if (c.id === this.wallrun.colliderId) {
        found = true;
        return true;
      }
    });
    return found;
  }

  /* ------------------------------- probes ------------------------------- */

  /**
   * Find a box in front of the player whose top is between
   * feet+minRise and feet+maxRise. `forward` is the horizontal look direction.
   */
  private findObstacle(
    body: BodyState,
    world: CollisionWorld,
    forward: THREE.Vector3,
    maxRise: number,
    probeDist: number,
    minRise: number,
  ): ObstacleHit | null {
    const p = body.pos;
    const hw = body.halfWidth;
    const min = new THREE.Vector3(p.x - hw - 0.05, p.y + 0.25, p.z - hw - 0.05);
    const max = new THREE.Vector3(p.x + hw + 0.05, p.y + maxRise, p.z + hw + 0.05);
    max.addScaledVector(forward, probeDist + hw);
    min.addScaledVector(forward, -0.1);

    let best: ObstacleHit | null = null;
    world.query(min, max, (c) => {
      const rise = c.max.y - p.y;
      if (rise < minRise || rise > maxRise) return;
      // face normal: which side of the box is the player approaching from?
      const cx = (c.min.x + c.max.x) / 2;
      const cz = (c.min.z + c.max.z) / 2;
      const dx = cx - p.x;
      const dz = cz - p.z;
      const normal =
        Math.abs(dx) > Math.abs(dz)
          ? new THREE.Vector3(-Math.sign(dx), 0, 0)
          : new THREE.Vector3(0, 0, -Math.sign(dz));
      if (normal.dot(forward) > -0.35) return; // must be roughly in front
      if (!best || c.max.y < best.col.max.y) best = { col: c, normal, top: c.max.y };
    });
    return best;
  }

  /**
   * Compute where the player should land after clearing `col` along `forward`.
   * Shallow obstacles are cleared fully; deep ones (building roofs) are landed on.
   */
  private landingPast(
    body: BodyState,
    world: CollisionWorld,
    col: Collider,
    forward: THREE.Vector3,
  ): THREE.Vector3 | null {
    const p = body.pos;
    const top = col.max.y;

    // entry/exit parameters of the ray p + t·forward through the box (xz slabs)
    const bounds: number[][] = [
      [col.min.x, col.max.x, p.x, forward.x],
      [col.min.z, col.max.z, p.z, forward.z],
    ];
    let t0 = -Infinity;
    let t1 = Infinity;
    for (const [mn, mx, o, d] of bounds) {
      if (Math.abs(d) < 1e-6) {
        if (o < mn || o > mx) return null;
        continue;
      }
      let a = (mn - o) / d;
      let b = (mx - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    if (t1 < t0 || t1 < 0) return null;

    const enter = Math.max(t0, 0);
    const depth = t1 - enter;
    const tExit = enter + Math.min(depth, 1.6) + 0.45;
    const end = new THREE.Vector3(p.x + forward.x * tExit, top, p.z + forward.z * tExit);

    // if there is lower ground at the exit point (e.g. a roof beyond a vent), snap to it
    const g = world.groundHeight(end.x, top + 0.05, end.z, body.halfWidth * 0.7, 2.4);
    if (g !== null && g <= top + 0.051) end.y = g;

    // verify there is standing room at the exit
    const hw = body.halfWidth;
    const min = new THREE.Vector3(end.x - hw, end.y + 0.02, end.z - hw);
    const max = new THREE.Vector3(end.x + hw, end.y + TUNING.standHeight, end.z + hw);
    if (world.overlaps(min, max)) {
      // fallback: land on top of the obstacle itself, closer to the entry edge
      const t2 = enter + Math.min(depth * 0.5, 0.6);
      const end2 = new THREE.Vector3(p.x + forward.x * t2, top, p.z + forward.z * t2);
      min.set(end2.x - hw, end2.y + 0.02, end2.z - hw);
      max.set(end2.x + hw, end2.y + TUNING.standHeight, end2.z + hw);
      if (world.overlaps(min, max)) return null;
      return end2;
    }
    return end;
  }
}
