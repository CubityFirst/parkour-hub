import type { AABB, CollisionWorld } from './CollisionWorld';

/**
 * Pure data description of the playable level. No Three.js objects live here
 * so the same layout can drive rendering, collision and the headless
 * completability simulation (scripts/simulate.ts).
 *
 * Coordinates: metres, +Y up, the route runs toward -Z ("north").
 */

export type MaterialKey =
  | 'office'
  | 'officeOrange'
  | 'glass'
  | 'concrete'
  | 'white'
  | 'red'
  | 'redDark'
  | 'orange'
  | 'dark'
  | 'metal'
  | 'grate'
  | 'skylight';

export interface BoxDef extends AABB {
  mat: MaterialKey;
  collide: boolean;
  tags: number;
  shadow: boolean;
}

export interface CylinderDef {
  x: number;
  y: number;
  z: number;
  radius: number;
  length: number;
  axis: 'x' | 'y' | 'z';
  mat: MaterialKey;
}

export interface CheckpointDef {
  index: number;
  title: string;
  trigger: AABB;
  spawn: [number, number, number];
  yaw: number;
  marker: [number, number, number];
}

export interface HintDef {
  trigger: AABB;
  text: string;
}

export interface FlagDef {
  x: number;
  y: number;
  z: number;
  /** direction the cloth hangs toward, radians around Y */
  angle: number;
}

export interface BillboardDef {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  /** rotation around Y */
  angle: number;
  text: string;
  sub: string;
}

/** Lighting / sky mood of a level. Colours are hex RGB. */
export interface LevelTheme {
  /** Direction toward the sun (normalised at use). */
  sunDir: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  zenith: number;
  horizon: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogDensity: number;
  exposure: number;
  clouds: number;
}

export const DEFAULT_THEME: LevelTheme = {
  sunDir: [-0.62, 0.66, -0.3],
  sunColor: 0xfff3e2,
  sunIntensity: 2.25,
  zenith: 0x2a6ccc,
  horizon: 0xd4e4f2,
  hemiSky: 0xcfe0ff,
  hemiGround: 0xe6ddd0,
  hemiIntensity: 0.6,
  fogDensity: 0.00135,
  exposure: 1.06,
  clouds: 1,
};

export interface LevelData {
  /** Stable id used for saved best times. */
  id: string;
  name: string;
  tagline: string;
  /** Subtitle of the toast shown when the run starts. */
  startTitle: string;
  theme: LevelTheme;
  /** Seed for the procedural background city. */
  citySeed: number;
  boxes: BoxDef[];
  cylinders: CylinderDef[];
  checkpoints: CheckpointDef[];
  hints: HintDef[];
  flags: FlagDef[];
  billboards: BillboardDef[];
  finish: AABB;
  finishMarker: [number, number, number];
  spawn: [number, number, number];
  spawnYaw: number;
  killY: number;
  /** Rough bounds of the playable area (keeps background city away). */
  bounds: AABB;
}

/** Collision-only boxes whose visual is provided by another shape. */
export const hiddenBoxes = new WeakSet<BoxDef>();

/** Build the collision world for a layout (shared by game and simulation). */
export function createCollisionWorld(data: LevelData, world: CollisionWorld): CollisionWorld {
  for (const box of data.boxes) {
    if (box.collide) world.add(box, box.tags);
  }
  return world;
}
