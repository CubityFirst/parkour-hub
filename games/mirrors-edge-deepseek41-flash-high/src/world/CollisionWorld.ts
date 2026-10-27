/**
 * Lightweight axis-aligned collision world.
 *
 * The whole playable level is built from boxes (rooftops, parapets, vents,
 * walls...).  Keeping the collision representation axis-aligned lets us use a
 * very small, predictable and fast solver without an external physics engine.
 */

export type SurfaceTag =
  | 'roof'
  | 'wall'
  | 'obstacle'
  | 'duct'
  | 'vault'
  | 'wallrun'
  | 'railing'
  | 'glass'
  | 'finish';

export interface ColliderOptions {
  tag?: SurfaceTag;
  wallRunnable?: boolean;
  vaultable?: boolean;
}

export interface Collider {
  id: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  tag: SurfaceTag;
  wallRunnable: boolean;
  vaultable: boolean;
}

const EPS = 1e-5;

export function aabbOverlap(
  aMinX: number,
  aMinY: number,
  aMinZ: number,
  aMaxX: number,
  aMaxY: number,
  aMaxZ: number,
  b: Collider,
): boolean {
  return (
    aMinX < b.maxX - EPS &&
    aMaxX > b.minX + EPS &&
    aMinY < b.maxY - EPS &&
    aMaxY > b.minY + EPS &&
    aMinZ < b.maxZ - EPS &&
    aMaxZ > b.minZ + EPS
  );
}

export class CollisionWorld {
  readonly colliders: Collider[] = [];
  private nextId = 1;

  addBox(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    options: ColliderOptions = {},
  ): Collider {
    const collider: Collider = {
      id: this.nextId++,
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      minZ: Math.min(minZ, maxZ),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY),
      maxZ: Math.max(minZ, maxZ),
      tag: options.tag ?? 'roof',
      wallRunnable: options.wallRunnable ?? false,
      vaultable: options.vaultable ?? false,
    };
    this.colliders.push(collider);
    return collider;
  }

  /** Returns true if any collider intersects the given box. */
  overlaps(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ): boolean {
    const c = this.colliders;
    for (let i = 0; i < c.length; i++) {
      if (aabbOverlap(minX, minY, minZ, maxX, maxY, maxZ, c[i])) return true;
    }
    return false;
  }

  /** Collects every collider that intersects the given box. */
  query(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    out: Collider[],
  ): Collider[] {
    out.length = 0;
    const c = this.colliders;
    for (let i = 0; i < c.length; i++) {
      if (aabbOverlap(minX, minY, minZ, maxX, maxY, maxZ, c[i])) out.push(c[i]);
    }
    return out;
  }

  /**
   * Highest solid surface directly beneath a point within `distance`.
   * Used to place the player exactly on a checkpoint / spawn.
   */
  groundHeightAt(x: number, z: number, fromY: number, distance = 100): number | null {
    let best: number | null = null;
    for (const c of this.colliders) {
      if (x <= c.minX || x >= c.maxX || z <= c.minZ || z >= c.maxZ) continue;
      if (c.maxY <= fromY + 0.01 && c.maxY >= fromY - distance) {
        if (best === null || c.maxY > best) best = c.maxY;
      }
    }
    return best;
  }

  /**
   * Finds a vertical wall surface beside the player.  `sideX/sideZ` is the
   * direction to look towards (usually the camera's right or left vector).
   * The returned normal points back towards the player.
   */
  findWall(
    feetX: number,
    feetY: number,
    feetZ: number,
    radius: number,
    height: number,
    sideX: number,
    sideZ: number,
    reach: number,
  ): WallHit | null {
    const playerMinX = feetX - radius;
    const playerMaxX = feetX + radius;
    const playerMinZ = feetZ - radius;
    const playerMaxZ = feetZ + radius;
    const playerMinY = feetY + 0.25;
    const playerMaxY = feetY + Math.min(height - 0.1, 1.7);

    let best: WallHit | null = null;
    let bestDistance = reach + 0.001;

    for (const c of this.colliders) {
      if (!c.wallRunnable) continue;
      if (c.maxY < feetY + 1.2) continue; // not tall enough to run on
      if (c.maxY < playerMinY || c.minY > playerMaxY) continue;

      // Is the collider close to the player's side?  Test the four side faces.
      // Walls facing +X (player is to the right / -X side of the wall).
      if (sideX > 0.35) {
        const dist = c.minX - playerMaxX;
        if (dist >= -0.05 && dist < bestDistance) {
          const overlapZ = Math.min(playerMaxZ, c.maxZ) - Math.max(playerMinZ, c.minZ);
          if (overlapZ > 0.05) {
            bestDistance = Math.max(0, dist);
            best = {
              collider: c,
              normalX: -1,
              normalZ: 0,
              distance: Math.max(0, dist),
              faceX: c.minX,
              faceZ: feetZ,
            };
          }
        }
      }
      if (sideX < -0.35) {
        const dist = playerMinX - c.maxX;
        if (dist >= -0.05 && dist < bestDistance) {
          const overlapZ = Math.min(playerMaxZ, c.maxZ) - Math.max(playerMinZ, c.minZ);
          if (overlapZ > 0.05) {
            bestDistance = Math.max(0, dist);
            best = {
              collider: c,
              normalX: 1,
              normalZ: 0,
              distance: Math.max(0, dist),
              faceX: c.maxX,
              faceZ: feetZ,
            };
          }
        }
      }
      if (sideZ > 0.35) {
        const dist = c.minZ - playerMaxZ;
        if (dist >= -0.05 && dist < bestDistance) {
          const overlapX = Math.min(playerMaxX, c.maxX) - Math.max(playerMinX, c.minX);
          if (overlapX > 0.05) {
            bestDistance = Math.max(0, dist);
            best = {
              collider: c,
              normalX: 0,
              normalZ: -1,
              distance: Math.max(0, dist),
              faceX: feetX,
              faceZ: c.minZ,
            };
          }
        }
      }
      if (sideZ < -0.35) {
        const dist = playerMinZ - c.maxZ;
        if (dist >= -0.05 && dist < bestDistance) {
          const overlapX = Math.min(playerMaxX, c.maxX) - Math.max(playerMinX, c.minX);
          if (overlapX > 0.05) {
            bestDistance = Math.max(0, dist);
            best = {
              collider: c,
              normalX: 0,
              normalZ: 1,
              distance: Math.max(0, dist),
              faceX: feetX,
              faceZ: c.maxZ,
            };
          }
        }
      }
    }

    return best;
  }
}

export interface WallHit {
  collider: Collider;
  /** Normal pointing away from the wall, towards the player. */
  normalX: number;
  normalZ: number;
  distance: number;
  faceX: number;
  faceZ: number;
}
