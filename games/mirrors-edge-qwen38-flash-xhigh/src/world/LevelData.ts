/**
 * Level definition — pure data, no rendering.
 *
 * The parkour route runs in the -Z direction from the start rooftop (z ~ +27)
 * to the finish gate (z ~ -221). Every traversal decision is expressed as
 * axis-aligned boxes so the same data drives both collision and visuals, and
 * so a headless bot can verify the route is completable (see /verify).
 *
 * Design values cross-checked with the movement constants in Movement.ts:
 *   - full-hold sprint jump covers ~5.7m; flat gaps kept at <= 4.6m
 *   - wall run required at the 7m gap (S4)
 *   - zipline required at the 13m gap (S4 -> S5), per reference image 1
 */

import type { Vec3 } from '../core/vec3.ts';

export type MatKind = 'white' | 'concrete' | 'red' | 'redEmissive' | 'glass' | 'dark';

export interface Prim {
  min: Vec3;
  max: Vec3;
  mat: MatKind;
  /** true => participates in collision (default true for gameplay shapes) */
  collide?: boolean;
  /** surface intended for wall-running (gets the red stripe treatment) */
  wallRun?: boolean;
  /** obstacle the vault system is allowed to lift the player over */
  vaultable?: boolean;
}

export interface TriggerZone {
  min: Vec3;
  max: Vec3;
}

export interface CheckpointDef {
  id: number;
  label: string;
  zone: TriggerZone;
  /** where the player respawns when falling; feet position + facing yaw (rad, 0 = -Z) */
  respawn: { pos: Vec3; yaw: number };
}

export interface HintDef {
  id: string;
  zone: TriggerZone;
  text: string;
  sub: string;
}

export interface CableDef {
  a: Vec3;
  b: Vec3;
}

export interface LevelData {
  prims: Prim[];
  /** jump/landing chevron pads — pure visual, runner-vision red */
  pads: Prim[];
  checkpoints: CheckpointDef[];
  hints: HintDef[];
  cables: CableDef[];
  /** decorative flagpoles at rooftop corners: [x, y(top), z] */
  flags: Vec3[];
  spawn: { pos: Vec3; yaw: number };
  finishZone: TriggerZone;
}

// ---------------------------------------------------------------------------
// Box helpers (build with min/max from a centre footprint)
// ---------------------------------------------------------------------------

const box = (
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  mat: MatKind,
  extra: Partial<Prim> = {},
): Prim => ({
  min: { x: minX, y: minY, z: minZ },
  max: { x: maxX, y: maxY, z: maxZ },
  mat,
  ...extra,
});

/** Rooftop block: footprint x/z, top surface y, sunk deep into the canyon. */
const roof = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  top: number,
  mat: MatKind = 'white',
): Prim[] => [box(x0, -8, Math.min(z0, z1), x1, top, Math.max(z0, z1), mat)];

/** Thin flat pad lying on a roof surface (visual only). */
const pad = (
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  surfaceY: number,
  mat: MatKind = 'redEmissive',
): Prim => box(x0, surfaceY + 0.012, z0, x1, surfaceY + 0.052, z1, mat, { collide: false });

export function buildLevelData(): LevelData {
  const P: Prim[] = []; // colliders
  const pads: Prim[] = []; // visual chevrons/markings
  const V = (p: Prim) => P.push(p);
  const S = (p: Prim) => {
    p.collide = false;
    P.push(p);
  };

  // =====================================================================
  // SECTION 1 — Movement tutorial rooftop (y = 20)
  // =====================================================================
  P.push(...roof(-13, 13, 1, 27, 20));
  // parapet lips along the start roof (low enough to auto-step past)
  V(box(-13, 20, 26.6, 13, 20.28, 27, 'concrete'));
  V(box(-13, 20, 1.0, 13, 20.28, 1.38, 'concrete'));
  // rooftop clutter: AC units & vents (gray boxes)
  V(box(-9, 20, 8, -6.6, 21.15, 10.6, 'concrete'));
  V(box(-5.6, 20, 20.5, -2.6, 21.5, 23.4, 'concrete'));
  V(box(6.4, 20, 15, 9.6, 20.75, 18.4, 'concrete'));
  V(box(8.5, 20, 3, 11.4, 22.4, 6.2, 'white'));
  // red stair-block to the AC unit (route flavour, optional)
  V(box(4.2, 20, 23.6, 5.6, 20.42, 25.2, 'red'));
  V(box(4.2, 20.42, 24.2, 5.6, 20.84, 25.2, 'red'));

  // Tutorial obstacle 1: vault hurdle (red, ~waist height)
  V(box(-2.1, 20, 17.4, 2.1, 20.92, 18.0, 'red', { vaultable: true }));
  S(box(-2.5, 20, 17.25, 2.5, 20.06, 18.15, 'redEmissive'));
  // Tutorial obstacle 2: low beam — slide underneath
  V(box(-5.0, 20, 12.6, -4.3, 21.68, 13.2, 'concrete'));
  V(box(4.3, 20, 12.6, 5.0, 21.68, 13.2, 'concrete'));
  V(box(-5.0, 20.96, 12.6, 5.0, 21.62, 13.2, 'red', { vaultable: true }));
  // red pipe along the exit edge marks the first jump
  S(box(-4.2, 20.5, 1.28, 4.2, 20.84, 1.72, 'redEmissive'));

  pads.push(pad(-1.4, 2.4, 1.4, 4.4, 20)); // landing marker beyond first gap

  // =====================================================================
  // SECTION 2 — Rooftop jumps (4.5m gaps, slight drops)
  // =====================================================================
  P.push(...roof(-8, 8, -2.2, -13.8, 20));
  V(box(-6.8, 20, -6.4, -4.2, 21.3, -4.6, 'concrete')); // AC unit right of line
  V(box(4.6, 20, -11.6, 6.4, 20.6, -9.4, 'concrete'));
  S(box(-3.4, 20.5, -13.6, 3.4, 20.84, -13.24, 'redEmissive')); // take-off pipe edge
  pads.push(pad(-1.4, -16.6, 1.4, -14.6, 19.3));

  P.push(...roof(-7, 7, -18.3, -29, 19.3));
  V(box(-5.6, 19.3, -22.2, -3.2, 20.35, -20.2, 'concrete'));
  V(box(3.4, 19.3, -26.8, 5.2, 20.9, -24.8, 'white'));
  S(box(-3.2, 19.8, -28.86, 3.2, 20.14, -28.5, 'redEmissive'));
  pads.push(pad(-1.4, -32.2, 1.4, -30.2, 19));

  P.push(...roof(-9, 5, -33.5, -46, 19));
  V(box(-7.8, 19, -36.6, -5.4, 20.2, -34.2, 'concrete'));
  V(box(2.6, 19, -41, 5.0, 20.6, -38.4, 'concrete'));
  S(box(-4.6, 19.5, -45.86, 1.0, 19.84, -45.5, 'redEmissive'));

  // Checkpoint 1 — rooftop door on R3
  const CP1: CheckpointDef = {
    id: 1,
    label: 'CHECKPOINT 1',
    zone: { min: { x: -2, y: 19, z: -44.2 }, max: { x: 2, y: 21.6, z: -41.8 } },
    respawn: { pos: { x: 0, y: 19, z: -40.5 }, yaw: 0 },
  };
  V(box(-2.9, 19, -44.05, -2.15, 21.9, -43.6, 'red'));
  V(box(2.15, 19, -44.05, 2.9, 21.9, -43.6, 'red'));
  S(box(-2.15, 21.6, -44.05, 2.15, 21.95, -43.6, 'redEmissive'));
  S(pad(-2.15, -44.1, 2.15, -43.55, 19));

  // =====================================================================
  // SECTION 3 — Sliding challenge (low vents at head height)
  // =====================================================================
  P.push(...roof(-5, 5, -50.5, -90, 19));
  V(box(-4.4, 19, -53.6, -2.2, 20.4, -51.2, 'concrete'));
  V(box(2.2, 19, -56.8, 4.4, 20.15, -54.6, 'concrete'));
  // slide beams: bottom edge 0.98m above deck => must slide
  const slideZs = [-58.5, -65, -71.5, -78];
  for (const z of slideZs) {
    V(box(-5, 19.98, z, 5, 20.62, z + 0.66, 'red', { vaultable: true }));
    V(box(-5, 19, z, -4.45, 20.62, z + 0.66, 'concrete'));
    V(box(4.45, 19, z, 5, 20.62, z + 0.66, 'concrete'));
    S(box(-3, 19.014, z - 0.9, 3, 19.05, z - 0.25, 'redEmissive'));
  }
  V(box(2.6, 19, -84.6, 4.6, 20.3, -82.6, 'concrete'));
  // vault gate near the exit (width 6, ~1.15m tall — vault or jump-over)
  V(box(-3, 19, -87.9, 3, 20.15, -87.35, 'red', { vaultable: true }));
  S(box(-3.3, 19.014, -88.4, 3.3, 19.05, -87.75, 'redEmissive'));
  S(box(-3.2, 20.15, -87.9, 3.2, 20.26, -87.35, 'redEmissive'));

  // =====================================================================
  // SECTION 4 — Wall run across the 7m gap, then the zipline
  // =====================================================================
  P.push(...roof(-3.5, 3.5, -93.5, -99.5, 18.8));
  S(box(-2.4, 19.3, -99.36, 2.4, 19.64, -99.0, 'redEmissive')); // take-off pipe

  // The glass tower whose left face (x = 4.2) is the wall-run surface.
  V(box(4.2, -8, -99, 24, 36, -110, 'glass', { wallRun: true }));
  // red runner-vision stripe on the runnable face (visual only)
  S(box(4.08, 20.35, -99.4, 4.19, 20.95, -109.6, 'redEmissive'));
  S(box(4.08, 18.9, -99.4, 4.19, 19.5, -109.6, 'redEmissive'));
  // opposite-side clutter so the gap reads as a canyon
  V(box(-24, -8, -100, -6.5, 26, -116, 'white'));

  P.push(...roof(-6, 4, -106.5, -124, 18.8));
  V(box(-5.2, 18.8, -112.8, -3, 19.9, -110.6, 'concrete'));
  const CP2: CheckpointDef = {
    id: 2,
    label: 'CHECKPOINT 2',
    zone: { min: { x: -2, y: 18.8, z: -118.6 }, max: { x: 2, y: 21.4, z: -116.4 } },
    respawn: { pos: { x: 0, y: 18.8, z: -113.5 }, yaw: 0 },
  };
  V(box(-2.9, 18.8, -118.45, -2.15, 21.7, -118.0, 'red'));
  V(box(2.15, 18.8, -118.45, 2.9, 21.7, -118.0, 'red'));
  S(box(-2.15, 21.4, -118.45, 2.15, 21.75, -118.0, 'redEmissive'));
  S(pad(-2.15, -118.5, 2.15, -117.95, 18.8));
  V(box(1.6, 18.8, -122.4, 3.6, 19.8, -120.6, 'concrete'));

  // staging platform before the zipline
  P.push(...roof(-4, 4, -127, -132, 18.8));
  V(box(-3.4, 18.8, -129.4, -1.8, 19.7, -127.9, 'concrete'));
  S(box(-2.6, 19.3, -131.86, 2.6, 19.64, -131.5, 'redEmissive')); // jump-from pipe
  pads.push(pad(-2.4, -134.6, 2.4, -132.6, 18.7, 'red'));

  // zipline cable across the 13m void (reference image 1).
  // Release point (b) is ~2.1m above deck height and directly over platform
  // D's edge, so the rider drops onto the deck instead of into the ledge.
  const cables: CableDef[] = [
    { a: { x: 0, y: 21.9, z: -131.8 }, b: { x: 0, y: 20.62, z: -145.0 } },
  ];
  // cable support pylons (colliders) — clear of the x=0 running line
  V(box(-2.3, 18.8, -131.85, -2.0, 22.0, -131.55, 'red'));
  V(box(2.0, 18.8, -131.85, 2.3, 22.0, -131.55, 'red'));
  S(box(-2.3, 21.82, -131.85, 2.3, 22.06, -131.55, 'concrete'));

  P.push(...roof(-5, 5, -145, -153, 18.5));
  V(box(-4.45, 18.5, -145.45, -4.15, 20.72, -145.15, 'red')); // zip pylon
  V(box(4.15, 18.5, -145.45, 4.45, 20.72, -145.15, 'red'));
  S(box(-4.45, 20.54, -145.45, 4.45, 20.78, -145.15, 'concrete'));
  V(box(3.2, 18.5, -150.4, 4.8, 19.6, -148.6, 'concrete'));
  const CP3: CheckpointDef = {
    id: 3,
    label: 'CHECKPOINT 3',
    zone: { min: { x: -2, y: 18.5, z: -152.2 }, max: { x: 2, y: 21.1, z: -150 } },
    respawn: { pos: { x: 0, y: 18.5, z: -148 }, yaw: 0 },
  };
  V(box(-2.9, 18.5, -152.05, -2.15, 21.4, -151.6, 'red'));
  V(box(2.15, 18.5, -152.05, 2.9, 21.4, -151.6, 'red'));
  S(box(-2.15, 21.1, -152.05, 2.15, 21.45, -151.6, 'redEmissive'));
  S(pad(-2.15, -152.1, 2.15, -151.55, 18.5));

  // =====================================================================
  // SECTION 5 — Combination: bridge, hurdles, slide, final jumps
  // =====================================================================
  // narrow bridge out of platform D
  P.push(...roof(-1.7, 1.7, -153, -169, 18.5, 'concrete'));
  V(box(-1.72, 18.5, -169, -1.46, 18.8, -153, 'white')); // curbs
  V(box(1.46, 18.5, -169, 1.72, 18.8, -153, 'white'));
  S(box(-1.7, 18.52, -155, -1.64, 18.58, -153.2, 'redEmissive'));
  S(box(1.64, 18.52, -155, 1.7, 18.58, -153.2, 'redEmissive'));

  P.push(...roof(-7, 7, -169, -180.5, 18.5));
  V(box(-6.2, 18.5, -171.6, -4.4, 19.4, -170.2, 'concrete'));
  // two vault hurdles
  V(box(-3, 18.5, -173.6, 3, 19.42, -173.05, 'red', { vaultable: true }));
  V(box(-3, 18.5, -177.4, 3, 19.42, -176.85, 'red', { vaultable: true }));
  S(box(-3.3, 18.514, -174.2, 3.3, 18.55, -173.9, 'redEmissive'));
  S(box(-3.3, 18.514, -178, 3.3, 18.55, -177.7, 'redEmissive'));
  // low beam just before the ledge: slide through the corridor
  V(box(-7, 19.48, -179.6, 7, 20.1, -179.0, 'red', { vaultable: true }));
  V(box(-7, 18.5, -179.6, -6.45, 20.1, -179.0, 'concrete'));
  V(box(6.45, 18.5, -179.6, 7, 20.1, -179.0, 'concrete'));
  S(box(-3, 18.514, -178.9, 3, 18.55, -178.3, 'redEmissive'));

  // =====================================================================
  // SECTION 6 — Final sprint to the gate
  // =====================================================================
  P.push(...roof(-7, 7, -184.5, -195, 18.8));
  V(box(-6, 18.8, -187.4, -4.2, 19.9, -185.6, 'concrete'));
  const CP4: CheckpointDef = {
    id: 4,
    label: 'CHECKPOINT 4',
    zone: { min: { x: -2, y: 18.8, z: -190.2 }, max: { x: 2, y: 21.4, z: -188 } },
    respawn: { pos: { x: 0, y: 18.8, z: -186 }, yaw: 0 },
  };
  V(box(-2.9, 18.8, -190.05, -2.15, 21.7, -189.6, 'red'));
  V(box(2.15, 18.8, -190.05, 2.9, 21.7, -189.6, 'red'));
  S(box(-2.15, 21.4, -190.05, 2.15, 21.75, -189.6, 'redEmissive'));
  S(pad(-2.15, -190.1, 2.15, -189.55, 18.8));
  S(box(-4, 19.3, -194.86, 4, 19.64, -194.5, 'redEmissive'));

  P.push(...roof(-7, 6, -198.2, -205, 18.8));
  pads.push(pad(-1.4, -207.8, 1.4, -205.8, 18.8));
  P.push(...roof(-7, 6, -208.2, -226, 18.8));
  V(box(3.4, 18.8, -213.6, 5.2, 19.9, -211.8, 'concrete'));
  V(box(-5.8, 18.8, -217.8, -4, 20.2, -215.8, 'concrete'));

  // Finish gate — the big red marker
  const finishZone: TriggerZone = {
    min: { x: -2.6, y: 18.8, z: -221.8 },
    max: { x: 2.6, y: 21.6, z: -220.2 },
  };
  V(box(-3.35, 18.8, -221.4, -2.65, 22.6, -220.6, 'red'));
  V(box(2.65, 18.8, -221.4, 3.35, 22.6, -220.6, 'red'));
  S(box(-2.65, 22.3, -221.4, 2.65, 22.6, -220.6, 'redEmissive'));
  S(box(-2.65, 21.5, -221.15, 2.65, 22.3, -220.85, 'redEmissive'));
  S(box(-4.6, 18.81, -223.4, 4.6, 18.85, -218.6, 'redEmissive')); // gate floor glow
  // helipad-style deco ring past the gate
  S(box(-5.2, 18.85, -225.2, 5.2, 18.87, -224.8, 'red'));

  const checkpoints: CheckpointDef[] = [CP1, CP2, CP3, CP4];

  const hints: HintDef[] = [
    {
      id: 'h-wasd',
      zone: { min: { x: -12, y: 20, z: 16 }, max: { x: 12, y: 22, z: 26 } },
      text: 'WASD — MOVE',
      sub: 'HOLD SHIFT TO SPRINT',
    },
    {
      id: 'h-vault',
      zone: { min: { x: -8, y: 20, z: 13.4 }, max: { x: 8, y: 22, z: 16.4 } },
      text: 'E — VAULT',
      sub: 'LIFT OVER LOW OBSTACLES, KEEP YOUR SPEED',
    },
    {
      id: 'h-slide',
      zone: { min: { x: -8, y: 20, z: 9.2 }, max: { x: 8, y: 22, z: 12.2 } },
      text: 'CTRL OR C — SLIDE',
      sub: 'SLIDE UNDER THE BEAM AT SPEED',
    },
    {
      id: 'h-jump',
      zone: { min: { x: -12, y: 20, z: 1.2 }, max: { x: 12, y: 22, z: 5.4 } },
      text: 'SPACE — JUMP',
      sub: 'SPRINTING CARRIES YOU FURTHER',
    },
    {
      id: 'h-gaps',
      zone: { min: { x: -8, y: 20, z: -12.6 }, max: { x: 8, y: 22, z: -8 } },
      text: 'FOLLOW THE RED',
      sub: 'RED MARKS EVERY TAKE-OFF',
    },
    {
      id: 'h-slide2',
      zone: { min: { x: -5, y: 19, z: -57.2 }, max: { x: 5, y: 21, z: -53.5 } },
      text: 'SLIDE CHAIN',
      sub: 'KEEP SPRINTING — SLIDE UNDER EVERY BEAM',
    },
    {
      id: 'h-vault2',
      zone: { min: { x: -5, y: 19, z: -86.6 }, max: { x: 5, y: 21, z: -83.5 } },
      text: 'VAULT THE GATE',
      sub: 'PRESS E AT SPEED',
    },
    {
      id: 'h-wallrun',
      zone: { min: { x: -3.5, y: 18.8, z: -97.4 }, max: { x: 3.5, y: 21, z: -93.6 } },
      text: 'WALL RUN',
      sub: 'JUMP RIGHT AT THE GAP AND RUN THE RED WALL',
    },
    {
      id: 'h-zipline',
      zone: { min: { x: -4, y: 18.8, z: -126.6 }, max: { x: 4, y: 21.4, z: -124.5 } },
      text: 'ZIPLINE',
      sub: 'SPRINT OFF THE EDGE AND GRAB THE CABLE',
    },
    {
      id: 'h-combo',
      zone: { min: { x: -1.7, y: 18.5, z: -160 }, max: { x: 1.7, y: 21, z: -154 } },
      text: 'VAULT · SLIDE · JUMP',
      sub: 'COMBINE THE MOVES — FLOW IS SPEED',
    },
    {
      id: 'h-finish',
      zone: { min: { x: -7, y: 18.8, z: -212.5 }, max: { x: 6, y: 21.4, z: -208.5 } },
      text: 'FINAL SPRINT',
      sub: 'REACH THE RED GATE',
    },
  ];

  const flags: Vec3[] = [
    { x: -12.2, y: 20, z: 25.8 },
    { x: 12.2, y: 20, z: 2.2 },
    { x: 7.2, y: 20, z: -13 },
    { x: -8.2, y: 19, z: -34.5 },
    { x: -4.2, y: 19, z: -89.2 },
    { x: 3.6, y: 18.8, z: -111 },
    { x: -4.2, y: 18.5, z: -152.2 },
    { x: -6.2, y: 18.8, z: -194.4 },
    { x: -6.2, y: 18.8, z: -224.8 },
  ];

  return {
    prims: P,
    pads,
    checkpoints,
    hints,
    cables,
    flags,
    spawn: { pos: { x: 0, y: 20.06, z: 23.5 }, yaw: 0 },
    finishZone,
  };
}

export const FALL_KILL_Y = -2.5;
