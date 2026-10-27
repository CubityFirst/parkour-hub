import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './CollisionWorld';
import { MaterialSet } from './materials';
import { CheckpointSystem } from './Checkpoints';

export interface HintZone {
  min: THREE.Vector3;
  max: THREE.Vector3;
  text: string;
}

export interface LevelData {
  spawn: { pos: THREE.Vector3; yaw: number };
  checkpoints: CheckpointSystem;
  hints: HintZone[];
  finish: { min: THREE.Vector3; max: THREE.Vector3 };
  killY: number;
}

type BucketKey = 'roof' | 'facadeWhite' | 'facadeGray' | 'glass' | 'red' | 'dark' | 'metal';

/**
 * The full parkour route, six sections along +Z:
 *   S1 tutorial (z −12…12)      — run, jump, vault, slide
 *   S2 rooftop jumps (z 12…62)  — sprint jumps between buildings
 *   S3 slide roof (z 62…85)     — low ducts, hold CTRL
 *   S4 wall run (z 85…119)      — 10.5 m gap, red wall on the right
 *   S5 combination (z 119…172)  — vault → gap → left wall run → slide
 *   S6 final sprint (z 172…217) — descending jumps to the FINISH gate
 *
 * Gap sanity (sprint 9.6 m/s, jump vy 8.4, g 24 → same-level range ≈ 6.7 m):
 * every normal gap is ≤ 5 m; the two 10.5 m gaps are wall-run only.
 */
export function buildLevel(scene: THREE.Scene, world: CollisionWorld, mats: MaterialSet): LevelData {
  const buckets: Record<BucketKey, THREE.BufferGeometry[]> = {
    roof: [],
    facadeWhite: [],
    facadeGray: [],
    glass: [],
    red: [],
    dark: [],
    metal: [],
  };

  const box = (key: BucketKey, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    buckets[key].push(g);
  };
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, wallRunnable = false): void => {
    world.addBox(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), wallRunnable);
  };

  const BOTTOM = -46;

  /** Rooftop building: facade body + slightly overhanging roof slab + full collider. */
  const building = (key: BucketKey, x0: number, z0: number, x1: number, z1: number, top: number): void => {
    box(key, x0, BOTTOM, z0, x1, top - 0.32, z1);
    box('roof', x0 - 0.06, top - 0.34, z0 - 0.06, x1 + 0.06, top, z1 + 0.06);
    solid(x0, BOTTOM, z0, x1, top, z1);
  };

  /** Thin red takeoff marker strip (runner vision). */
  const strip = (x0: number, z0: number, x1: number, z1: number, top: number): void => {
    box('red', x0, top + 0.02, z0, x1, top + 0.08, z1);
  };

  /** Red pennant on a thin pole — route marker. */
  const flag = (x: number, z: number, top: number): void => {
    const pole = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6);
    pole.translate(x, top + 1.3, z);
    buckets.metal.push(pole);
    const penn = new THREE.ConeGeometry(0.34, 0.8, 4);
    penn.rotateZ(-Math.PI / 2);
    penn.scale(1, 1, 0.22);
    penn.translate(x + 0.42, top + 2.28, z);
    buckets.red.push(penn);
  };

  /** Rooftop AC unit (visual obstacle with collision). */
  const acUnit = (x: number, z: number, top: number, w = 1.3, h = 0.75, d = 0.95): void => {
    box('dark', x - w / 2, top, z - d / 2, x + w / 2, top + h, z + d / 2);
    box('metal', x - w / 4, top + h, z - d / 4, x + w / 4, top + h + 0.12, z + d / 4);
    solid(x - w / 2, top, z - d / 2, x + w / 2, top + h, z + d / 2);
  };

  /** Full-width low duct the player must slide under. */
  const slideBar = (x0: number, x1: number, z: number, depth: number, top: number, clearance = 1.06): void => {
    const y0 = top + clearance;
    const y1 = top + clearance + 0.75;
    box('dark', x0, y0, z - depth / 2, x1, y1, z + depth / 2);
    solid(x0, y0, z - depth / 2, x1, y1, z + depth / 2);
    box('red', x0, top, z - depth / 2 - 0.06, x0 + 0.18, y1 + 0.05, z + depth / 2 + 0.06);
    box('red', x1 - 0.18, top, z - depth / 2 - 0.06, x1, y1 + 0.05, z + depth / 2 + 0.06);
    box('red', x0, y1, z - depth / 2 - 0.05, x1, y1 + 0.06, z + depth / 2 + 0.05);
  };

  /** Waist-high vaultable obstacle with a red top. */
  const vaultBox = (x: number, z: number, top: number, w: number, h: number, d: number): void => {
    box('facadeGray', x - w / 2, top, z - d / 2, x + w / 2, top + h, z + d / 2);
    box('red', x - w / 2, top + h, z - d / 2, x + w / 2, top + h + 0.07, z + d / 2);
    solid(x - w / 2, top, z - d / 2, x + w / 2, top + h, z + d / 2);
  };

  const parapet = (x0: number, z0: number, x1: number, z1: number, top: number): void => {
    box('facadeWhite', x0, top, z0, x1, top + 0.38, z1);
    solid(x0, top, z0, x1, top + 0.38, z1);
  };

  /** Tall thin building whose side face is a designated wall-run surface. */
  const wallRunnable = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void => {
    box('facadeWhite', x0, y0, z0, x1, y1, z1);
    solid(x0, y0, z0, x1, y1, z1, true);
  };

  // ============================ SECTION 1 — THE BASICS ============================
  building('facadeWhite', -12, -12, 12, 12, 0);
  vaultBox(0, 2.4, 0, 3.2, 1.0, 0.9);
  // slide corridor: two side walls + red pipe overhead
  box('facadeWhite', -12, 0, 6.9, -2.3, 2.3, 7.9);
  solid(-12, 0, 6.9, -2.3, 2.3, 7.9);
  box('facadeWhite', 2.3, 0, 6.9, 12, 2.3, 7.9);
  solid(2.3, 0, 6.9, 12, 2.3, 7.9);
  box('red', -2.3, 1.06, 7.25, 2.3, 1.5, 7.55);
  solid(-2.3, 1.06, 7.25, 2.3, 1.5, 7.55);
  strip(-2, 10.8, 2, 11.4, 0);
  flag(-2.2, 11.1, 0);
  flag(2.2, 11.1, 0);
  parapet(-12.25, -12, -11.85, 12, 0);
  parapet(11.85, -12, 12.25, 12, 0);
  parapet(-12, -12.25, 12, -11.85, 0);
  acUnit(-8, -4, 0);
  acUnit(-8.2, -1.4, 0, 1.0, 0.6, 0.8);
  acUnit(8.5, 4, 0);
  const ant = new THREE.CylinderGeometry(0.06, 0.09, 7, 6);
  ant.translate(9, 3.5, -8);
  buckets.metal.push(ant);
  box('red', 8.85, 6.9, -8.15, 9.15, 7.5, -7.85);

  // ======================== SECTION 2 — ROOFTOP JUMPS ========================
  // gap 3.5 m
  building('facadeWhite', -7.5, 15.5, 7.5, 27.5, 0);
  strip(-1, 26.3, 3, 26.9, 0);
  flag(-1.2, 26.6, 0);
  flag(3.2, 26.6, 0);
  acUnit(-5.5, 24, 0);
  acUnit(5.5, 18.5, 0, 1.1, 0.65, 0.9);
  // gap 4.5 m, up 0.5 m
  building('glass', -2, 32, 10, 43, 0.5);
  strip(2, 41.8, 6, 42.4, 0.5);
  flag(1.8, 42.1, 0.5);
  flag(6.2, 42.1, 0.5);
  acUnit(8, 34.5, 0.5);
  // gap 5 m, down 1.5 m
  building('facadeWhite', -10, 48, 2, 58, -1);
  strip(-4, 56.8, 0, 57.4, -1);
  flag(-4.2, 57.1, -1);
  flag(0.2, 57.1, -1);
  acUnit(-8, 50, -1);
  // gap 4 m to section 3

  // ============================ SECTION 3 — SLIDE ============================
  building('facadeGray', -9, 62, 9, 85, -1);
  slideBar(-9, 9, 66.6, 1.3, -1);
  slideBar(-9, 9, 72.4, 1.3, -1);
  slideBar(-9, 9, 79.2, 3.6, -1); // long duct — hold the slide
  strip(-1.5, 83.6, 1.5, 84.2, -1);
  flag(-1.7, 83.9, -1);
  flag(1.7, 83.9, -1);
  parapet(-9.25, 62, -8.85, 85, -1);
  parapet(8.85, 62, 9.25, 85, -1);
  acUnit(-6.5, 63.5, -1);
  acUnit(6.5, 83, -1);

  // ========================== SECTION 4 — WALL RUN ==========================
  // gap 4.5 m, down 0.5 m
  building('facadeWhite', -3, 89.5, 8, 96.5, -1.5);
  strip(3.0, 95.5, 5.0, 96.1, -1.5);
  flag(2.9, 95.8, -1.5);
  flag(5.1, 95.8, -1.5);
  acUnit(0, 92, -1.5, 1.1, 0.7, 0.9);
  // 10.5 m gap — runnable wall on the RIGHT (red panels mark it)
  wallRunnable(4.5, 96.7, 6.5, 108.3, -7, 5.5);
  box('red', 4.42, 0.3, 97.2, 4.5, 0.95, 107.9);
  for (const z of [98.4, 101.2, 104.0, 106.8]) box('red', 4.42, 1.4, z, 4.5, 4.6, z + 1.2);
  // landing
  building('glass', -6.5, 107, 6.5, 119, -1.5);
  strip(-1, 117.8, 2, 118.4, -1.5);
  flag(-1.2, 118.1, -1.5);
  flag(2.2, 118.1, -1.5);
  acUnit(-4.5, 116, -1.5);

  // ========================= SECTION 5 — COMBINATION =========================
  // gap 3 m, up 0.5 m
  building('facadeWhite', -7, 122, 7, 132, -1);
  vaultBox(0, 127.5, -1, 4.2, 1.1, 0.9);
  strip(-1.2, 130.8, 1.2, 131.4, -1);
  flag(-1.4, 131.1, -1);
  flag(1.4, 131.1, -1);
  acUnit(5, 124, -1);
  // gap 4.5 m
  building('facadeWhite', -6.5, 136.5, 2.5, 150.5, -1);
  strip(-5.4, 149.3, -3.8, 149.9, -1);
  flag(-5.5, 149.6, -1);
  flag(-3.6, 149.6, -1);
  // 10.5 m gap — runnable wall on the LEFT (red panels mark it)
  wallRunnable(-6.9, 150.7, -4.9, 162.3, -7, 5.5);
  box('red', -4.9, 0.3, 151.2, -4.82, 0.95, 161.9);
  for (const z of [152.4, 155.2, 158.0, 160.8]) box('red', -4.9, 1.4, z, -4.82, 4.6, z + 1.2);
  // landing + slide bar
  building('facadeGray', -6.5, 161, 6.5, 172, -0.5);
  slideBar(-6.5, 6.5, 168, 1.4, -0.5);
  strip(-1.5, 170.8, 1.5, 171.4, -0.5);
  flag(-1.7, 171.1, -0.5);
  flag(1.7, 171.1, -0.5);

  // ========================= SECTION 6 — FINAL SPRINT =========================
  // gap 4 m, down 0.5 m
  building('facadeWhite', -6, 176, 6, 186, -1);
  strip(-1.5, 184.8, 1.5, 185.4, -1);
  flag(-1.7, 185.1, -1);
  flag(1.7, 185.1, -1);
  acUnit(4.5, 179, -1);
  // gap 4.5 m, down 0.5 m
  building('glass', -6, 190.5, 6, 200.5, -1.5);
  strip(-1.5, 199.3, 1.5, 199.9, -1.5);
  flag(-1.7, 199.6, -1.5);
  flag(1.7, 199.6, -1.5);
  // gap 4 m, down 0.5 m — final roof with the finish gate
  building('facadeWhite', -7, 204.5, 7, 216.5, -2);
  box('red', -2, -1.98, 205, 2, -1.92, 210.6); // red runway carpet
  box('red', -3.2, -2, 210.6, -2.6, 1.6, 211.2);
  solid(-3.2, -2, 210.6, -2.6, 1.6, 211.2);
  box('red', 2.6, -2, 210.6, 3.2, 1.6, 211.2);
  solid(2.6, -2, 210.6, 3.2, 1.6, 211.2);
  box('red', -3.2, 1.6, 210.6, 3.2, 2.0, 211.2);
  flag(-3.4, 213.5, -2);
  flag(3.4, 213.5, -2);

  // FINISH banner (unique textured plane, kept out of the merged buckets)
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.1), mats.banner);
  banner.position.set(0, 1.05, 210.9);
  scene.add(banner);

  // ------------------------------ merge & add ------------------------------
  const matFor: Record<BucketKey, THREE.Material> = {
    roof: mats.roof,
    facadeWhite: mats.facadeWhite,
    facadeGray: mats.facadeGray,
    glass: mats.glass,
    red: mats.red,
    dark: mats.dark,
    metal: mats.metal,
  };
  for (const key of Object.keys(buckets) as BucketKey[]) {
    const geos = buckets[key];
    if (geos.length === 0) continue;
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, matFor[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ------------------------------ gameplay data ------------------------------
  const checkpoints = new CheckpointSystem(scene);
  checkpoints.add(new THREE.Vector3(0, 0, -7), Math.PI); // 0 — spawn
  checkpoints.add(new THREE.Vector3(0, 0, 17.5), Math.PI); // 1 — section 2
  checkpoints.add(new THREE.Vector3(0, -1, 64), Math.PI); // 2 — section 3
  checkpoints.add(new THREE.Vector3(2.5, -1.5, 91), Math.PI); // 3 — section 4
  checkpoints.add(new THREE.Vector3(0, -1, 124), Math.PI); // 4 — section 5
  checkpoints.add(new THREE.Vector3(0, -0.5, 163.5), Math.PI); // 5 — section 6

  const hints: HintZone[] = [
    { min: new THREE.Vector3(-3.5, -1, -11), max: new THREE.Vector3(3.5, 3, -3), text: 'WASD — MOVE · MOUSE — LOOK · SHIFT — SPRINT' },
    { min: new THREE.Vector3(-4, -1, -2), max: new THREE.Vector3(4, 3, 4.5), text: 'SPACE — JUMP · E — VAULT THE VENT' },
    { min: new THREE.Vector3(-4, -1, 5), max: new THREE.Vector3(4, 3, 9), text: 'CTRL / C — SLIDE UNDER THE PIPE' },
    { min: new THREE.Vector3(-7, -1, 15.5), max: new THREE.Vector3(7, 3, 22), text: 'SPRINT-JUMP BETWEEN ROOFTOPS — RED MARKS THE WAY' },
    { min: new THREE.Vector3(-9, -2, 62), max: new THREE.Vector3(9, 2, 67.5), text: 'HOLD CTRL TO KEEP SLIDING UNDER THE DUCTS' },
    { min: new THREE.Vector3(-3, -2.5, 89.5), max: new THREE.Vector3(8, 2, 96), text: 'JUMP TO THE RED WALL — RUN ALONG IT · SPACE TO LEAP OFF' },
    { min: new THREE.Vector3(-7, -2, 122), max: new THREE.Vector3(7, 2, 128), text: 'VAULT (E) — THEN SPRINT-JUMP THE GAP' },
    { min: new THREE.Vector3(-6.5, -2, 136.5), max: new THREE.Vector3(2.5, 2, 145), text: 'WALL RUN ON THE RIGHT — STAY CLOSE TO THE RED WALL' },
    { min: new THREE.Vector3(-6.5, -2, 161), max: new THREE.Vector3(6.5, 2.5, 167), text: 'SLIDE — THEN FULL SPRINT TO THE FINISH' },
  ];

  return {
    spawn: { pos: new THREE.Vector3(0, 0, -7), yaw: Math.PI },
    checkpoints,
    hints,
    finish: {
      min: new THREE.Vector3(-3.4, -2.6, 210.2),
      max: new THREE.Vector3(3.4, 1.8, 211.6),
    },
    killY: -24,
  };
}
