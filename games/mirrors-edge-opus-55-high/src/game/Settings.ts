/** Player-adjustable options, persisted in localStorage. */
export interface Settings {
  sensitivity: number;
  reducedMotion: boolean;
  fov: number;
  volume: number;
  quality: 'high' | 'low';
  invertY: boolean;
}

const KEY = 'rooftop-flow.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  reducedMotion: false,
  fov: 82,
  volume: 0.8,
  quality: 'high',
  invertY: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable - use defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
