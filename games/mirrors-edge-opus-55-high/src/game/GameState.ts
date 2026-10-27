/** Run phase and timer bookkeeping. */
export type Phase = 'menu' | 'playing' | 'paused' | 'finished';

export class GameState {
  phase: Phase = 'menu';
  /** Index (into LEVELS) of the level currently loaded. */
  levelIndex = 0;
  /** Elapsed run time in seconds (only counts while playing). */
  runTime = 0;
  /** The timer starts on the player's first movement. */
  timerRunning = false;
  respawns = 0;

  resetRun(): void {
    this.runTime = 0;
    this.timerRunning = false;
    this.respawns = 0;
  }
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
