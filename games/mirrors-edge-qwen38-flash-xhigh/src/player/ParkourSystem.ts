/**
 * ParkourSystem — wall running, vaulting, ledge mantling and ziplining.
 *
 * `update()` runs BEFORE normal player physics each fixed tick and returns
 * true when it consumed the tick (scripted or overridden movement). When the
 * player is simply grounded/airborne it returns false and the controller
 * falls back to core movement.
 *
 * Anti-exploit rules:
 *  - wall runs are time-limited (MOVE.wallRun.maxDuration)
 *  - detaching locks the exact same wall surface out for a cooldown, and any
 *    wall for a short generic window, so loops down one long wall are capped
 *  - scripted moves validate their whole path against collision before
 *    starting, so vaults can never pass through large walls
 */

import { type Vec3, clamp, pointSegmentDistSq, vec3 } from '../core/vec3.ts';
import type { CollisionWorld, WorldBox } from '../world/CollisionWorld.ts';
import { MOVE, PLAYER } from './Movement.ts';
import { type PlayerBody, accelerate, forwardVec, rightVec, stepBody } from './PlayerPhysics.ts';

export type ParkourMode = 'none' | 'wallrun' | 'vault' | 'mantle' | 'zipline';

export interface Cable {
  a: Vec3;
  b: Vec3;
}

export type ParkourEventType =
  | 'wallStart'
  | 'wallJump'
  | 'wallEnd'
  | 'vaultStart'
  | 'vaultEnd'
  | 'mantleStart'
  | 'zipGrab'
  | 'zipRelease';

export interface ParkourEvent {
  type: ParkourEventType;
  intensity?: number;
}

export interface ParkourInput {
  forward: number;
  right: number;
  sprint: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
}

interface ScriptedMove {
  start: Vec3; // feet start (snapshot)
  end: Vec3; // feet end (on landing surface)
  topClear: number; // hold height above the obstacle top
  riseEnd: number; // s at which the body is fully above the obstacle
  fallStart: number; // s at which descent begins
  duration: number;
  t: number;
  entryVel: Vec3;
  exitScale: number;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

export class ParkourSystem {
  mode: ParkourMode = 'none';
  /** -1 wall on the left, +1 on the right, 0 inactive (camera roll sign) */
  wallSide = 0;
  /** 0..1 progress of the current scripted move (for camera cues) */
  progress = 0;

  private wallNormal = vec3();
  private runDir = vec3();
  private wallBox: WorldBox | null = null;
  private wallTime = 0;
  private genericLock = 0;
  private boxLocks = new Map<WorldBox, number>();

  private script: ScriptedMove | null = null;

  private cable: Cable | null = null;
  private cableS = 0;
  private cableSpeed = 0;
  private cableTangent = vec3();
  private cableLen = 0;
  private zipLock = 0;

  reset(pos: Vec3): void {
    this.mode = 'none';
    this.wallSide = 0;
    this.progress = 0;
    this.wallBox = null;
    this.wallTime = 0;
    this.genericLock = 0;
    this.boxLocks.clear();
    this.script = null;
    this.cable = null;
    this.zipLock = 0;
    void pos;
  }

  update(
    body: PlayerBody,
    world: CollisionWorld,
    cables: Cable[],
    dt: number,
    input: ParkourInput,
    emit: (e: ParkourEvent) => void,
  ): boolean {
    this.genericLock = Math.max(0, this.genericLock - dt);
    this.zipLock = Math.max(0, this.zipLock - dt);

    switch (this.mode) {
      case 'wallrun':
        return this.updateWallRun(body, world, dt, input, emit);
      case 'vault':
      case 'mantle':
        return this.updateScripted(body, dt, emit);
      case 'zipline':
        return this.updateZip(body, dt, input, emit);
      case 'none':
        // --- opportunistic attachments, in priority order ---------------
        if (this.tryZipAttach(body, cables)) {
          emit({ type: 'zipGrab' });
          return this.updateZip(body, dt, input, emit);
        }
        if (this.tryWallAttach(body, world)) {
          emit({ type: 'wallStart' });
          return this.updateWallRun(body, world, dt, input, emit);
        }
        if (input.interactPressed) {
          if (this.tryVault(body, world, input)) {
            emit({ type: 'vaultStart' });
            return true;
          }
          if (this.tryMantle(body, world, true)) {
            emit({ type: 'mantleStart' });
            return true;
          }
        }
        // airborne auto-mantle when hands catch a ledge we cannot climb over
        if (!body.grounded && input.forward > 0.3 && this.tryMantle(body, world, false)) {
          emit({ type: 'mantleStart' });
          return true;
        }
        return false;
    }
  }

  // =====================================================================
  // Wall running
  // =====================================================================

  private tryWallAttach(body: PlayerBody, world: CollisionWorld): boolean {
    if (body.grounded || this.genericLock > 0) return false;
    const hSpeed = Math.hypot(body.vel.x, body.vel.z);
    if (hSpeed < MOVE.wallRun.minSpeed) return false;
    if (body.vel.y < -MOVE.wallRun.maxFallSpeed) return false;

    const chestY = body.pos.y + Math.min(1.25, body.height * 0.72);
    const origin = vec3(body.pos.x, chestY, body.pos.z);
    const right = rightVec(body.yaw);
    const reach = PLAYER.radius + 0.3;

    let best: { box: WorldBox; normal: Vec3; side: number } | null = null;
    for (const side of [1, -1]) {
      const dir = vec3(right.x * side, 0, right.z * side);
      const hit = world.raycast(origin, dir, reach, (b) => b.wallRun === true);
      if (!hit) continue;
      const n = hit.normal;
      if (Math.abs(n.y) > 0.3) continue; // only vertical faces
      // the surface must extend well above the chest, otherwise it is a ledge
      if (hit.box.maxY < chestY + MOVE.wallRun.minWallTopClearance) continue;
      if (hit.box.maxY <= body.pos.y + 0.35) continue;
      if ((this.boxLocks.get(hit.box) ?? 0) > body.time) continue; // cooling down
      best = { box: hit.box, normal: n, side };
      break; // first contact wins; both sides hitting simultaneously is rare
    }
    if (!best) return false;
    const { box, normal, side } = best;

    this.wallBox = box;
    this.wallNormal = normal;
    this.wallSide = side;
    this.wallTime = 0;
    this.mode = 'wallrun';

    // Velocity: project current motion along the wall plane, keep it flowing.
    const vr = vec3(body.vel.x, 0, body.vel.z);
    const n = normal;
    const dot = vr.x * n.x + vr.z * n.z;
    vr.x -= n.x * dot;
    vr.z -= n.z * dot;
    let mag = Math.hypot(vr.x, vr.z);
    if (mag < 1.5) {
      const f = forwardVec(body.yaw);
      const fd = f.x * n.x + f.z * n.z;
      vr.x = f.x - n.x * fd;
      vr.z = f.z - n.z * fd;
      mag = Math.hypot(vr.x, vr.z) || 1;
    }
    const keep = Math.max(mag, MOVE.wallRun.runSpeedKeep);
    this.runDir = vec3(vr.x / mag, 0, vr.z / mag);
    body.vel.x = this.runDir.x * keep;
    body.vel.z = this.runDir.z * keep;
    body.vel.y = Math.max(body.vel.y, 0.4);
    return true;
  }

  private updateWallRun(
    body: PlayerBody,
    world: CollisionWorld,
    dt: number,
    input: ParkourInput,
    emit: (e: ParkourEvent) => void,
  ): boolean {
    this.wallTime += dt;
    this.progress = clamp(this.wallTime / MOVE.wallRun.maxDuration, 0, 1);

    if (input.jumpPressed) {
      // jump away from the wall: keep wall-aligned speed + outward + up
      const h = Math.max(Math.hypot(body.vel.x, body.vel.z), 8.0);
      body.vel.x = this.runDir.x * h + this.wallNormal.x * MOVE.wallRun.jumpPush;
      body.vel.z = this.runDir.z * h + this.wallNormal.z * MOVE.wallRun.jumpPush;
      body.vel.y = MOVE.wallRun.jumpUp;
      this.endWallRun(MOVE.wallRun.reattachCooldown, body.time);
      emit({ type: 'wallJump' });
      return true;
    }

    // steer along the wall with forward/back input
    const wishMag = clamp(input.forward, -1, 1);
    const wish = vec3(this.runDir.x * wishMag, 0, this.runDir.z * wishMag);
    accelerate(
      body,
      wish,
      Math.max(MOVE.sprintSpeed * 0.95, Math.hypot(body.vel.x, body.vel.z)),
      30,
      dt,
    );

    // reduced gravity + stick toward the wall so collision keeps contact
    body.vel.y -= MOVE.gravity * MOVE.wallRun.gravityScale * dt;
    body.vel.y = Math.max(body.vel.y, -MOVE.wallRun.maxFallSpeed);
    body.vel.x -= this.wallNormal.x * MOVE.wallRun.stickAccel * dt;
    body.vel.z -= this.wallNormal.z * MOVE.wallRun.stickAccel * dt;

    stepBody(body, world, dt, { applyGravity: false, stepUp: false });

    if (body.grounded) {
      this.endWallRun(0, body.time); // landing on a roof ends the run cleanly
      emit({ type: 'wallEnd' });
      return false;
    }
    if (this.wallTime > MOVE.wallRun.maxDuration) {
      this.endWallRun(MOVE.wallRun.reattachCooldown * 0.6, body.time);
      emit({ type: 'wallEnd' });
      return false;
    }
    return true;
  }

  private endWallRun(lockSeconds: number, now: number): void {
    const WR = MOVE.wallRun;
    if (this.wallBox && lockSeconds > 0) {
      this.boxLocks.set(this.wallBox, now + lockSeconds);
    }
    this.mode = 'none';
    this.wallSide = 0;
    this.progress = 0;
    this.genericLock = lockSeconds > 0 ? WR.genericCooldown : 0;
    this.wallBox = null;
  }

  // =====================================================================
  // Vault & mantle (scripted traversals)
  // =====================================================================

  private tryVault(body: PlayerBody, world: CollisionWorld, input: ParkourInput): boolean {
    if (!body.grounded || input.forward <= 0.2) return false;
    const speed = Math.hypot(body.vel.x, body.vel.z);
    if (speed < 2.2) return false;
    return this.beginTraversal(body, world, MOVE.vault.minTop, MOVE.vault.maxTop, false);
  }

  private tryMantle(body: PlayerBody, world: CollisionWorld, viaInteract: boolean): boolean {
    if (body.grounded && !viaInteract) return false;
    if (body.grounded && viaInteract) return false; // E on the ground only vaults
    return this.beginTraversal(body, world, MOVE.mantle.minTop, MOVE.mantle.maxTop, true);
  }

  /**
   * Shared vault/mantle scan. Looks for an obstacle directly ahead whose top
   * sits in the legal height band, with standing room behind it, and a clear
   * parabolic path over it. Returns true and starts the scripted move.
   */
  private beginTraversal(
    body: PlayerBody,
    world: CollisionWorld,
    minTop: number,
    maxTop: number,
    allowTall: boolean,
  ): boolean {
    const f = forwardVec(body.yaw);
    const V = MOVE.vault;
    const feet = body.pos.y;

    // probe volume in front of the body, spanning the legal top band
    const px0 = Math.min(body.pos.x, body.pos.x + f.x * (V.reach + PLAYER.radius)) - PLAYER.radius;
    const px1 = Math.max(body.pos.x, body.pos.x + f.x * (V.reach + PLAYER.radius)) + PLAYER.radius;
    const pz0 = Math.min(body.pos.z, body.pos.z + f.z * (V.reach + PLAYER.radius)) - PLAYER.radius;
    const pz1 = Math.max(body.pos.z, body.pos.z + f.z * (V.reach + PLAYER.radius)) + PLAYER.radius;
    const candidates = world.query(px0, feet + 0.3, pz0, px1, feet + maxTop, pz1);

    let target: WorldBox | null = null;
    let targetTop = 0;
    let faceDist = Infinity;
    for (const b of candidates) {
      const relTop = b.maxY - feet;
      if (relTop < minTop || relTop > maxTop) continue;
      if (!allowTall && b.vaultable !== true) continue; // never climb plain walls by vault
      // distance along facing to the near face
      let dist: number;
      if (Math.abs(f.x) > Math.abs(f.z)) {
        dist = (f.x > 0 ? b.minX - body.pos.x : body.pos.x - b.maxX) / Math.abs(f.x);
      } else {
        dist = (f.z > 0 ? b.minZ - body.pos.z : body.pos.z - b.maxZ) / Math.abs(f.z);
      }
      if (dist < -PLAYER.radius || dist > V.reach + PLAYER.radius + 0.35) continue;
      if (dist < faceDist) {
        target = b;
        targetTop = b.maxY;
        faceDist = dist;
      }
    }
    if (!target) return false;

    // landing point: push past the far face of the obstacle
    const isMantleBand = targetTop - feet > V.maxTop;
    const push = isMantleBand ? MOVE.mantle.landingPush : V.landingPush;
    const depth = Math.abs(f.x) > Math.abs(f.z) ? target.maxX - target.minX : target.maxZ - target.minZ;
    const endX = body.pos.x + f.x * (faceDist + depth + push);
    const endZ = body.pos.z + f.z * (faceDist + depth + push);

    // surface behind the obstacle at roughly its top height?
    const support = world.groundHeight(vec3(endX, targetTop + 0.02, endZ), PLAYER.radius, 0.9);
    if (support === null || Math.abs(support - targetTop) > 0.65) return false;
    // standing room at the end point
    if (!world.fits(vec3(endX, support + 0.01, endZ), PLAYER.radius, PLAYER.standHeight)) return false;

    // validate the whole path
    const end = vec3(endX, support, endZ);
    const startY = feet;
    // parabola apex must clear the obstacle top; sin(pi/2)=1 at s=0.5
    const hop = clamp(targetTop + 0.18 - (startY + support) / 2, 0.14, 0.62);
    const pathClear = (s: number): boolean => {
      const y = startY + (support - startY) * s + hop * Math.sin(Math.PI * s);
      return world.fits(vec3(body.pos.x + (endX - body.pos.x) * s, y, body.pos.z + (endZ - body.pos.z) * s), PLAYER.radius, PLAYER.standHeight);
    };
    for (let i = 1; i <= 6; i++) {
      if (!pathClear(i / 7)) return false;
    }

    const isMantle = isMantleBand;
    this.mode = isMantle ? 'mantle' : 'vault';
    this.script = {
      start: vec3(body.pos.x, startY, body.pos.z),
      end,
      obstacleTop: targetTop,
      hop,
      duration: isMantle ? MOVE.mantle.duration : MOVE.vault.duration,
      t: 0,
      entryVel: vec3(body.vel.x, body.vel.y, body.vel.z),
      exitScale: isMantle ? 0.55 : 0.92,
    };
    body.height = PLAYER.standHeight;
    return true;
  }

  private updateScripted(body: PlayerBody, dt: number, emit: (e: ParkourEvent) => void): boolean {
    const sc = this.script;
    if (!sc) {
      this.mode = 'none';
      return false;
    }
    sc.t += dt;
    const s = clamp(sc.t / sc.duration, 0, 1);
    this.progress = s;
    // smoothstep for x/z, parabola-with-hop for y
    const e = s * s * (3 - 2 * s);
    body.pos.x = sc.start.x + (sc.end.x - sc.start.x) * e;
    body.pos.z = sc.start.z + (sc.end.z - sc.start.z) * e;
    body.pos.y =
      sc.start.y + (sc.end.y - sc.start.y) * s + sc.hop * Math.sin(Math.PI * s);

    if (s >= 1) {
      body.pos.y = sc.end.y + 0.01;
      body.vel.x = sc.entryVel.x * sc.exitScale;
      body.vel.z = sc.entryVel.z * sc.exitScale;
      body.vel.y = 1.6;
      const kind = this.mode;
      this.script = null;
      this.mode = 'none';
      this.progress = 0;
      void kind;
      emit({ type: 'vaultEnd' });
      return false;
    }
    return true;
  }

  // =====================================================================
  // Zipline
  // =====================================================================

  private tryZipAttach(body: PlayerBody, cables: Cable[]): boolean {
    if (body.grounded || this.zipLock > 0 || cables.length === 0) return false;
    const grab = vec3(body.pos.x, body.pos.y + MOVE.zip.handHeight, body.pos.z);
    for (const c of cables) {
      const { t } = pointSegmentDistSq(grab, c.a, c.b);
      if (t < 0.015 || t > 0.965) continue;
      const px = c.a.x + (c.b.x - c.a.x) * t;
      const py = c.a.y + (c.b.y - c.a.y) * t;
      const pz = c.a.z + (c.b.z - c.a.z) * t;
      const dx = px - grab.x;
      const dy = py - grab.y;
      const dz = pz - grab.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= MOVE.zip.attachDist && dy >= -0.1) {
        this.cable = c;
        this.cableS = t;
        const len = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y, c.b.z - c.a.z);
        this.cableLen = len;
        this.cableTangent = vec3((c.b.x - c.a.x) / len, (c.b.y - c.a.y) / len, (c.b.z - c.a.z) / len);
        const entry = Math.hypot(body.vel.x, body.vel.z);
        this.cableSpeed = clamp(Math.max(entry, MOVE.zip.startSpeed), MOVE.zip.startSpeed, MOVE.zip.maxSpeed);
        this.mode = 'zipline';
        body.height = PLAYER.standHeight;
        // hang pose: hands on the cable
        body.pos.x = px;
        body.pos.y = py - MOVE.zip.handHeight;
        body.pos.z = pz;
        return true;
      }
    }
    return false;
  }

  private updateZip(body: PlayerBody, dt: number, input: ParkourInput, emit: (e: ParkourEvent) => void): boolean {
    const c = this.cable;
    if (!c) {
      this.mode = 'none';
      return false;
    }
    this.cableSpeed = Math.min(this.cableSpeed + MOVE.zip.accel * dt, MOVE.zip.maxSpeed);
    this.cableS += (this.cableSpeed * dt) / this.cableLen;
    this.progress = this.cableS;

    const t = this.cableS;
    body.pos.x = c.a.x + (c.b.x - c.a.x) * t;
    body.pos.y = c.a.y + (c.b.y - c.a.y) * t - MOVE.zip.handHeight;
    body.pos.z = c.a.z + (c.b.z - c.a.z) * t;
    body.vel.x = this.cableTangent.x * this.cableSpeed;
    body.vel.y = this.cableTangent.y * this.cableSpeed;
    body.vel.z = this.cableTangent.z * this.cableSpeed;

    if (input.jumpPressed || t >= 1) {
      const up = input.jumpPressed ? MOVE.zip.jumpReleaseUp : MOVE.zip.endReleaseUp;
      body.vel.y = this.cableTangent.y * this.cableSpeed + up;
      body.vel.x = this.cableTangent.x * this.cableSpeed;
      body.vel.z = this.cableTangent.z * this.cableSpeed;
      this.zipLock = MOVE.zip.reattachLock;
      this.cable = null;
      this.mode = 'none';
      this.progress = 0;
      emit({ type: 'zipRelease', intensity: this.cableSpeed });
      return false;
    }
    return true;
  }
}
