import * as THREE from 'three';
import { Collider, CollisionWorld } from '../world/CollisionWorld';

/**
 * Movement tuning. All values in meters / seconds.
 *
 * Reference jump math (sprint speed 9.6, jump velocity 8.4, gravity 24):
 *  - jump height ≈ 1.47 m   → vaultable obstacles ~1.0–1.3 m
 *  - same-level sprint-jump range ≈ 6.7 m → designed gaps ≤ 5 m
 */
export const TUNING = {
  walkSpeed: 6.0,
  sprintSpeed: 9.6,
  accel: 55,
  airAccel: 14,
  friction: 9,
  slideFriction: 0.55,
  gravity: 24,
  jumpVelocity: 8.4,
  stepHeight: 0.46,
  playerWidth: 0.62,
  standHeight: 1.8,
  slideHeight: 0.95,
  eyeStand: 1.62,
  eyeSlide: 0.8,
} as const;

export interface MoveWish {
  /** Normalized horizontal wish direction, or zero vector. */
  dir: THREE.Vector3;
  sprint: boolean;
}

export interface StepFlags {
  noGravity?: boolean;
  noFriction?: boolean;
  noAccel?: boolean;
  sliding?: boolean;
}

export interface StepResult {
  landed: boolean;
  fallSpeed: number;
  hitHead: boolean;
  blockedHorizontal: boolean;
}

export interface BodyState {
  /** Feet-center position. */
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  halfWidth: number;
  height: number;
  grounded: boolean;
}

const EPS = 0.001;

function aabbOverlap(min: THREE.Vector3, max: THREE.Vector3, c: Collider): boolean {
  return (
    min.x < c.max.x && max.x > c.min.x &&
    min.y < c.max.y && max.y > c.min.y &&
    min.z < c.max.z && max.z > c.min.z
  );
}

/**
 * Quake-flavored movement: friction + accelerate, per-axis integration
 * against the AABB world, with a small step-up allowance for curbs/parapets.
 */
export class PlayerPhysics {
  step(body: BodyState, wish: MoveWish, dt: number, world: CollisionWorld, flags: StepFlags = {}): StepResult {
    const v = body.vel;
    const wasGrounded = body.grounded;
    const fallBefore = Math.max(0, -v.y);

    // ---- horizontal friction
    const speed = Math.hypot(v.x, v.z);
    if (!flags.noFriction && body.grounded && speed > 0.0001) {
      const f = flags.sliding ? TUNING.slideFriction : TUNING.friction;
      const control = Math.max(speed, 1.4);
      const drop = control * f * dt;
      const ns = Math.max(0, speed - drop) / speed;
      v.x *= ns;
      v.z *= ns;
    }

    // ---- acceleration toward the wish direction (capped along that axis)
    if (!flags.noAccel && wish.dir.lengthSq() > 0.0001) {
      const maxSpeed = wish.sprint || flags.sliding ? TUNING.sprintSpeed : TUNING.walkSpeed;
      const accel = body.grounded ? (flags.sliding ? TUNING.accel * 0.12 : TUNING.accel) : TUNING.airAccel;
      const cur = v.x * wish.dir.x + v.z * wish.dir.z;
      const add = maxSpeed - cur;
      if (add > 0) {
        const a = Math.min(accel * dt * maxSpeed, add);
        v.x += wish.dir.x * a;
        v.z += wish.dir.z * a;
      }
    }

    // ---- gravity (and a small stick force that keeps ground contact stable)
    if (!flags.noGravity) {
      v.y -= TUNING.gravity * dt;
      if (body.grounded && v.y <= 0) v.y = Math.max(v.y, -2.5);
      if (v.y < -42) v.y = -42;
    }

    // ---- integrate & resolve, one axis at a time
    let blocked = this.moveAxis(body, world, 'x', v.x * dt);
    blocked = this.moveAxis(body, world, 'z', v.z * dt) || blocked;
    const yRes = this.moveVertical(body, world, v.y * dt);

    // small snap-down keeps the player glued when walking over tiny dips
    if (!body.grounded && v.y <= 0.01 && wasGrounded && !flags.noGravity) {
      const g = world.groundHeight(body.pos.x, body.pos.y, body.pos.z, body.halfWidth * 0.75, 0.16);
      if (g !== null && body.pos.y - g <= 0.16) {
        body.pos.y = g;
        v.y = 0;
        body.grounded = true;
      }
    }

    return {
      landed: !wasGrounded && body.grounded,
      fallSpeed: fallBefore,
      hitHead: yRes.hitHead,
      blockedHorizontal: blocked,
    };
  }

  private makeBox(body: BodyState, min: THREE.Vector3, max: THREE.Vector3): void {
    min.set(body.pos.x - body.halfWidth, body.pos.y, body.pos.z - body.halfWidth);
    max.set(body.pos.x + body.halfWidth, body.pos.y + body.height, body.pos.z + body.halfWidth);
  }

  /** Move along one horizontal axis, resolving penetration. Includes step-up. */
  private moveAxis(body: BodyState, world: CollisionWorld, axis: 'x' | 'z', delta: number): boolean {
    if (delta === 0) return false;
    const p = body.pos;
    p[axis] += delta;

    const min = new THREE.Vector3();
    const max = new THREE.Vector3();
    this.makeBox(body, min, max);

    const hits: Collider[] = [];
    world.query(min, max, (c) => {
      hits.push(c);
    });

    let blocked = false;
    for (const c of hits) {
      if (!aabbOverlap(min, max, c)) continue;

      // step-up: low curbs / parapets / small debris while grounded
      if (body.grounded) {
        const rise = c.max.y - p.y;
        if (rise > EPS && rise <= TUNING.stepHeight) {
          const ySave = p.y;
          p.y = c.max.y + EPS;
          this.makeBox(body, min, max);
          if (!world.overlaps(min, max)) continue; // stepped up successfully
          p.y = ySave;
          this.makeBox(body, min, max);
        }
      }

      if (delta > 0) p[axis] = c.min[axis] - body.halfWidth - EPS;
      else p[axis] = c.max[axis] + body.halfWidth + EPS;
      body.vel[axis] = 0;
      blocked = true;
      this.makeBox(body, min, max);
    }
    return blocked;
  }

  /** Vertical move: land on floors, bonk on ceilings. */
  private moveVertical(body: BodyState, world: CollisionWorld, delta: number): { hitHead: boolean } {
    const p = body.pos;
    const prevBottom = p.y;
    const prevTop = p.y + body.height;
    p.y += delta;
    body.grounded = false;

    const min = new THREE.Vector3();
    const max = new THREE.Vector3();
    this.makeBox(body, min, max);

    let hitHead = false;
    if (delta <= 0) {
      // highest floor top we were above before this move
      let floorTop = -Infinity;
      world.query(min, max, (c) => {
        if (c.max.y <= prevBottom + 0.02 && c.max.y > floorTop) floorTop = c.max.y;
      });
      if (floorTop > -Infinity) {
        p.y = floorTop;
        body.vel.y = 0;
        body.grounded = true;
      }
    } else {
      // lowest ceiling bottom we were below before this move
      let ceilBottom = Infinity;
      world.query(min, max, (c) => {
        if (c.min.y >= prevTop - 0.02 && c.min.y < ceilBottom) ceilBottom = c.min.y;
      });
      if (ceilBottom < Infinity) {
        p.y = ceilBottom - body.height - EPS;
        body.vel.y = 0;
        hitHead = true;
      }
    }
    return { hitHead };
  }
}
