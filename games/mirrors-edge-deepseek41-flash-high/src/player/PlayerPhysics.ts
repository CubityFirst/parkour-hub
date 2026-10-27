import * as THREE from 'three';
import type { CollisionWorld } from '../world/CollisionWorld';

export interface PlayerBody {
  /** Feet position. */
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  height: number;
  grounded: boolean;
}

export interface PhysicsResult {
  hitCeiling: boolean;
  landed: boolean;
  impactSpeed: number;
  wallNormalX: number;
  wallNormalZ: number;
}

const SKIN = 0.0015;
const GROUND_PROBE = 0.045;
const MAX_SUBSTEP = 0.2;

/**
 * AABB character controller.  The player is a vertical box that is moved one
 * axis at a time; movement is subdivided so high speeds cannot tunnel through
 * thin geometry.  No step-up is needed because the course has no small lips on
 * the route (edge curbs are purely decorative).
 */
export class PlayerPhysics {
  private readonly tmpResult: PhysicsResult = {
    hitCeiling: false,
    landed: false,
    impactSpeed: 0,
    wallNormalX: 0,
    wallNormalZ: 0,
  };

  constructor(private readonly world: CollisionWorld) {}

  step(body: PlayerBody, dt: number): PhysicsResult {
    const result = this.tmpResult;
    result.hitCeiling = false;
    result.landed = false;
    result.impactSpeed = 0;
    result.wallNormalX = 0;
    result.wallNormalZ = 0;

    const v = body.velocity;
    const maxSpeed = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
    const substeps = Math.max(1, Math.min(12, Math.ceil((maxSpeed * dt) / MAX_SUBSTEP)));
    const sdt = dt / substeps;

    const wasGrounded = body.grounded;
    body.grounded = false;

    for (let i = 0; i < substeps; i++) {
      // Move horizontally first, then vertically.  This keeps floor contact
      // stable while running over adjacent slabs.
      this.moveAxis(body, 'x', v.x * sdt, result);
      this.moveAxis(body, 'z', v.z * sdt, result);

      const fallSpeed = v.y;
      this.moveAxis(body, 'y', v.y * sdt, result);
      if (result.landed) {
        result.impactSpeed = Math.max(result.impactSpeed, Math.abs(fallSpeed));
      }
    }

    // The vertical pass usually establishes contact; if the player is resting
    // exactly on a surface, probe a hair downwards to keep `grounded` stable.
    if (!body.grounded && v.y <= 0.01) {
      if (this.groundProbe(body)) {
        body.grounded = true;
      }
    }

    if (body.grounded && v.y < 0) v.y = 0;

    // Remember whether this step started on the ground so the controller can
    // detect a landing transition.
    if (wasGrounded && body.grounded) result.landed = false;
    return result;
  }

  private moveAxis(
    body: PlayerBody,
    axis: 'x' | 'y' | 'z',
    delta: number,
    result: PhysicsResult,
  ): void {
    if (delta === 0) return;
    const pos = body.position;
    const r = body.radius;
    const h = body.height;

    // Remember the pre-move box.  If the player is already overlapping a
    // collider (for example after a height change), we must not resolve it by
    // snapping to the far face of a long obstacle: that would teleport the
    // player sideways.  The controller prevents those overlaps; this is a
    // safety valve.
    const oldMinX = pos.x - r;
    const oldMaxX = pos.x + r;
    const oldMinY = pos.y;
    const oldMaxY = pos.y + h;
    const oldMinZ = pos.z - r;
    const oldMaxZ = pos.z + r;

    pos[axis] += delta;

    for (let pass = 0; pass < 3; pass++) {
      let resolved = false;
      const minX = pos.x - r;
      const maxX = pos.x + r;
      const minY = pos.y;
      const maxY = pos.y + h;
      const minZ = pos.z - r;
      const maxZ = pos.z + r;

      for (const c of this.world.colliders) {
        if (!overlaps(minX, minY, minZ, maxX, maxY, maxZ, c)) continue;
        if (axis !== 'y' && overlaps(oldMinX, oldMinY, oldMinZ, oldMaxX, oldMaxY, oldMaxZ, c)) {
          continue;
        }
        resolved = true;

        if (axis === 'x') {
          if (delta > 0) pos.x = c.minX - r - SKIN;
          else pos.x = c.maxX + r + SKIN;
          result.wallNormalX = delta > 0 ? -1 : 1;
          if (body.velocity.x * delta > 0) body.velocity.x = 0;
        } else if (axis === 'z') {
          if (delta > 0) pos.z = c.minZ - r - SKIN;
          else pos.z = c.maxZ + r + SKIN;
          result.wallNormalZ = delta > 0 ? -1 : 1;
          if (body.velocity.z * delta > 0) body.velocity.z = 0;
        } else {
          if (delta > 0) {
            pos.y = c.minY - h - SKIN;
            if (body.velocity.y > 0) body.velocity.y = 0;
            result.hitCeiling = true;
          } else {
            pos.y = c.maxY + SKIN;
            if (body.velocity.y < 0) {
              result.landed = true;
              result.impactSpeed = Math.max(result.impactSpeed, Math.abs(body.velocity.y));
              body.velocity.y = 0;
            }
            body.grounded = true;
          }
        }
      }

      if (!resolved) break;
    }
  }

  private groundProbe(body: PlayerBody): boolean {
    const pos = body.position;
    const r = body.radius - 0.02;
    const h = 0.02;
    const minX = pos.x - r;
    const maxX = pos.x + r;
    const minY = pos.y - GROUND_PROBE;
    const maxY = pos.y + h;
    const minZ = pos.z - r;
    const maxZ = pos.z + r;

    for (const c of this.world.colliders) {
      if (minX < c.maxX && maxX > c.minX && minY < c.maxY && maxY > c.minY && minZ < c.maxZ && maxZ > c.minZ) {
        if (c.maxY <= pos.y + 0.035) {
          pos.y = c.maxY + SKIN;
          return true;
        }
      }
    }
    return false;
  }

  /** True if the player's current box intersects anything. */
  overlapsWorld(body: PlayerBody): boolean {
    const pos = body.position;
    const r = body.radius;
    return this.world.overlaps(
      pos.x - r,
      pos.y + 0.005,
      pos.z - r,
      pos.x + r,
      pos.y + body.height - 0.005,
      pos.z + r,
    );
  }
}

function overlaps(
  aMinX: number,
  aMinY: number,
  aMinZ: number,
  aMaxX: number,
  aMaxY: number,
  aMaxZ: number,
  c: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
): boolean {
  return (
    aMinX < c.maxX - SKIN &&
    aMaxX > c.minX + SKIN &&
    aMinY < c.maxY - SKIN &&
    aMaxY > c.minY + SKIN &&
    aMinZ < c.maxZ - SKIN &&
    aMaxZ > c.minZ + SKIN
  );
}
