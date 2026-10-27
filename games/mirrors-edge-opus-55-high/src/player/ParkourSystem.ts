import { Vector3 } from 'three';
import { rayBoxXZ, type AABB, type Collider, type CollisionWorld } from '../world/CollisionWorld';
import { PHYS, type KinematicBody } from './PlayerPhysics';

/**
 * Environment queries for parkour moves: finding runnable walls, vaultable
 * obstacles and climbable ledges. These functions never move the player;
 * PlayerController decides what to do with the results.
 */

export interface WallInfo {
  collider: Collider;
  /** Wall normal (points away from the wall, towards the player). */
  nx: number;
  nz: number;
  /** +1 when the wall is on the player's right, -1 on the left. */
  side: number;
  distance: number;
}

export interface ClimbTarget {
  kind: 'vault' | 'mantle';
  /** Height of the obstacle top surface. */
  top: number;
  /** Final feet position once the move completes. */
  end: Vector3;
  /** Highest point of the move (over the obstacle). */
  over: Vector3;
}

const probe: AABB = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

/**
 * Look for a vertical surface beside the player, roughly parallel to the
 * travel direction (dirX, dirZ must be normalised).
 */
export function findWall(world: CollisionWorld, body: KinematicBody, dirX: number, dirZ: number, onlySide = 0, maxApproach = 0.6): WallInfo | null {
  let best: WallInfo | null = null;
  const p = body.pos;
  for (const side of [1, -1]) {
    if (onlySide !== 0 && side !== onlySide) continue;
    // Right vector of the travel direction is (-dirZ, 0, dirX).
    const sx = -dirZ * side;
    const sz = dirX * side;
    const r = PHYS.radius;
    const reach = PHYS.wallRunProbe;
    probe.minX = Math.min(p.x - r, p.x - r + sx * reach);
    probe.maxX = Math.max(p.x + r, p.x + r + sx * reach);
    probe.minZ = Math.min(p.z - r, p.z - r + sz * reach);
    probe.maxZ = Math.max(p.z + r, p.z + r + sz * reach);
    probe.minY = p.y + 0.5;
    probe.maxY = p.y + 1.4;
    for (const c of world.query(probe)) {
      // The wall has to cover the torso, otherwise it's just a low obstacle.
      if (c.maxY < p.y + 1.3 || c.minY > p.y + 0.5) continue;
      const outX = p.x < c.minX ? c.minX - p.x : p.x > c.maxX ? p.x - c.maxX : 0;
      const outZ = p.z < c.minZ ? c.minZ - p.z : p.z > c.maxZ ? p.z - c.maxZ : 0;
      if (outX === 0 && outZ === 0) continue;
      let nx = 0;
      let nz = 0;
      if (outX >= outZ) nx = p.x < c.minX ? -1 : 1;
      else nz = p.z < c.minZ ? -1 : 1;
      // Wall must be on this side, and the run must be roughly along it.
      if (sx * nx + sz * nz > -0.7) continue;
      if (Math.abs(dirX * nx + dirZ * nz) > maxApproach) continue;
      const distance = Math.max(outX, outZ) - r;
      if (distance > reach) continue;
      if (!best || distance < best.distance) best = { collider: c, nx, nz, side, distance };
    }
  }
  return best;
}

export interface OppositeWall {
  /** Distance from the player's centre to the wall face across the gap. */
  gap: number;
  /** Distance along the run direction until that wall begins (0 if it already has). */
  ahead: number;
}

/**
 * Find a wall facing us across a gap in direction (nx, nz) - tall enough to
 * wall run on and somewhere in the stretch of travel ahead. Used to aim wall
 * jumps at the opposite wall of a canyon.
 */
export function findOppositeWall(
  world: CollisionWorld,
  body: KinematicBody,
  nx: number,
  nz: number,
  alongX: number,
  alongZ: number,
  maxDist: number,
  lookAhead = 12,
): OppositeWall | null {
  const p = body.pos;
  const r = PHYS.radius;
  const ax = p.x + alongX * lookAhead;
  const az = p.z + alongZ * lookAhead;
  probe.minX = Math.min(p.x, ax, p.x + nx * maxDist) - r;
  probe.maxX = Math.max(p.x, ax, p.x + nx * maxDist) + r;
  probe.minZ = Math.min(p.z, az, p.z + nz * maxDist) - r;
  probe.maxZ = Math.max(p.z, az, p.z + nz * maxDist) + r;
  probe.minY = p.y - 1;
  probe.maxY = p.y + 1.6;
  let best: OppositeWall | null = null;
  for (const c of world.query(probe)) {
    if (c.maxY < p.y + 1.2) continue;
    let gap = Infinity;
    if (nx < 0 && c.maxX <= p.x - r + 0.01) gap = p.x - c.maxX;
    else if (nx > 0 && c.minX >= p.x + r - 0.01) gap = c.minX - p.x;
    else if (nz < 0 && c.maxZ <= p.z - r + 0.01) gap = p.z - c.maxZ;
    else if (nz > 0 && c.minZ >= p.z + r - 0.01) gap = c.minZ - p.z;
    if (gap > maxDist) continue;
    // Where along the run does this wall start / end?
    const lo = alongX !== 0 ? (alongX > 0 ? c.minX - p.x : p.x - c.maxX) : alongZ > 0 ? c.minZ - p.z : p.z - c.maxZ;
    const hi = alongX !== 0 ? (alongX > 0 ? c.maxX - p.x : p.x - c.minX) : alongZ > 0 ? c.maxZ - p.z : p.z - c.minZ;
    if (hi < 2) continue; // already behind us
    const ahead = Math.max(0, lo);
    if (!best || gap < best.gap - 0.01 || (Math.abs(gap - best.gap) < 0.01 && ahead < best.ahead)) best = { gap, ahead };
  }
  return best;
}

/**
 * Look ahead for something to vault over or climb onto.
 *
 * @param maxDist   how far in front of the player's body the obstacle may start
 * @param minRise   minimum obstacle height above the feet
 * @param maxRise   maximum obstacle height above the feet
 * @param allowVault whether passing over thin obstacles is allowed
 */
export function findClimb(
  world: CollisionWorld,
  body: KinematicBody,
  fx: number,
  fz: number,
  maxDist: number,
  minRise: number,
  maxRise: number,
  allowVault: boolean,
): ClimbTarget | null {
  const p = body.pos;
  const r = PHYS.radius;
  const reach = maxDist + 2.4;
  probe.minX = Math.min(p.x, p.x + fx * reach) - r;
  probe.maxX = Math.max(p.x, p.x + fx * reach) + r;
  probe.minZ = Math.min(p.z, p.z + fz * reach) - r;
  probe.maxZ = Math.max(p.z, p.z + fz * reach) + r;
  probe.minY = p.y + 0.05;
  probe.maxY = p.y + maxRise + PHYS.standHeight;

  // Find the nearest collider blocking the body column in front.
  let nearT = Infinity;
  const candidates: { c: Collider; tIn: number; tOut: number }[] = [];
  for (const c of world.query(probe)) {
    if (c.maxY <= p.y + 0.05 || c.minY >= p.y + body.height) continue;
    const hit = rayBoxXZ(p.x, p.z, fx, fz, c, r - 0.02);
    if (!hit || hit[1] < 0) continue;
    candidates.push({ c, tIn: hit[0], tOut: hit[1] });
    if (hit[0] < nearT) nearT = hit[0];
  }
  if (nearT === Infinity || nearT > maxDist || nearT < -0.15) return null;

  // Obstacle top = highest box whose face is at the nearest distance.
  let top = -Infinity;
  let tOut = 0;
  for (const k of candidates) {
    if (k.tIn <= nearT + 0.05 && k.c.maxY > top) {
      top = k.c.maxY;
      tOut = k.tOut;
    }
  }
  const rise = top - p.y;
  if (rise < minRise || rise > maxRise) return null;

  const tIn = Math.max(nearT, 0);
  const thickness = tOut - tIn - 2 * r;

  // Try vaulting over thin obstacles first.
  if (allowVault && thickness <= 1.7 && rise <= 1.4) {
    const endDist = tOut + 0.08;
    const end = new Vector3(p.x + fx * endDist, top + 1e-3, p.z + fz * endDist);
    if (sweptFree(world, p, end, top, PHYS.crouchHeight + 0.15) && columnFree(world, end, top, PHYS.standHeight)) {
      const mid = (tIn + tOut) / 2;
      const over = new Vector3(p.x + fx * mid, top + 0.25, p.z + fz * mid);
      return { kind: 'vault', top, end, over };
    }
  }

  // Otherwise climb on top of it.
  const endDist = tIn + 2 * r + 0.12;
  const end = new Vector3(p.x + fx * endDist, top + 1e-3, p.z + fz * endDist);
  // The landing spot must actually be on the obstacle we're climbing.
  const ground = world.groundHeight(end.x, end.z, r - 0.05, top - 0.05, top + 0.05);
  if (ground < top - 0.05) return null;
  const roomHeight = columnFree(world, end, top, PHYS.standHeight) ? PHYS.standHeight : PHYS.crouchHeight;
  if (!sweptFree(world, p, end, top, roomHeight)) return null;
  const over = new Vector3(p.x + fx * (tIn + 0.1), top + 0.12, p.z + fz * (tIn + 0.1));
  return { kind: 'mantle', top, end, over };
}

/** Is the volume between the player and `end` free above height y? */
function sweptFree(world: CollisionWorld, from: Vector3, end: Vector3, y: number, height: number): boolean {
  const r = PHYS.radius - 0.02;
  probe.minX = Math.min(from.x, end.x) - r;
  probe.maxX = Math.max(from.x, end.x) + r;
  probe.minZ = Math.min(from.z, end.z) - r;
  probe.maxZ = Math.max(from.z, end.z) + r;
  probe.minY = y + 0.02;
  probe.maxY = y + height;
  return world.isFree(probe);
}

function columnFree(world: CollisionWorld, at: Vector3, y: number, height: number): boolean {
  const r = PHYS.radius;
  probe.minX = at.x - r;
  probe.maxX = at.x + r;
  probe.minZ = at.z - r;
  probe.maxZ = at.z + r;
  probe.minY = y + 0.02;
  probe.maxY = y + height;
  return world.isFree(probe);
}
