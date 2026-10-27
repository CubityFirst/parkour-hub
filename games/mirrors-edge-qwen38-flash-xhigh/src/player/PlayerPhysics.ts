/**
 * Core player body + ground/air physics primitives.
 *
 * DOM- and three-free on purpose: the level-verification bot (verify/) drives
 * these exact functions headlessly, guaranteeing that what ships playable is
 * what was proven completable.
 *
 * Model: an axis-aligned "square-rounded" capsule (AABB with half-width
 * `radius` and height `height`), feet-origin position. Acceleration is
 * Quake-style: friction first when there is no input, otherwise accelerate
 * toward the wish velocity with a cap — this gives snappy control at sprint
 * speed while preserving momentum through turns and jumps.
 */

import { type Vec3, clamp, vec3 } from '../core/vec3.ts';
import { type MoveFlags, CollisionWorld } from '../world/CollisionWorld.ts';
import { MOVE, PLAYER } from './Movement.ts';

export interface PlayerBody {
  /** feet position */
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  /** active collision height (PLAYER.standHeight | slideHeight) */
  height: number;
  grounded: boolean;
  /** set when the last horizontal move was blocked: outward surface normal */
  blockedNormal: Vec3 | null;
  /** true if the last move had its +Y clamped */
  touchedCeiling: boolean;
  /** simulation clock, seconds */
  time: number;
}

export function createBody(spawn: { pos: Vec3; yaw: number }): PlayerBody {
  return {
    pos: vec3(spawn.pos.x, spawn.pos.y, spawn.pos.z),
    vel: vec3(),
    yaw: spawn.yaw,
    pitch: -0.04,
    height: PLAYER.standHeight,
    grounded: false,
    blockedNormal: null,
    touchedCeiling: false,
    time: 0,
  };
}

/** Unit forward vector for a yaw (yaw 0 faces -Z, matching three.js camera). */
export function forwardVec(yaw: number): Vec3 {
  return vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

/** Unit right vector for a yaw. */
export function rightVec(yaw: number): Vec3 {
  return vec3(Math.cos(yaw), 0, -Math.sin(yaw));
}

export function wishDirection(yaw: number, forward: number, right: number): { dir: Vec3; magnitude: number } {
  const f = forwardVec(yaw);
  const r = rightVec(yaw);
  let x = f.x * forward + r.x * right;
  let z = f.z * forward + r.z * right;
  const mag = Math.hypot(x, z);
  if (mag < 1e-6) return { dir: vec3(), magnitude: 0 };
  x /= mag;
  z /= mag;
  return { dir: vec3(x, 0, z), magnitude: clamp(Math.hypot(forward, right), 0, 1) };
}

const speedXZ = (b: PlayerBody) => Math.hypot(b.vel.x, b.vel.z);

/** Quake-style ground acceleration toward a wish velocity. */
export function accelerate(body: PlayerBody, wish: Vec3, wishSpeed: number, accel: number, dt: number): void {
  const currentAdd = wish.x * body.vel.x + wish.z * body.vel.z;
  const add = Math.max(wishSpeed - currentAdd, 0);
  const acc = Math.min(accel * wishSpeed * dt, add);
  if (acc <= 0) return;
  body.vel.x += wish.x * acc;
  body.vel.z += wish.z * acc;
}

/** Exponential velocity decay used as friction when there is no input. */
export function applyFriction(body: PlayerBody, dt: number): void {
  const speed = speedXZ(body);
  if (speed < 0.01) {
    body.vel.x = 0;
    body.vel.z = 0;
    return;
  }
  const drop = speed * MOVE.groundDecel * dt;
  const scale = Math.max(speed - drop, 0) / speed;
  body.vel.x *= scale;
  body.vel.z *= scale;
}

/** Slide friction: gentler decay along the current direction of travel. */
export function applySlideFriction(body: PlayerBody, dt: number): void {
  const speed = speedXZ(body);
  if (speed < 0.01) return;
  const drop = Math.min(speed, MOVE.slide.friction * dt);
  const scale = (speed - drop) / speed;
  body.vel.x *= scale;
  body.vel.z *= scale;
}

export interface StepOptions {
  wish?: Vec3;
  wishSpeed?: number;
  accel?: number;
  friction?: boolean;
  applyGravity?: boolean;
  gravityScale?: number;
  stepUp?: boolean;
}

/**
 * Integrates forces and sweeps the body through the world for one fixed step.
 */
export function stepBody(
  body: PlayerBody,
  world: CollisionWorld,
  dt: number,
  opts: StepOptions,
): MoveFlags {
  if (opts.friction) applyFriction(body, dt);

  if (opts.wish && opts.wishSpeed !== undefined && opts.accel !== undefined) {
    accelerate(body, opts.wish, opts.wishSpeed, opts.accel, dt);
  }

  const gScale = opts.gravityScale ?? 1;
  if (opts.applyGravity !== false) {
    body.vel.y -= MOVE.gravity * gScale * dt;
    // slightly heavier when diving fast => crisper, less floaty arcs
    if (gScale === 1 && body.vel.y < -8) body.vel.y -= MOVE.gravity * 0.35 * dt;
    body.vel.y = Math.max(body.vel.y, -MOVE.maxFallSpeed);
  }

  body.blockedNormal = null;
  body.touchedCeiling = false;

  const flags = world.move(
    body.pos,
    body.vel,
    PLAYER.radius,
    body.height,
    body.vel.x * dt,
    body.vel.y * dt,
    body.vel.z * dt,
    opts.stepUp ? PLAYER.stepUpHeight : 0,
  );

  if (flags.wallNormal) body.blockedNormal = flags.wallNormal;
  if (flags.ceiling) body.touchedCeiling = true;

  return flags;
}
