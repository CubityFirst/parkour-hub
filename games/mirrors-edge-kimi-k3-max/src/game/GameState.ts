/** Game-wide state types and settings/best-time persistence. */

export type GamePhase = 'menu' | 'playing' | 'paused' | 'finished';

export type CameraMotion = 'full' | 'reduced';

export interface Settings {
  /** Mouse sensitivity multiplier, 0.3 – 2.0. */
  sensitivity: number;
  cameraMotion: CameraMotion;
}

const SENS_KEY = 'rooftop-flow:sensitivity';
const MOTION_KEY = 'rooftop-flow:camera-motion';
const BEST_KEY = 'rooftop-flow:best-time';

export function loadSettings(): Settings {
  const sens = parseFloat(localStorage.getItem(SENS_KEY) ?? '');
  const motion = localStorage.getItem(MOTION_KEY);
  return {
    sensitivity: Number.isFinite(sens) ? Math.min(2, Math.max(0.3, sens)) : 1,
    cameraMotion: motion === 'reduced' ? 'reduced' : 'full',
  };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SENS_KEY, String(s.sensitivity));
  localStorage.setItem(MOTION_KEY, s.cameraMotion);
}

export function loadBestTime(): number | null {
  const v = parseFloat(localStorage.getItem(BEST_KEY) ?? '');
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function saveBestTime(t: number): void {
  localStorage.setItem(BEST_KEY, String(t));
}

/** Format seconds as m:ss.mmm */
export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t * 1000) % 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
