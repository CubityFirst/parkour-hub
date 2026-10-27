export enum GamePhase {
  Menu = 'menu',
  Playing = 'playing',
  Paused = 'paused',
  Finished = 'finished',
}

const BEST_KEY = 'rooftop-flow:best';

export function formatTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const centis = Math.floor((clamped * 100) % 100);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export class GameState {
  phase = GamePhase.Menu;
  elapsed = 0;
  timerRunning = false;
  checkpoint = 0;
  best: number | null = null;

  constructor() {
    this.loadBest();
  }

  private loadBest(): void {
    try {
      const stored = localStorage.getItem(BEST_KEY);
      if (stored) {
        const value = Number.parseFloat(stored);
        if (Number.isFinite(value) && value > 0) this.best = value;
      }
    } catch {
      this.best = null;
    }
  }

  resetRun(): void {
    this.elapsed = 0;
    this.timerRunning = false;
    this.checkpoint = 0;
  }

  update(dt: number): void {
    if (this.phase === GamePhase.Playing && this.timerRunning) {
      this.elapsed += dt;
    }
  }

  completeRun(): { time: number; isBest: boolean } {
    this.timerRunning = false;
    const time = this.elapsed;
    const previous = this.best;
    const isBest = previous === null || time < previous;
    if (isBest) {
      this.best = time;
      try {
        localStorage.setItem(BEST_KEY, String(time));
      } catch {
        /* Storage can be unavailable in private contexts. */
      }
    }
    return { time, isBest };
  }
}
