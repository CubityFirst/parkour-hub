/**
 * Minimal vector/math helpers shared by the (DOM-free) physics layers.
 * Keeping these dependency-free lets the collision and movement code run
 * in headless verification scripts as well as in the browser.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential smoothing factor. */
export const smooth = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Moves `current` toward `target` by at most `maxDelta`. */
export const approach = (current: number, target: number, maxDelta: number): number => {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
};

export const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

export const addScaled = (out: Vec3, a: Vec3, s: number): Vec3 => {
  out.x += a.x * s;
  out.y += a.y * s;
  out.z += a.z * s;
  return out;
};

/**
 * Shortest signed angle difference (a - b) wrapped into [-PI, PI].
 * Used to ease yaw/pitch toward mouse targets.
 */
export const angleDiff = (a: number, b: number): number => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Squared distance from point p to segment [a,b]; t is the clamped projection. */
export const pointSegmentDistSq = (
  p: Vec3,
  a: Vec3,
  b: Vec3,
): { distSq: number; t: number } => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  const t = lenSq > 1e-9 ? clamp((apx * abx + apy * aby + apz * abz) / lenSq, 0, 1) : 0;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return { distSq: dx * dx + dy * dy + dz * dz, t };
};
