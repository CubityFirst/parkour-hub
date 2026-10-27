import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AABB } from './CollisionWorld';
import type { LevelData } from './LevelLayout';
import type { MaterialLibrary } from './Materials';

/**
 * Generates the background city: hundreds of buildings drawn with a handful
 * of instanced meshes. Buildings near the route stay below rooftop level so
 * the player looks down across a dense city; towers rise further away.
 */

const STREET_Y = -60;

/** Small deterministic PRNG so the skyline is the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
}

export class CityGenerator {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(materials: MaterialLibrary, level: LevelData) {
    const exclude = level.bounds;
    const rand = mulberry32(level.citySeed);
    // Footprints of the level's own buildings: background lots must not overlap them.
    const footprints = level.boxes.filter((b) => b.minY <= STREET_Y + 1);
    const hitsLevel = (box: AABB, pad: number) =>
      footprints.some((f) => box.maxX > f.minX - pad && box.minX < f.maxX + pad && box.maxZ > f.minZ - pad && box.minZ < f.maxZ + pad);
    // Inside the level area, fill only with buildings that sit below the
    // respawn height, so they can never become a landing shortcut.
    const lowTop = level.killY - 6;
    const office: Building[] = [];
    const officeOrange: Building[] = [];
    const glass: Building[] = [];
    const roofBits: Building[] = [];
    const redBits: Building[] = [];

    const pitch = 46;
    const margin = 10;
    const routeCx = (exclude.minX + exclude.maxX) / 2;
    const routeCz = (exclude.minZ + exclude.maxZ) / 2;

    for (let bx = -16; bx <= 16; bx++) {
      for (let bz = -22; bz <= 14; bz++) {
        const cx = bx * pitch + routeCx;
        const cz = bz * pitch + routeCz;
        // Distance from the level's bounding rectangle.
        const dx = Math.max(0, exclude.minX - cx, cx - exclude.maxX);
        const dz = Math.max(0, exclude.minZ - cz, cz - exclude.maxZ);
        const dist = Math.hypot(dx, dz) + 60;
        if (dist > 820) continue;

        // Split each block into 1-4 lots.
        const split = rand() < 0.5 ? 1 : 2;
        const splitZ = rand() < 0.6 ? 2 : 1;
        const lotW = (pitch - 12) / split;
        const lotD = (pitch - 12) / splitZ;
        for (let i = 0; i < split; i++) {
          for (let j = 0; j < splitZ; j++) {
            const w = lotW - 1 - rand() * 4;
            const d = lotD - 1 - rand() * 4;
            const x = cx - (pitch - 12) / 2 + lotW * (i + 0.5);
            const z = cz - (pitch - 12) / 2 + lotD * (j + 0.5);
            const box: AABB = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: 0 };
            const inside = box.maxX > exclude.minX - margin && box.minX < exclude.maxX + margin && box.maxZ > exclude.minZ - margin && box.minZ < exclude.maxZ + margin;
            if (hitsLevel(box, inside ? 3 : 8)) continue;
            // Height grows with distance: mid-rise near the route, towers beyond.
            let top: number;
            const near = dist < 170;
            if (inside) {
              top = Math.min(lowTop, -30 + rand() * 40);
              if (top < -45) continue;
            } else if (near) {
              top = -12 + rand() * 26 + (rand() < 0.12 ? 18 : 0);
            } else {
              const towerChance = Math.min(0.55, (dist - 120) / 700);
              top = rand() < towerChance ? 50 + rand() * 210 : -5 + rand() * 40;
            }
            const b: Building = { x, z, w, d, top };
            const tall = top > 45;
            const r = rand();
            if (tall) (r < 0.75 ? glass : office).push(b);
            else (r < 0.55 ? office : r < 0.8 ? officeOrange : glass).push(b);

            // Rooftop clutter on lower buildings (seen from above).
            if (!tall && w > 8 && d > 8) {
              const n = 1 + Math.floor(rand() * 3);
              for (let k = 0; k < n; k++) {
                const cw = 2 + rand() * 5;
                const cd = 2 + rand() * 5;
                roofBits.push({
                  x: x + (rand() - 0.5) * (w - cw - 1),
                  z: z + (rand() - 0.5) * (d - cd - 1),
                  w: cw,
                  d: cd,
                  top: top + 1 + rand() * 2.5,
                });
              }
            }
            if (tall && rand() < 0.35) {
              redBits.push({ x, z, w: 0.6, d: 0.6, top: top + 8 + rand() * 14 });
            }
          }
        }
      }
    }

    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.disposables.push(unit);
    this.addInstanced(unit, materials.office, office, STREET_Y);
    this.addInstanced(unit, materials.officeOrange, officeOrange, STREET_Y);
    this.addInstanced(unit, materials.glass, glass, STREET_Y);
    this.addInstanced(unit, materials.white, roofBits, null);
    this.addInstanced(unit, materials.red, redBits, null);

    this.buildGround(materials);
    this.buildCranes(materials, rand, exclude);
  }

  private addInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Building[], base: number | null): void {
    if (list.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((b, i) => {
      const y0 = base ?? b.top - Math.max(1, b.top > 40 ? 8 : 1.5);
      m.makeScale(b.w, b.top - y0, b.d).setPosition(b.x, y0, b.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.group.add(mesh);
  }

  private buildGround(materials: MaterialLibrary): void {
    const geo = new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geo, materials.concrete);
    ground.position.y = STREET_Y;
    this.group.add(ground);
    this.disposables.push(geo);
  }

  /** A few red construction cranes on the skyline (Runner Vision style landmarks). */
  private buildCranes(materials: MaterialLibrary, rand: () => number, exclude: AABB): void {
    const parts: THREE.BufferGeometry[] = [];
    const add = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      parts.push(g);
    };
    const spots = [
      [exclude.minX - 120, exclude.minZ + 60],
      [exclude.maxX + 160, exclude.minZ - 80],
      [exclude.minX - 220, exclude.maxZ - 220],
      [exclude.maxX + 90, exclude.maxZ - 40],
      [exclude.minX - 60, exclude.minZ - 210],
    ];
    for (const [x, z] of spots) {
      const height = 90 + rand() * 70;
      const w = 3;
      const t = 0.35;
      for (const [dx, dz] of [[0, 0], [w, 0], [0, w], [w, w]]) add(x + dx - t, STREET_Y, z + dz - t, x + dx + t, height, z + dz + t);
      for (let y = STREET_Y + 4; y < height; y += 5) {
        add(x, y, z - t, x + w, y + t * 1.5, z + t);
        add(x, y, z + w - t, x + w, y + t * 1.5, z + w + t);
        add(x - t, y, z, x + t, y + t * 1.5, z + w);
        add(x + w - t, y, z, x + w + t, y + t * 1.5, z + w);
      }
      // Jib and counter-jib.
      const dir = rand() < 0.5 ? 1 : -1;
      add(x + w / 2 - 1, height, z + w / 2 - 1, x + w / 2 + 1, height + 2, z + w / 2 + 1 + dir * 0);
      if (dir > 0) add(x - 18, height + 0.5, z + w / 2 - 0.8, x + w + 55, height + 2.2, z + w / 2 + 0.8);
      else add(x - 55, height + 0.5, z + w / 2 - 0.8, x + w + 18, height + 2.2, z + w / 2 + 0.8);
      add(x + w / 2 - 0.6, height + 2, z + w / 2 - 0.6, x + w / 2 + 0.6, height + 12, z + w / 2 + 0.6);
      // Counterweight
      const cwX = dir > 0 ? x - 16 : x + w + 12;
      add(cwX, height - 3, z + w / 2 - 1.5, cwX + 4, height + 0.5, z + w / 2 + 1.5);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, materials.red);
    this.group.add(mesh);
    this.disposables.push(merged);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
