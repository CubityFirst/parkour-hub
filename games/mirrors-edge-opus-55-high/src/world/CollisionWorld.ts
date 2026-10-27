/**
 * Axis-aligned box collision world.
 *
 * The whole playable level is described by static AABBs. This keeps the
 * collision code tiny, fast and extremely predictable, which matters more for
 * movement feel than physically exact shapes. Colliders are bucketed into a
 * uniform XZ grid so queries only touch nearby boxes.
 */

export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Gameplay hints attached to colliders (purely informational for parkour). */
export const SurfaceTag = {
  None: 0,
  WallRun: 1 << 0,
  Vault: 1 << 1,
  Ledge: 1 << 2,
} as const;

export interface Collider extends AABB {
  id: number;
  tags: number;
}

const CELL = 8;

export class CollisionWorld {
  readonly colliders: Collider[] = [];
  private grid = new Map<number, Collider[]>();
  private stamp = new Uint32Array(0);
  private queryId = 0;
  private result: Collider[] = [];

  add(box: AABB, tags = 0): Collider {
    const c: Collider = { ...box, id: this.colliders.length, tags };
    this.colliders.push(c);
    const x0 = Math.floor(c.minX / CELL);
    const x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL);
    const z1 = Math.floor(c.maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const key = cellKey(x, z);
        let bucket = this.grid.get(key);
        if (!bucket) this.grid.set(key, (bucket = []));
        bucket.push(c);
      }
    }
    return c;
  }

  /**
   * Returns every collider overlapping the query box. The returned array is
   * reused between calls - copy it if you need to keep it.
   */
  query(box: AABB): Collider[] {
    if (this.stamp.length < this.colliders.length) {
      this.stamp = new Uint32Array(this.colliders.length * 2);
    }
    const id = ++this.queryId;
    const out = this.result;
    out.length = 0;
    const x0 = Math.floor(box.minX / CELL);
    const x1 = Math.floor(box.maxX / CELL);
    const z0 = Math.floor(box.minZ / CELL);
    const z1 = Math.floor(box.maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const bucket = this.grid.get(cellKey(x, z));
        if (!bucket) continue;
        for (const c of bucket) {
          if (this.stamp[c.id] === id) continue;
          this.stamp[c.id] = id;
          if (overlaps(c, box)) out.push(c);
        }
      }
    }
    return out;
  }

  /** True when the box touches no collider. */
  isFree(box: AABB): boolean {
    return this.query(box).length === 0;
  }

  /**
   * Highest collider top surface directly below (x, z) between yMin and yMax,
   * sampled over a small footprint. Returns -Infinity when nothing is found.
   */
  groundHeight(x: number, z: number, halfWidth: number, yMin: number, yMax: number): number {
    const hits = this.query({
      minX: x - halfWidth,
      maxX: x + halfWidth,
      minZ: z - halfWidth,
      maxZ: z + halfWidth,
      minY: yMin,
      maxY: yMax,
    });
    let best = -Infinity;
    for (const c of hits) {
      if (c.maxY <= yMax && c.maxY > best) best = c.maxY;
    }
    return best;
  }
}

export function overlaps(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

function cellKey(x: number, z: number): number {
  // Pack two signed 16 bit cell coordinates into one number key.
  return ((x + 32768) << 16) | (z + 32768);
}

/**
 * Ray (on the XZ plane) versus a collider footprint expanded by `pad`.
 * Returns [tEnter, tExit] or null. Direction must be normalised.
 */
export function rayBoxXZ(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  c: AABB,
  pad: number,
): [number, number] | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  const slabs: [number, number, number, number][] = [
    [ox, dx, c.minX - pad, c.maxX + pad],
    [oz, dz, c.minZ - pad, c.maxZ + pad],
  ];
  for (const [o, d, lo, hi] of slabs) {
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  return [tMin, tMax];
}
