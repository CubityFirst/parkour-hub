import { Vector3 } from 'three';
import type { AABB, Collider, CollisionWorld } from '../world/CollisionWorld';

/**
 * Movement tuning. Units are metres and seconds.
 *
 * Reference numbers for level design (flat ground, full jump):
 *  - apex height            ~1.2 m
 *  - air time               ~0.58 s
 *  - sprint jump distance   ~6.4 m  (running ~4.1 m)
 *  - wall run               ~1.4 s, ~14 m of travel
 */
export const PHYS = {
  fixedStep: 1 / 120,

  radius: 0.3,
  standHeight: 1.8,
  crouchHeight: 0.9,
  eyeStand: 1.62,
  eyeCrouch: 0.72,
  stepHeight: 0.42,
  groundSnap: 0.3,

  gravity: 24,
  fallGravityMult: 1.45,
  jumpCutGravityMult: 2.6,
  maxFallSpeed: 48,
  jumpSpeed: 7.6,
  coyoteTime: 0.12,
  jumpBuffer: 0.13,

  walkSpeed: 7,
  sprintSpeed: 11,
  crouchSpeed: 3.2,
  groundAccel: 55,
  sprintAccel: 13,
  groundSteer: 60,
  groundFriction: 42,
  overspeedDecel: 5,

  airAccel: 14,
  /** Air acceleration only adds speed along the wish direction up to this. */
  airWishCap: 4.5,
  /** Max rate (rad/s) strafe keys can bend the direction of travel in the air. */
  airTurnRate: 1.4,

  slideMinSpeed: 5.2,
  slideBoost: 1.6,
  slideMaxSpeed: 14,
  slideFriction: 6.6,
  slideEndSpeed: 3.6,
  slideSteer: 1.6,

  wallRunMinSpeed: 6.2,
  wallRunProbe: 1.1,
  wallRunMaxTime: 1.45,
  wallRunGravity: 6.4,
  wallRunLateGravity: 22,
  wallRunEnterVyMin: 1.6,
  wallRunEnterVyMax: 4.4,
  wallRunMinRunSpeed: 8.5,
  wallRunMaxRunSpeed: 12.5,
  wallJumpOut: 6.2,
  wallJumpUp: 6.2,
  /** Seconds after a wall jump during which air steering is disabled, so the kick carries. */
  wallJumpLock: 0.4,
  /** How far a wall jump looks for a wall to aim at (canyon width). */
  wallJumpAssistRange: 7,
  /** Vertical speed is eased (not snapped) into range when a wall run starts. */
  wallRunGrip: 30,
  /** Max |cos| between travel direction and wall normal when latching on. */
  wallRunMaxApproach: 0.8,

  hardLandingSpeed: 15,
};

export interface WallContact {
  nx: number;
  nz: number;
  collider: Collider;
}

/** A vertical box that moves through the collision world. Position = feet centre. */
export class KinematicBody {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  height: number = PHYS.standHeight;

  grounded = false;
  hitCeiling = false;
  /** Vertical speed at the moment of the last landing (negative). */
  landingSpeed = 0;
  readonly walls: WallContact[] = [];

  aabb(out: AABB = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }, height = this.height): AABB {
    const r = PHYS.radius;
    out.minX = this.pos.x - r;
    out.maxX = this.pos.x + r;
    out.minY = this.pos.y;
    out.maxY = this.pos.y + height;
    out.minZ = this.pos.z - r;
    out.maxZ = this.pos.z + r;
    return out;
  }
}

const EPS = 1e-4;
const MAX_SUBSTEP = 0.12;
const tmpBox: AABB = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

export interface MoveOptions {
  /** Allow walking up small steps (only when on the ground). */
  stepUp: boolean;
  /** Keep the body glued to the floor when walking down small steps. */
  snapToGround: boolean;
}

/**
 * Moves the body by vel*dt, resolving collisions axis by axis.
 * Large motions are split into substeps no longer than MAX_SUBSTEP so that
 * fast movement cannot tunnel through thin geometry.
 */
export function moveAndCollide(world: CollisionWorld, body: KinematicBody, dt: number, opts: MoveOptions): void {
  const wasGrounded = body.grounded;
  body.grounded = false;
  body.hitCeiling = false;
  body.walls.length = 0;

  const mx = body.vel.x * dt;
  const my = body.vel.y * dt;
  const mz = body.vel.z * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my), Math.abs(mz)) / MAX_SUBSTEP));
  const canStep = opts.stepUp && wasGrounded;

  for (let i = 0; i < steps; i++) {
    moveAxis(world, body, 1, my / steps, false);
    moveAxis(world, body, 0, mx / steps, canStep || body.grounded);
    moveAxis(world, body, 2, mz / steps, canStep || body.grounded);
  }

  // Walking down stairs / off tiny ledges: stay on the ground instead of
  // launching into a short fall every frame.
  if (!body.grounded && wasGrounded && opts.snapToGround && body.vel.y <= 0) {
    const top = world.groundHeight(body.pos.x, body.pos.z, PHYS.radius - 0.02, body.pos.y - PHYS.groundSnap, body.pos.y + EPS);
    if (top > -Infinity) {
      tmpBox.minX = body.pos.x - PHYS.radius;
      tmpBox.maxX = body.pos.x + PHYS.radius;
      tmpBox.minZ = body.pos.z - PHYS.radius;
      tmpBox.maxZ = body.pos.z + PHYS.radius;
      tmpBox.minY = top + EPS;
      tmpBox.maxY = top + EPS + body.height;
      if (world.isFree(tmpBox)) {
        body.pos.y = top + EPS;
        body.vel.y = 0;
        body.grounded = true;
      }
    }
  }
}

function axisGet(v: Vector3, axis: number): number {
  return axis === 0 ? v.x : axis === 1 ? v.y : v.z;
}

function axisSet(v: Vector3, axis: number, value: number): void {
  if (axis === 0) v.x = value;
  else if (axis === 1) v.y = value;
  else v.z = value;
}

function boxMin(c: AABB, axis: number): number {
  return axis === 0 ? c.minX : axis === 1 ? c.minY : c.minZ;
}

function boxMax(c: AABB, axis: number): number {
  return axis === 0 ? c.maxX : axis === 1 ? c.maxY : c.maxZ;
}

function moveAxis(world: CollisionWorld, body: KinematicBody, axis: number, delta: number, allowStep: boolean): void {
  if (delta === 0) return;
  const r = PHYS.radius;
  const lowExt = axis === 1 ? 0 : r; // extent below/behind the position on this axis
  const highExt = axis === 1 ? body.height : r;
  const before = axisGet(body.pos, axis);
  const prevLow = before - lowExt;
  const prevHigh = before + highExt;

  axisSet(body.pos, axis, before + delta);
  const hits = world.query(body.aabb(tmpBox));
  if (hits.length === 0) return;

  let limit = delta > 0 ? Infinity : -Infinity;
  let blocking: Collider | null = null;
  let stepTop = -Infinity;
  let stepPossible = allowStep && axis !== 1;

  for (const c of hits) {
    // Ignore colliders we were already inside before this move: pushing out
    // of them along this axis could teleport the player. They resolve on
    // whichever axis actually entered them.
    if (delta > 0 ? prevHigh > boxMin(c, axis) + EPS * 10 : prevLow < boxMax(c, axis) - EPS * 10) continue;

    if (stepPossible) {
      const rise = c.maxY - body.pos.y;
      if (rise > 0 && rise <= PHYS.stepHeight) stepTop = Math.max(stepTop, c.maxY);
      else stepPossible = false;
    }
    if (delta > 0) {
      const p = boxMin(c, axis) - highExt - EPS;
      if (p < limit) {
        limit = p;
        blocking = c;
      }
    } else {
      const p = boxMax(c, axis) + lowExt + EPS;
      if (p > limit) {
        limit = p;
        blocking = c;
      }
    }
  }
  if (!blocking) return;

  // Small obstacle while on the ground: step on top of it if there is room.
  if (stepPossible && stepTop > -Infinity) {
    const oldY = body.pos.y;
    body.pos.y = stepTop + EPS;
    if (world.isFree(body.aabb(tmpBox))) {
      body.grounded = true;
      return;
    }
    body.pos.y = oldY;
  }

  axisSet(body.pos, axis, limit);
  if (axis === 1) {
    if (delta < 0) {
      if (!body.grounded) body.landingSpeed = body.vel.y;
      body.grounded = true;
    } else {
      body.hitCeiling = true;
    }
    if ((delta < 0 && body.vel.y < 0) || (delta > 0 && body.vel.y > 0)) body.vel.y = 0;
  } else {
    const n = delta > 0 ? -1 : 1;
    body.walls.push({ nx: axis === 0 ? n : 0, nz: axis === 2 ? n : 0, collider: blocking });
    if (axis === 0) body.vel.x = 0;
    else body.vel.z = 0;
  }
}

/** Is there room for the body at a given height (e.g. to stand up)? */
export function hasRoom(world: CollisionWorld, pos: Vector3, height: number): boolean {
  const r = PHYS.radius;
  tmpBox.minX = pos.x - r;
  tmpBox.maxX = pos.x + r;
  tmpBox.minY = pos.y + EPS;
  tmpBox.maxY = pos.y + height;
  tmpBox.minZ = pos.z - r;
  tmpBox.maxZ = pos.z + r;
  return world.isFree(tmpBox);
}
