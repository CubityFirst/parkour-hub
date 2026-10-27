import * as THREE from 'three';

/**
 * One axis-aligned static collider. All level geometry uses boxes so collision
 * can be simple, fast and reliable.
 */
export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  id: number;
}

export interface MoveResult {
  grounded: boolean;
  ceiling: boolean;
  hitWall: boolean;
  groundCollider: Collider | null;
}

const EPS = 1e-3;

/**
 * Static AABB collision world with per-axis sweep resolution.
 * The player is moved one axis at a time (X, Z, then Y) and pushed back to
 * the touched face, which reliably prevents tunneling at game speeds and
 * gives clean wall sliding for free.
 */
export class CollisionWorld {
  readonly colliders: Collider[] = [];
  private nextId = 1;

  clear(): void {
    this.colliders.length = 0;
  }

  addBox(center: THREE.Vector3, size: THREE.Vector3): Collider {
    return this.addMinMax(
      center.x - size.x / 2, center.y - size.y / 2, center.z - size.z / 2,
      center.x + size.x / 2, center.y + size.y / 2, center.z + size.z / 2
    );
  }

  addMinMax(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Collider {
    const c: Collider = {
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
      id: this.nextId++
    };
    this.colliders.push(c);
    return c;
  }

  /** Returns any collider overlapping the given AABB, or null. */
  overlapAny(min: THREE.Vector3, max: THREE.Vector3): Collider | null {
    for (const c of this.colliders) {
      if (this.overlap(min, max, c)) return c;
    }
    return null;
  }

  /** Collects every collider overlapping the given AABB. */
  collectOverlaps(min: THREE.Vector3, max: THREE.Vector3, out: Collider[]): Collider[] {
    out.length = 0;
    for (const c of this.colliders) {
      if (this.overlap(min, max, c)) out.push(c);
    }
    return out;
  }

  private overlap(min: THREE.Vector3, max: THREE.Vector3, c: Collider): boolean {
    return (
      min.x < c.max.x && max.x > c.min.x &&
      min.y < c.max.y && max.y > c.min.y &&
      min.z < c.max.z && max.z > c.min.z
    );
  }

  /**
   * Moves the AABB at `pos` (center) by `delta`, resolving collisions per axis.
   * `half` is the player's half-extent. Results report what was touched.
   */
  moveAABB(pos: THREE.Vector3, half: THREE.Vector3, delta: THREE.Vector3, result: MoveResult): void {
    result.grounded = false;
    result.ceiling = false;
    result.hitWall = false;
    result.groundCollider = null;

    // X axis
    if (delta.x !== 0) {
      pos.x += delta.x;
      for (const c of this.colliders) {
        if (!this.overlapsAt(pos, half, c)) continue;
        if (delta.x > 0) pos.x = c.min.x - half.x - EPS;
        else pos.x = c.max.x + half.x + EPS;
        result.hitWall = true;
      }
    }

    // Z axis
    if (delta.z !== 0) {
      pos.z += delta.z;
      for (const c of this.colliders) {
        if (!this.overlapsAt(pos, half, c)) continue;
        if (delta.z > 0) pos.z = c.min.z - half.z - EPS;
        else pos.z = c.max.z + half.z + EPS;
        result.hitWall = true;
      }
    }

    // Y axis
    if (delta.y !== 0) {
      pos.y += delta.y;
      for (const c of this.colliders) {
        if (!this.overlapsAt(pos, half, c)) continue;
        if (delta.y <= 0) {
          pos.y = c.max.y + half.y + EPS;
          result.grounded = true;
          result.groundCollider = c;
        } else {
          pos.y = c.min.y - half.y - EPS;
          result.ceiling = true;
        }
      }
    }
  }

  private overlapsAt(pos: THREE.Vector3, half: THREE.Vector3, c: Collider): boolean {
    return (
      pos.x - half.x < c.max.x && pos.x + half.x > c.min.x &&
      pos.y - half.y < c.max.y && pos.y + half.y > c.min.y &&
      pos.z - half.z < c.max.z && pos.z + half.z > c.min.z
    );
  }
}
