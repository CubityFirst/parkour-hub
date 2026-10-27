import { SurfaceTag, type AABB } from '../world/CollisionWorld';
import {
  DEFAULT_THEME,
  hiddenBoxes,
  type BillboardDef,
  type BoxDef,
  type CheckpointDef,
  type CylinderDef,
  type FlagDef,
  type HintDef,
  type LevelData,
  type LevelTheme,
  type MaterialKey,
} from '../world/LevelLayout';

export const GROUND = -60;

export interface LevelMeta {
  id: string;
  name: string;
  tagline: string;
  startTitle: string;
  theme?: Partial<LevelTheme>;
  citySeed: number;
  spawn: [number, number, number];
  spawnYaw: number;
  killY: number;
}

/** Yaw values for spawn directions (0 = facing -Z). */
export const FACE = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 } as const;

/**
 * Helper for authoring levels out of axis-aligned boxes plus a library of
 * rooftop props. Levels call these helpers, then `build()`.
 */
export class LevelBuilder {
  boxes: BoxDef[] = [];
  hints: HintDef[] = [];
  checkpoints: CheckpointDef[] = [];
  finish: AABB | null = null;
  finishMarker: [number, number, number] = [0, 0, 0];
  cylinders: CylinderDef[] = [];
  flags: FlagDef[] = [];
  billboards: BillboardDef[] = [];

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: MaterialKey, collide = true, tags = 0, shadow = true): void {
    this.boxes.push({
      minX: Math.min(x0, x1),
      minY: Math.min(y0, y1),
      minZ: Math.min(z0, z1),
      maxX: Math.max(x0, x1),
      maxY: Math.max(y0, y1),
      maxZ: Math.max(z0, z1),
      mat,
      collide,
      tags,
      shadow,
    });
  }

  /** Visual-only flat plate lying on a surface (red guide strips etc). */
  decal(x0: number, z0: number, x1: number, z1: number, y: number, mat: MaterialKey): void {
    this.box(x0, y + 0.005, z0, x1, y + 0.03, z1, mat, false, 0, false);
  }

  cylinder(x: number, y: number, z: number, radius: number, length: number, axis: 'x' | 'y' | 'z', mat: MaterialKey): void {
    this.cylinders.push({ x, y, z, radius, length, axis, mat });
  }

  /**
   * A building from street level to `top`, with optional parapets on the
   * listed edges (N = -Z, S = +Z, E = +X, W = -X).
   */
  building(x0: number, z0: number, x1: number, z1: number, top: number, mat: MaterialKey, parapets = ''): void {
    this.box(x0, GROUND, z0, x1, top, z1, mat, true, SurfaceTag.WallRun | SurfaceTag.Ledge);
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    // A thin cornice band so roof edges read clearly against the sky.
    for (const side of parapets) {
      if (side === 'N') this.parapet(minX, minZ, maxX, minZ + 0.35, top);
      if (side === 'S') this.parapet(minX, maxZ - 0.35, maxX, maxZ, top);
      if (side === 'W') this.parapet(minX, minZ, minX + 0.35, maxZ, top);
      if (side === 'E') this.parapet(maxX - 0.35, minZ, maxX, maxZ, top);
    }
  }

  parapet(x0: number, z0: number, x1: number, z1: number, top: number, height = 0.95): void {
    this.box(x0, top, z0, x1, top + height, z1, 'white', true, SurfaceTag.Vault);
    // Metal coping on top of the parapet.
    this.box(x0 - 0.03, top + height, z0 - 0.03, x1 + 0.03, top + height + 0.06, z1 + 0.03, 'metal', false, 0, false);
  }

  /** Red edge marker painted along a jump edge. */
  jumpEdge(x0: number, x1: number, z: number, top: number, inward: number): void {
    this.decal(x0, z, x1, z + inward, top, 'red');
  }

  acUnit(x: number, z: number, top: number, w = 1.6, d = 1.2, h = 1.1): void {
    this.box(x - w / 2, top, z - d / 2, x + w / 2, top + h, z + d / 2, 'white');
    this.box(x - w / 2 + 0.12, top + h, z - d / 2 + 0.12, x + w / 2 - 0.12, top + h + 0.04, z + d / 2 - 0.12, 'grate', false, 0, false);
    this.cylinder(x, top + h + 0.08, z, Math.min(w, d) * 0.32, 0.1, 'y', 'dark');
  }

  vent(x: number, z: number, top: number): void {
    this.box(x - 0.35, top, z - 0.35, x + 0.35, top + 0.6, z + 0.35, 'metal');
    this.box(x - 0.45, top + 0.6, z - 0.45, x + 0.45, top + 0.72, z + 0.45, 'metal', false);
  }

  /** Low pipe run along the roof - shallow enough to step over. */
  pipeRun(x0: number, z0: number, x1: number, z1: number, top: number, mat: MaterialKey = 'red'): void {
    const r = 0.13;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    this.cylinder(cx, top + 0.22, cz, r, len, alongX ? 'x' : 'z', mat);
    // supports every ~3m
    const n = Math.max(2, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      this.box(px - 0.08, top, pz - 0.08, px + 0.08, top + 0.12, pz + 0.08, 'dark', false, 0, false);
    }
    // Collision for the pipe (its visual is the cylinder above).
    this.box(cx - (alongX ? len / 2 : r), top, cz - (alongX ? r : len / 2), cx + (alongX ? len / 2 : r), top + 0.35, cz + (alongX ? r : len / 2), mat, true, 0, false);
    hiddenBoxes.add(this.boxes[this.boxes.length - 1]);
  }

  /** Big rooftop duct to slide under: red lower housing, metal upper part. */
  slideDuct(x0: number, x1: number, z0: number, z1: number, top: number, clearance = 1.15, height = 3.6): void {
    const y0 = top + clearance;
    this.box(x0, y0, z0, x1, y0 + 1.1, z1, 'red');
    this.box(x0, y0 + 1.1, z0 + 0.1, x1, y0 + height, z1 - 0.1, 'metal');
    // Support legs at both ends and every ~6m (thin, set into the parapet line).
    const n = Math.max(1, Math.round((x1 - x0) / 6));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const lx = Math.min(Math.max(x - 0.08, x0), x1 - 0.16);
      this.box(lx, top, z0 - 0.15, lx + 0.16, y0, z0 - 0.05, 'dark', false, 0, true);
      this.box(lx, top, z1 + 0.05, lx + 0.16, y0, z1 + 0.15, 'dark', false, 0, true);
    }
    // Dark grille underneath to make the gap read as an opening.
    this.box(x0 + 0.05, y0 - 0.04, z0 + 0.1, x1 - 0.05, y0, z1 - 0.1, 'grate', false, 0, false);
  }

  /** Waist-high red barrier meant to be vaulted. */
  vaultBarrier(x0: number, x1: number, z0: number, z1: number, top: number, height = 1.05): void {
    this.box(x0, top, z0, x1, top + height, z1, 'red', true, SurfaceTag.Vault);
    this.box(x0, top + height, z0 - 0.04, x1, top + height + 0.05, z1 + 0.04, 'white', false, 0, false);
  }

  flag(x: number, z: number, top: number, angle: number): void {
    this.box(x - 0.04, top, z - 0.04, x + 0.04, top + 3.2, z + 0.04, 'metal', false, 0, true);
    this.flags.push({ x, y: top + 3.1, z, angle });
  }

  stairwell(x0: number, z0: number, x1: number, z1: number, top: number, doorFace: 'N' | 'S' | 'E' | 'W', doorPos: number): void {
    this.box(x0, top, z0, x1, top + 3.2, z1, 'concrete');
    this.box(x0 - 0.15, top + 3.2, z0 - 0.15, x1 + 0.15, top + 3.4, z1 + 0.15, 'white', false);
    const w = 0.6;
    if (doorFace === 'N') this.box(doorPos - w, top, z0 - 0.06, doorPos + w, top + 2.2, z0, 'red', false, 0, false);
    if (doorFace === 'S') this.box(doorPos - w, top, z1, doorPos + w, top + 2.2, z1 + 0.06, 'red', false, 0, false);
    if (doorFace === 'W') this.box(x0 - 0.06, top, doorPos - w, x0, top + 2.2, doorPos + w, 'red', false, 0, false);
    if (doorFace === 'E') this.box(x1, top, doorPos - w, x1 + 0.06, top + 2.2, doorPos + w, 'red', false, 0, false);
  }

  waterTower(x: number, z: number, top: number): void {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.box(x + dx * 1.1 - 0.1, top, z + dz * 1.1 - 0.1, x + dx * 1.1 + 0.1, top + 3, z + dz * 1.1 + 0.1, 'dark', false);
    }
    this.cylinder(x, top + 4.5, z, 1.7, 3, 'y', 'concrete');
    this.box(x - 1.2, top - 0.01, z - 1.2, x + 1.2, top + 4.5, z + 1.2, 'white', true);
    hiddenBoxes.add(this.boxes[this.boxes.length - 1]);
  }

  antenna(x: number, z: number, top: number, h: number): void {
    this.box(x - 0.06, top, z - 0.06, x + 0.06, top + h, z + 0.06, 'metal', false);
    this.box(x - 0.15, top + h, z - 0.15, x + 0.15, top + h + 0.25, z + 0.15, 'red', false);
  }

  /** Red lattice tower (crane mast style), visual only. */
  latticeTower(x: number, z: number, base: number, height: number, w = 1.4): void {
    const t = 0.12;
    const h = w / 2;
    for (const [dx, dz] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
      this.box(x + dx - t, base, z + dz - t, x + dx + t, base + height, z + dz + t, 'red', false);
    }
    for (let y = base + 2; y < base + height; y += 2.2) {
      this.box(x - h, y, z - h - t / 2, x + h, y + t, z - h + t / 2, 'red', false);
      this.box(x - h, y, z + h - t / 2, x + h, y + t, z + h + t / 2, 'red', false);
      this.box(x - h - t / 2, y, z - h, x - h + t / 2, y + t, z + h, 'red', false);
      this.box(x + h - t / 2, y, z - h, x + h + t / 2, y + t, z + h, 'red', false);
    }
  }

  skylight(x0: number, z0: number, x1: number, z1: number, top: number): void {
    this.box(x0, top, z0, x1, top + 0.5, z1, 'white');
    this.box(x0 + 0.1, top + 0.5, z0 + 0.1, x1 - 0.1, top + 0.9, z1 - 0.1, 'skylight', true);
  }

  billboard(x: number, y: number, z: number, width: number, height: number, angle: number, text: string, sub: string): void {
    this.billboards.push({ x, y, z, width, height, angle, text, sub });
  }

  // ---------------------------------------------------------------------------
  // Route helpers
  // ---------------------------------------------------------------------------

  hint(x0: number, z0: number, x1: number, z1: number, y: number, text: string): void {
    this.hints.push({ trigger: zone(x0, z0, x1, z1, y - 1, y + 4), text });
  }

  checkpoint(title: string, x0: number, z0: number, x1: number, z1: number, y: number, spawn: [number, number], yaw: number, marker: [number, number]): void {
    this.checkpoints.push({
      index: this.checkpoints.length + 1,
      title,
      trigger: zone(x0, z0, x1, z1, y - 1, y + 5),
      spawn: [spawn[0], y, spawn[1]],
      yaw,
      marker: [marker[0], y, marker[1]],
    });
  }

  /** Jump-edge marker along an edge where x is constant (route along X). */
  jumpEdgeX(x: number, z0: number, z1: number, top: number, inward: number): void {
    this.decal(x, z0, x + inward, z1, top, 'red');
  }

  /**
   * Red wall-run panel on a vertical face. `plane` is the face coordinate on
   * `axis` ('x': face at x = plane, 'z': face at z = plane); `out` (+1/-1) is
   * the direction the face points toward the runner.
   */
  wallPanel(axis: 'x' | 'z', plane: number, out: number, from: number, to: number, y0: number, y1: number): void {
    const a = Math.min(from, to);
    const c = Math.max(from, to);
    const t1 = plane + out * 0.06;
    if (axis === 'x') this.box(plane, y0, a, t1, y1, c, 'red', false, 0, false);
    else this.box(a, y0, plane, c, y1, t1, 'red', false, 0, false);
    const s0 = plane + out * 0.06;
    const s1 = plane + out * 0.08;
    for (let p = a + 2; p < c - 1; p += 4) {
      if (axis === 'x') this.box(s0, y0, p - 0.05, s1, y1, p + 0.05, 'white', false, 0, false);
      else this.box(p - 0.05, y0, s0, p + 0.05, y1, s1, 'white', false, 0, false);
    }
  }

  /** Narrow steel beam between two points (axis aligned), walkable on top. */
  beam(x0: number, z0: number, x1: number, z1: number, top: number, width = 1.2): void {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const h = width / 2;
    if (alongX) {
      const zc = (z0 + z1) / 2;
      this.box(x0, top - 0.45, zc - h, x1, top, zc + h, 'metal', true);
      this.box(x0, top - 0.02, zc - h, x1, top + 0.01, zc + h, 'red', false, 0, false);
      this.box(x0, top - 1.6, zc - 0.2, x1, top - 0.45, zc + 0.2, 'dark', false);
    } else {
      const xc = (x0 + x1) / 2;
      this.box(xc - h, top - 0.45, z0, xc + h, top, z1, 'metal', true);
      this.box(xc - h, top - 0.02, z0, xc + h, top + 0.01, z1, 'red', false, 0, false);
      this.box(xc - 0.2, top - 1.6, z0, xc + 0.2, top - 0.45, z1, 'dark', false);
    }
  }

  /** Shipping container (collidable) with ribbed sides. */
  container(x0: number, z0: number, x1: number, z1: number, base: number, height: number, mat: MaterialKey = 'red'): void {
    this.box(x0, base, z0, x1, base + height, z1, mat, true, SurfaceTag.Ledge);
    const rib: MaterialKey = mat === 'red' ? 'redDark' : 'dark';
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    if (maxX - minX > maxZ - minZ) {
      for (let x = minX + 0.6; x < maxX - 0.3; x += 1.1) {
        this.box(x - 0.05, base + 0.1, minZ - 0.03, x + 0.05, base + height - 0.1, maxZ + 0.03, rib, false, 0, false);
      }
    } else {
      for (let z = minZ + 0.6; z < maxZ - 0.3; z += 1.1) {
        this.box(minX - 0.03, base + 0.1, z - 0.05, maxX + 0.03, base + height - 0.1, z + 0.05, rib, false, 0, false);
      }
    }
  }

  /**
   * Steps rising along a direction ('n' = toward -Z, 'e' = +X, 'w' = -X).
   * a0/a1 give the steps' extent across the direction of travel.
   */
  stairs(a0: number, a1: number, start: number, dir: 'n' | 'e' | 'w', base: number, steps: number, rise = 0.3, depth = 1): void {
    for (let i = 0; i < steps; i++) {
      const mat: MaterialKey = i % 2 ? 'red' : 'redDark';
      const top = base + rise * (i + 1);
      if (dir === 'n') this.box(a0, base, start - i * depth, a1, top, start - (i + 1) * depth, mat);
      else if (dir === 'e') this.box(start + i * depth, base, a0, start + (i + 1) * depth, top, a1, mat);
      else this.box(start - i * depth, base, a0, start - (i + 1) * depth, top, a1, mat);
    }
  }

  /**
   * Finish arch with a checkered strip. Routes along Z: the arch spans X at
   * z = c. Routes along X (alongX = true): the arch spans Z at x = c.
   */
  finishArch(c: number, center: number, top: number, halfWidth: number, alongX = false): void {
    const w = halfWidth;
    if (!alongX) {
      this.box(center - w - 0.8, top, c - 0.4, center - w, top + 5.5, c + 0.4, 'red', true);
      this.box(center + w, top, c - 0.4, center + w + 0.8, top + 5.5, c + 0.4, 'red', true);
      this.box(center - w - 0.8, top + 5.5, c - 0.4, center + w + 0.8, top + 6.3, c + 0.4, 'red', false);
      this.decal(center - w, c - 0.4, center + w, c + 0.4, top, 'red');
      for (let x = center - w + 0.4, i = 0; x < center + w - 1; x += 1, i++) {
        this.decal(x, c - 2.4, x + 1, c - 1.6, top, i % 2 ? 'white' : 'dark');
        this.decal(x, c - 3.2, x + 1, c - 2.4, top, i % 2 ? 'dark' : 'white');
      }
      this.finish = zone(center - w - 4, c - 1, center + w + 4, c + 1, top - 1, top + 6);
      this.finishMarker = [center, top, c];
    } else {
      this.box(c - 0.4, top, center - w - 0.8, c + 0.4, top + 5.5, center - w, 'red', true);
      this.box(c - 0.4, top, center + w, c + 0.4, top + 5.5, center + w + 0.8, 'red', true);
      this.box(c - 0.4, top + 5.5, center - w - 0.8, c + 0.4, top + 6.3, center + w + 0.8, 'red', false);
      this.decal(c - 0.4, center - w, c + 0.4, center + w, top, 'red');
      for (let z = center - w + 0.4, i = 0; z < center + w - 1; z += 1, i++) {
        this.decal(c + 1.6, z, c + 2.4, z + 1, top, i % 2 ? 'white' : 'dark');
        this.decal(c + 2.4, z, c + 3.2, z + 1, top, i % 2 ? 'dark' : 'white');
      }
      this.finish = zone(c - 1, center - w - 4, c + 1, center + w + 4, top - 1, top + 6);
      this.finishMarker = [c, top, center];
    }
  }

  build(meta: LevelMeta): LevelData {
    if (!this.finish) throw new Error(`Level ${meta.id} has no finish line`);
    // Bounds = footprint of every building standing on the street.
    const bounds: AABB = { minX: Infinity, maxX: -Infinity, minY: GROUND, maxY: 0, minZ: Infinity, maxZ: -Infinity };
    for (const b of this.boxes) {
      if (b.minY > GROUND + 1) continue;
      bounds.minX = Math.min(bounds.minX, b.minX);
      bounds.maxX = Math.max(bounds.maxX, b.maxX);
      bounds.minZ = Math.min(bounds.minZ, b.minZ);
      bounds.maxZ = Math.max(bounds.maxZ, b.maxZ);
      bounds.maxY = Math.max(bounds.maxY, b.maxY);
    }
    return {
      id: meta.id,
      name: meta.name,
      tagline: meta.tagline,
      startTitle: meta.startTitle,
      theme: { ...DEFAULT_THEME, ...meta.theme },
      citySeed: meta.citySeed,
      boxes: this.boxes,
      cylinders: this.cylinders,
      checkpoints: this.checkpoints,
      hints: this.hints,
      flags: this.flags,
      billboards: this.billboards,
      finish: this.finish,
      finishMarker: this.finishMarker,
      spawn: meta.spawn,
      spawnYaw: meta.spawnYaw,
      killY: meta.killY,
      bounds,
    };
  }
}

export function zone(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): AABB {
  return { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: y0, maxY: y1, minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) };
}

