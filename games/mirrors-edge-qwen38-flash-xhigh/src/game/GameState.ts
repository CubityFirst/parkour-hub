/**
 * Game phase state + persisted player settings.
 */

export type GamePhase = 'menu' | 'controls' | 'playing' | 'paused' | 'finished';

export interface Settings {
  /** mouse multiplier, 0.25 .. 3.0 */
  sensitivity: number;
  /** camera motion effects scale, 0 (reduced) .. 1 (full) */
  cameraMotion: number;
  sound: boolean;
}

const SETTINGS_KEY = 'rooftop-flow.settings.v1';
const BEST_KEY = 'rooftop-flow.best.v1';

export const defaultSettings = (): Settings => ({
  sensitivity: 1,
  cameraMotion: 1,
  sound: true,
});

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    /* private mode etc. */
  }
  return defaultSettings();
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadBestTime(): number | null {
  try {
    const v = localStorage.getItem(BEST_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function saveBestTime(ms: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

export function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
