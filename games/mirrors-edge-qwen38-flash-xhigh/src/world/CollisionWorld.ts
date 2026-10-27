/**
 * Axis-aligned bounding box collision world.
 *
 * The whole playable level is composed of static boxes, which lets us use a
 * very simple and robust sweep resolver: move one axis at a time, push the
 * player capsule (treated as a square-rounded AABB) back out of any overlap,
 * and zero the corresponding velocity component. At fixed 1/120s steps the
 * per-step displacement stays far below the thinnest wall (0.4m), so tunneling
 * cannot occur at legal movement speeds (zipline is scripted, not swept).
 *
 * A uniform grid provides the broad phase; boxes are registered into every
 * cell they touch.
 */

import { type Vec3, vec3 } from '../core/vec3.ts';

export type BoxTag = 'solid' | 'wallrun' | 'vault';

export interface WorldBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Marks a surface meant to be wall-run (red runner-vision stripe). */
  wallRun?: boolean;
  /** Marks an obstacle the vault system may lift the player over. */
  vaultable?: boolean;
}

export interface MoveFlags {
  grounded: boolean;
  ceiling: boolean;
  wallNormal: Vec3 | null;
}

const EPS = 1e-3;
const CELL = 6;

export class CollisionWorld {
  readonly boxes: WorldBox[] = [];
  private grid = new Map<string, WorldBox[]>();

  addBox(b: WorldBox): WorldBox {
    this.boxes.push(b);
    const [cx0, cx1] = [Math.floor(b.minX / CELL), Math.floor(b.maxX / CELL)];
    const [cz0, cz1] = [Math.floor(b.minZ / CELL), Math.floor(b.maxZ / CELL)];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = `${cx},${cz}`;
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, (list = []));
        list.push(b);
      }
    }
    return b;
  }

  /** All boxes overlapping the given AABB (broad + narrow phase). */
  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): WorldBox[] {
    const out: WorldBox[] = [];
    const cx0 = Math.floor(minX / CELL);
    const cx1 = Math.floor(maxX / CELL);
    const cz0 = Math.floor(minZ / CELL);
    const cz1 = Math.floor(maxZ / CELL);
    const seen = new Set<WorldBox>();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.grid.get(`${cx},${cz}`);
        if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue;
          seen.add(b);
          if (
            b.maxX > minX &&
            b.minX < maxX &&
            b.maxY > minY &&
            b.minY < maxY &&
            b.maxZ > minZ &&
            b.minZ < maxZ
          ) {
            out.push(b);
          }
        }
      }
    }
    return out;
  }

  /** Whether the capsule-as-AABB at feet position `p` overlaps anything solid. */
  overlaps(p: Vec3, r: number, h: number): WorldBox[] {
    return this.query(p.x - r, p.y + EPS, p.z - r, p.x + r, p.y + h - EPS, p.z + r);
  }

  /**
   * Sweeps the player AABB through displacement (dx,dy,dz), axis by axis,
   * mutating `pos` and `vel` (zeroing blocked axes). Returns collision flags.
   */
  move(
    pos: Vec3,
    vel: Vec3,
    r: number,
    h: number,
    dx: number,
    dy: number,
    dz: number,
    stepUpHeight = 0,
  ): MoveFlags {
    const flags: MoveFlags = { grounded: false, ceiling: false, wallNormal: null };

    // ---- X axis -------------------------------------------------------
    if (dx !== 0) {
      const baseY = pos.y;
      pos.x += dx;
      const hits = this.overlaps(pos, r, h);
      if (hits.length && !this.tryStepUp(pos, hits, r, h, stepUpHeight, baseY)) {
        for (const b of hits) {
          if (dx > 0) {
            pos.x = Math.min(pos.x, b.minX - r - EPS);
            flags.wallNormal ??= vec3(-1, 0, 0);
          } else {
            pos.x = Math.max(pos.x, b.maxX + r + EPS);
            flags.wallNormal ??= vec3(1, 0, 0);
          }
        }
        vel.x = 0;
      }
    }

    // ---- Z axis -------------------------------------------------------
    if (dz !== 0) {
      const baseY = pos.y;
      pos.z += dz;
      const hits = this.overlaps(pos, r, h);
      if (hits.length && !this.tryStepUp(pos, hits, r, h, stepUpHeight, baseY)) {
        for (const b of hits) {
          if (dz > 0) {
            pos.z = Math.min(pos.z, b.minZ - r - EPS);
            flags.wallNormal ??= vec3(0, 0, -1);
          } else {
            pos.z = Math.max(pos.z, b.maxZ + r + EPS);
            flags.wallNormal ??= vec3(0, 0, 1);
          }
        }
        vel.z = 0;
      }
    }

    // ---- Y axis -------------------------------------------------------
    if (dy !== 0) {
      pos.y += dy;
      const hits = this.overlaps(pos, r, h);
      if (hits.length) {
        if (dy < 0) {
          let best = -Infinity;
          for (const b of hits) best = Math.max(best, b.maxY);
          pos.y = best + EPS;
          flags.grounded = true;
          if (vel.y < 0) vel.y = 0;
        } else {
          let best = Infinity;
          for (const b of hits) best = Math.min(best, b.minY);
          pos.y = best - h - EPS;
          flags.ceiling = true;
          if (vel.y > 0) vel.y = 0;
        }
      }
    }

    // Standing-probe: when resting on a surface the exact Y resolution above
    // can oscillate sub-millimetre around the contact plane. Treat "within a
    // hair above a surface while falling or level" as grounded so that the
    // controller sees a stable signal (crucial for coyote-time and footstep
    // timing correctness).
    if (!flags.grounded && vel.y <= 0) {
      const probe = Math.max(0.03, Math.abs(dy) + 0.01);
      if (this.groundHeight(pos, r, probe) !== null) flags.grounded = true;
    }

    return flags;
  }

  /**
   * When a horizontal move is blocked by a low obstacle (curb, grating,
   * vent base), automatically lift the player to its top if the standing
   * pose fits there. Keeps momentum-based flow from snagging on clutter.
   * `pos` has already been displaced along the blocked axis when this runs.
   */
  private tryStepUp(
    pos: Vec3,
    hits: WorldBox[],
    r: number,
    h: number,
    maxStep: number,
    stepBaseY: number,
  ): boolean {
    if (maxStep <= 0) return false;
    let stepTop = -Infinity;
    for (const b of hits) {
      if (b.maxY - stepBaseY > maxStep) return false; // too tall: real wall
      stepTop = Math.max(stepTop, b.maxY);
    }
    if (!isFinite(stepTop)) return false;
    const raised = vec3(pos.x, stepTop, pos.z);
    if (this.overlaps(raised, r, h).length) return false;
    pos.y = stepTop + EPS;
    return true;
  }

  /** True if a surface exists just below the feet. */
  hasGround(pos: Vec3, r: number, dist = 0.02): boolean {
    return this.groundHeight(pos, r, dist) !== null;
  }

  groundHeight(pos: Vec3, r: number, maxDown = 0.05): number | null {
    const hits = this.query(
      pos.x - r,
      pos.y - maxDown,
      pos.z - r,
      pos.x + r,
      pos.y + EPS,
      pos.z + r,
    );
    let best: number | null = null;
    for (const b of hits) {
      if (b.maxY <= pos.y + EPS && b.maxY >= pos.y - maxDown) {
        best = best === null ? b.maxY : Math.max(best, b.maxY);
      }
    }
    return best;
  }

  /** Whether the capsule fits at `p` (used for slide→stand checks). */
  fits(pos: Vec3, r: number, h: number): boolean {
    return this.overlaps(pos, r, h).length === 0;
  }

  /**
   * Raycast against all boxes (slab method). Returns nearest hit with the
   * face normal. Used for wall-run detection and ledge probes.
   */
  raycast(
    origin: Vec3,
    dir: Vec3,
    maxDist: number,
    filter?: (b: WorldBox) => boolean,
  ): { dist: number; normal: Vec3; box: WorldBox } | null {
    let best: { dist: number; normal: Vec3; box: WorldBox } | null = null;
    for (const b of this.boxes) {
      if (filter && !filter(b)) continue;
      const hit = this.rayBox(origin, dir, b);
      if (hit !== null && hit <= maxDist && (!best || hit < best.dist)) {
        best = { dist: hit, normal: this.rayBoxNormal(origin, dir, b, hit), box: b };
      }
    }
    return best;
  }

  private rayBox(o: Vec3, d: Vec3, b: WorldBox): number | null {
    let tMin = -Infinity;
    let tMax = Infinity;
    const lo = [b.minX, b.minY, b.minZ];
    const hi = [b.maxX, b.maxY, b.maxZ];
    const oo = [o.x, o.y, o.z];
    const od = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(od[i]) < 1e-9) {
        if (oo[i] < lo[i] || oo[i] > hi[i]) return null;
        continue;
      }
      const inv = 1 / od[i];
      let t1 = (lo[i] - oo[i]) * inv;
      let t2 = (hi[i] - oo[i]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
    return tMin >= 0 ? tMin : tMax >= 0 ? 0 : null;
  }

  private rayBoxNormal(o: Vec3, d: Vec3, b: WorldBox, t: number): Vec3 {
    const px = o.x + d.x * t;
    const py = o.y + d.y * t;
    const pz = o.z + d.z * t;
    const f = 0.001;
    if (Math.abs(px - b.minX) < f) return vec3(-1, 0, 0);
    if (Math.abs(px - b.maxX) < f) return vec3(1, 0, 0);
    if (Math.abs(pz - b.minZ) < f) return vec3(0, 0, -1);
    if (Math.abs(pz - b.maxZ) < f) return vec3(0, 0, 1);
    if (Math.abs(py - b.minY) < f) return vec3(0, -1, 0);
    return vec3(0, 1, 0);
  }
}
