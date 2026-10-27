/**
 * Saved progression: which levels are unlocked and the best time on each.
 * Stored in localStorage; finishing level N unlocks level N + 1.
 */
interface SaveData {
  /** Index of the highest unlocked level. */
  unlocked: number;
  best: Record<string, number>;
  completed: Record<string, boolean>;
}

const KEY = 'rooftop-flow.progress.v1';
const LEGACY_BEST_KEY = 'rooftop-flow.best.v1';

export class Progress {
  private data: SaveData;

  constructor(private levelCount: number) {
    this.data = this.load();
  }

  get unlocked(): number {
    return Math.min(this.data.unlocked, this.levelCount - 1);
  }

  isUnlocked(index: number): boolean {
    return index <= this.unlocked;
  }

  isCompleted(id: string): boolean {
    return !!this.data.completed[id];
  }

  best(id: string): number | null {
    const b = this.data.best[id];
    return typeof b === 'number' && b > 0 ? b : null;
  }

  /**
   * Record a finished run. Returns whether it set a new best time and
   * whether it unlocked a new level.
   */
  complete(index: number, id: string, time: number): { record: boolean; unlockedNext: boolean } {
    const prev = this.best(id);
    const record = prev === null || time < prev;
    if (record) this.data.best[id] = time;
    this.data.completed[id] = true;
    const unlockedNext = index + 1 < this.levelCount && this.data.unlocked < index + 1;
    if (unlockedNext) this.data.unlocked = index + 1;
    this.save();
    return { record, unlockedNext };
  }

  private load(): SaveData {
    const fresh: SaveData = { unlocked: 0, best: {}, completed: {} };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<SaveData>;
        return {
          unlocked: typeof d.unlocked === 'number' ? d.unlocked : 0,
          best: d.best ?? {},
          completed: d.completed ?? {},
        };
      }
      // Players of the original single-level version keep their tutorial time.
      const legacy = Number(localStorage.getItem(LEGACY_BEST_KEY));
      if (Number.isFinite(legacy) && legacy > 0) {
        fresh.best.tutorial = legacy;
        fresh.completed.tutorial = true;
        fresh.unlocked = 1;
      }
    } catch {
      /* storage unavailable */
    }
    return fresh;
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }
}
