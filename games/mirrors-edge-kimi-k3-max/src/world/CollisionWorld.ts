import * as THREE from 'three';

/**
 * The world is made entirely of axis-aligned boxes.
 * A collider can optionally be flagged as a wall-runnable surface
 * (the tall red-marked walls placed beside long gaps).
 */
export interface Collider {
  id: number;
  min: THREE.Vector3;
  max: THREE.Vector3;
  wallRunnable: boolean;
}

export class CollisionWorld {
  private colliders: Collider[] = [];
  private nextId = 1;

  addBox(min: THREE.Vector3, max: THREE.Vector3, wallRunnable = false): Collider {
    const c: Collider = { id: this.nextId++, min: min.clone(), max: max.clone(), wallRunnable };
    this.colliders.push(c);
    return c;
  }

  get count(): number {
    return this.colliders.length;
  }

  /** Visit every collider overlapping the given AABB. Return true from cb to stop early. */
  query(min: THREE.Vector3, max: THREE.Vector3, cb: (c: Collider) => boolean | void): void {
    const list = this.colliders;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (
        min.x < c.max.x && max.x > c.min.x &&
        min.y < c.max.y && max.y > c.min.y &&
        min.z < c.max.z && max.z > c.min.z
      ) {
        if (cb(c)) return;
      }
    }
  }

  overlaps(min: THREE.Vector3, max: THREE.Vector3): boolean {
    let hit = false;
    this.query(min, max, () => {
      hit = true;
      return true;
    });
    return hit;
  }

  /**
   * Highest collider top found directly below (x, z), at or just above `y`,
   * within `maxDrop`. Returns null when there is no ground.
   */
  groundHeight(x: number, y: number, z: number, halfW: number, maxDrop: number): number | null {
    let best: number | null = null;
    const min = new THREE.Vector3(x - halfW, y - maxDrop, z - halfW);
    const max = new THREE.Vector3(x + halfW, y + 0.06, z + halfW);
    this.query(min, max, (c) => {
      const top = c.max.y;
      if (top <= y + 0.061 && (best === null || top > best)) best = top;
      return false;
    });
    return best;
  }
}
