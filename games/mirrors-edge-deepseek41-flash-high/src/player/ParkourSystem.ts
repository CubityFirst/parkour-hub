import * as THREE from 'three';
import type { Collider, CollisionWorld } from '../world/CollisionWorld';

const STAND_HEIGHT = 1.8;

export interface ParkourPlayer {
  /** Feet position. */
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  height: number;
  grounded: boolean;
  sliding: boolean;
  yaw: number;
  wallRunning: boolean;
  /** -1 = wall on the left of the screen, 1 = wall on the right. */
  wallSide: -1 | 0 | 1;
  wallNormalX: number;
  wallNormalZ: number;
  forwardX: number;
  forwardZ: number;
}

type ActionKind = 'vault' | 'mantle';

interface ParkourAction {
  kind: ActionKind;
  time: number;
  duration: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  arc: number;
  exitSpeed: number;
}

export interface WallRunUpdate {
  ended: boolean;
  jumped: boolean;
}

/**
 * Sliding, wall running, vaulting and ledge mantling all live here.  The
 * controller owns acceleration and gravity; this system overrides movement
 * where a special move is active.
 */
export class ParkourSystem {
  wallRunCooldown = 0;
  mantleCooldown = 0;
  wallRunTimer = 0;
  wallRunSpeed = 0;

  private activeAction: ParkourAction | null = null;
  private readonly probeHits: Collider[] = [];

  constructor(private readonly world: CollisionWorld) {}

  get isBusy(): boolean {
    return this.activeAction !== null;
  }

  get isVaulting(): boolean {
    return this.activeAction?.kind === 'vault';
  }

  get isMantling(): boolean {
    return this.activeAction?.kind === 'mantle';
  }

  reset(): void {
    this.activeAction = null;
    this.wallRunCooldown = 0;
    this.mantleCooldown = 0;
    this.wallRunTimer = 0;
  }

  tickCooldowns(dt: number): void {
    this.wallRunCooldown = Math.max(0, this.wallRunCooldown - dt);
    this.mantleCooldown = Math.max(0, this.mantleCooldown - dt);
  }

  // --------------------------------------------------------------- wall run

  /**
   * Looks for a red wall next to the player and begins a wall run when the
   * movement conditions are met.  Returns true when a run starts.
   */
  tryStartWallRun(p: ParkourPlayer): boolean {
    if (p.grounded || p.sliding || p.wallRunning || this.isBusy) return false;
    if (this.wallRunCooldown > 0) return false;
    if (p.velocity.y < -10) return false;

    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    if (speed < 6.4) return false;

    // Probe to the camera's left and right.
    const rightX = Math.cos(p.yaw);
    const rightZ = -Math.sin(p.yaw);

    let best = null as ReturnType<CollisionWorld['findWall']>;
    let bestSide: -1 | 1 = 1;
    for (const side of [1, -1] as const) {
      const hit = this.world.findWall(
        p.position.x,
        p.position.y,
        p.position.z,
        p.radius,
        p.height,
        rightX * side,
        rightZ * side,
        0.66,
      );
      if (hit && hit.distance <= 0.66) {
        // Prefer the wall that is closer.
        if (!best || hit.distance < best.distance) {
          best = hit;
          bestSide = side;
        }
      }
    }
    if (!best) return false;

    // Tangent along the wall in the direction of travel.
    let tanX = 0;
    let tanZ = 0;
    if (best.normalX !== 0) {
      tanZ = p.velocity.z >= 0 ? 1 : -1;
      if (Math.abs(p.velocity.z) < 3.5) tanZ = p.forwardZ >= 0 ? 1 : -1;
    } else {
      tanX = p.velocity.x >= 0 ? 1 : -1;
      if (Math.abs(p.velocity.x) < 3.5) tanX = p.forwardX >= 0 ? 1 : -1;
    }
    const along = p.velocity.x * tanX + p.velocity.z * tanZ;
    if (along < 5) return false;

    this.wallRunTimer = 0;
    this.wallRunSpeed = Math.min(Math.max(speed * 1.05, 11.5), 14.2);

    p.wallRunning = true;
    p.wallSide = bestSide;
    p.wallNormalX = best.normalX;
    p.wallNormalZ = best.normalZ;

    p.velocity.x = tanX * this.wallRunSpeed;
    p.velocity.z = tanZ * this.wallRunSpeed;
    p.velocity.y = Math.max(p.velocity.y, 1.15);

    // Snap neatly to the wall surface.
    if (best.normalX !== 0) {
      p.position.x = best.faceX + best.normalX * (p.radius + 0.015);
    } else {
      p.position.z = best.faceZ + best.normalZ * (p.radius + 0.015);
    }
    return true;
  }

  /** Keeps the player glued to the wall and handles jumping off. */
  updateWallRun(p: ParkourPlayer, jumpPressed: boolean, dt: number): WallRunUpdate {
    if (!p.wallRunning) return { ended: false, jumped: false };

    this.wallRunTimer += dt;
    const maxDuration = 1.6;
    if (this.wallRunTimer > maxDuration) {
      this.stopWallRun(p);
      return { ended: true, jumped: false };
    }

    // Is the wall still there?  Probe back towards it.
    const hit = this.world.findWall(
      p.position.x,
      p.position.y,
      p.position.z,
      p.radius,
      p.height,
      -p.wallNormalX,
      -p.wallNormalZ,
      0.85,
    );
    if (!hit) {
      this.stopWallRun(p);
      return { ended: true, jumped: false };
    }

    // Stay exactly beside the wall surface.
    if (p.wallNormalX !== 0) {
      p.position.x = hit.faceX + p.wallNormalX * (p.radius + 0.015);
    } else {
      p.position.z = hit.faceZ + p.wallNormalZ * (p.radius + 0.015);
    }

    // Keep a minimum forward speed while on the wall.
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    if (speed < this.wallRunSpeed) {
      const scale = this.wallRunSpeed / Math.max(speed, 0.001);
      p.velocity.x *= scale;
      p.velocity.z *= scale;
    }
    p.velocity.y = Math.max(-2.2, Math.min(p.velocity.y, 3.0));

    if (jumpPressed) {
      // Kick away from the wall, preserving (and slightly boosting) speed.
      p.velocity.x += p.wallNormalX * 4.6;
      p.velocity.z += p.wallNormalZ * 4.6;
      p.velocity.y = 7.6;
      p.wallRunning = false;
      p.wallSide = 0;
      this.wallRunCooldown = 0.45;
      this.wallRunTimer = 0;
      return { ended: true, jumped: true };
    }

    return { ended: false, jumped: false };
  }

  stopWallRun(p: ParkourPlayer): void {
    if (!p.wallRunning) return;
    p.wallRunning = false;
    p.wallSide = 0;
    this.wallRunCooldown = 0.5;
    this.wallRunTimer = 0;
  }

  // ------------------------------------------------------------------ vault

  /** Returns true when a vault was started. */
  tryVault(p: ParkourPlayer): boolean {
    if (this.isBusy || p.sliding || p.wallRunning) return false;

    const fX = p.forwardX;
    const fZ = p.forwardZ;
    const probeX = p.position.x + fX * (p.radius + 0.45);
    const probeZ = p.position.z + fZ * (p.radius + 0.45);

    this.world.query(
      probeX - 0.35,
      p.position.y + 0.2,
      probeZ - 0.35,
      probeX + 0.35,
      p.position.y + 1.25,
      probeZ + 0.35,
      this.probeHits,
    );

    let candidate: Collider | null = null;
    let exitDistance = 0;
    let top = 0;

    for (const c of this.probeHits) {
      const vaultableSurface =
        c.vaultable || (c.tag === 'obstacle' && c.maxY - p.position.y <= 1.25);
      if (!vaultableSurface || c.wallRunnable) continue;

      const h = c.maxY - p.position.y;
      if (h < 0.25 || h > 1.22) continue;

      // Must be in front of the player.
      const dx = (c.minX + c.maxX) / 2 - p.position.x;
      const dz = (c.minZ + c.maxZ) / 2 - p.position.z;
      const forwardDot = dx * fX + dz * fZ;
      if (forwardDot < 0.1) continue;

      // Distance needed to clear the obstacle along the dominant axis.
      let dist: number;
      if (Math.abs(fZ) >= Math.abs(fX)) {
        const far = fZ > 0 ? c.maxZ : c.minZ;
        dist = (far - p.position.z) / (fZ || 1) + 0.8;
      } else {
        const far = fX > 0 ? c.maxX : c.minX;
        dist = (far - p.position.x) / (fX || 1) + 0.8;
      }
      if (dist < 0.35 || dist > 3.0) continue;

      const targetY = c.maxY + 0.03;
      const tx = p.position.x + fX * dist;
      const tz = p.position.z + fZ * dist;
      if (!this.isFree(tx, targetY, tz, p.radius, STAND_HEIGHT)) continue;
      if (!this.hasHeadroom(tx, targetY, tz, p.radius)) continue;

      candidate = c;
      exitDistance = dist;
      top = targetY;
      break;
    }

    if (!candidate) return false;

    const speed = Math.max(Math.hypot(p.velocity.x, p.velocity.z), 4.0);
    this.activeAction = {
      kind: 'vault',
      time: 0,
      duration: 0.28 + Math.min(exitDistance, 2.4) * 0.055,
      from: p.position.clone(),
      to: new THREE.Vector3(p.position.x + fX * exitDistance, top, p.position.z + fZ * exitDistance),
      arc: 0.42,
      exitSpeed: Math.max(speed, 6.0),
    };

    p.height = STAND_HEIGHT;
    p.sliding = false;
    p.velocity.y = 0;
    return true;
  }

  // ----------------------------------------------------------------- mantle

  /** Starts a mantle when the player is hanging just below a reachable ledge. */
  tryMantle(p: ParkourPlayer, wantsMantle: boolean): boolean {
    if (!wantsMantle || p.grounded || p.wallRunning || this.isBusy || this.mantleCooldown > 0) {
      return false;
    }
    if (p.velocity.y > 2.5) return false;

    const fX = p.forwardX;
    const fZ = p.forwardZ;
    const probeX = p.position.x + fX * (p.radius + 0.3);
    const probeZ = p.position.z + fZ * (p.radius + 0.3);

    this.world.query(
      probeX - 0.25,
      p.position.y + 0.1,
      probeZ - 0.25,
      probeX + 0.25,
      p.position.y + 1.3,
      probeZ + 0.25,
      this.probeHits,
    );

    let best: Collider | null = null;
    for (const c of this.probeHits) {
      if (c.wallRunnable) continue;
      const h = c.maxY - p.position.y;
      if (h < 0.12 || h > 1.32) continue;
      if (!best || c.maxY > best.maxY) best = c;
    }
    if (!best) return false;

    const targetY = best.maxY + 0.03;
    const dist = p.radius + 0.75;
    const tx = p.position.x + fX * dist;
    const tz = p.position.z + fZ * dist;
    if (!this.isFree(tx, targetY, tz, p.radius, STAND_HEIGHT)) return false;
    if (!this.hasHeadroom(tx, targetY, tz, p.radius)) return false;

    this.activeAction = {
      kind: 'mantle',
      time: 0,
      duration: 0.34,
      from: p.position.clone(),
      to: new THREE.Vector3(tx, targetY, tz),
      arc: 0.08,
      exitSpeed: Math.max(Math.hypot(p.velocity.x, p.velocity.z), 3.0),
    };
    p.height = STAND_HEIGHT;
    p.sliding = false;
    p.velocity.y = 0;
    return true;
  }

  /**
   * Advances vault / mantle motion.  Returns true while an action is active.
   */
  updateAction(p: ParkourPlayer, dt: number): boolean {
    const action = this.activeAction;
    if (!action) return false;

    action.time += dt;
    const t = Math.min(action.time / action.duration, 1);
    // Smooth acceleration and deceleration across the obstacle.
    const s = t * t * (3 - 2 * t);

    p.position.x = action.from.x + (action.to.x - action.from.x) * s;
    p.position.z = action.from.z + (action.to.z - action.from.z) * s;
    p.position.y = action.from.y + (action.to.y - action.from.y) * s + Math.sin(t * Math.PI) * action.arc;

    if (t >= 1) {
      p.position.copy(action.to);
      p.velocity.y = 0;
      p.grounded = false;
      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      if (speed < action.exitSpeed) {
        const fX = p.forwardX;
        const fZ = p.forwardZ;
        p.velocity.x = fX * action.exitSpeed;
        p.velocity.z = fZ * action.exitSpeed;
      }
      if (action.kind === 'mantle') this.mantleCooldown = 0.45;
      this.activeAction = null;
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- helpers

  private isFree(x: number, y: number, z: number, radius: number, height: number): boolean {
    return !this.world.overlaps(
      x - radius + 0.01,
      y + 0.02,
      z - radius + 0.01,
      x + radius - 0.01,
      y + height - 0.02,
      z + radius - 0.01,
    );
  }

  private hasHeadroom(x: number, y: number, z: number, radius: number): boolean {
    return !this.world.overlaps(
      x - radius + 0.02,
      y + height_epsilon,
      z - radius + 0.02,
      x + radius - 0.02,
      y + STAND_HEIGHT + 0.2,
      z + radius - 0.02,
    );
  }

  /** Horizontal direction of travel, used by vault/mantle and the controller. */
  static forward(yaw: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    return out;
  }
}

const height_epsilon = 0.05;
