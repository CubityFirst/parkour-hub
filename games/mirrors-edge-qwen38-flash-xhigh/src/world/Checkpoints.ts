/**
 * Checkpoint + trigger-zone logic. Pure (no DOM/three) so the verification
 * bot exercises the exact same rules as the shipped game.
 */

import type { Vec3 } from '../core/vec3.ts';
import type { CheckpointDef, HintDef, TriggerZone } from './LevelData.ts';

export function insideZone(zone: TriggerZone, p: Vec3, pad = 0.0): boolean {
  return (
    p.x >= zone.min.x - pad &&
    p.x <= zone.max.x + pad &&
    p.y >= zone.min.y - pad - 1.2 && // generous downward: feet may dip at landing
    p.y <= zone.max.y &&
    p.z >= zone.min.z - pad &&
    p.z <= zone.max.z + pad
  );
}

export class CheckpointTracker {
  /** -1 = original spawn */
  activeIndex = -1;
  private triggered = new Set<number>();
  private checkpoints: CheckpointDef[];

  constructor(checkpoints: CheckpointDef[]) {
    this.checkpoints = checkpoints;
  }

  reset(): void {
    this.activeIndex = -1;
    this.triggered.clear();
  }

  /** returns the newly activated checkpoint, if any */
  check(pos: Vec3): CheckpointDef | null {
    const next = this.activeIndex + 1;
    if (next >= this.checkpoints.length) return null;
    const cp = this.checkpoints[next];
    if (this.triggered.has(cp.id)) return null;
    if (insideZone(cp.zone, pos)) {
      this.triggered.add(cp.id);
      this.activeIndex = next;
      return cp;
    }
    return null;
  }

  respawnPoint(levelSpawn: { pos: Vec3; yaw: number }): { pos: Vec3; yaw: number } {
    if (this.activeIndex < 0) return levelSpawn;
    return this.checkpoints[this.activeIndex].respawn;
  }
}

/** one-shot contextual hint zones */
export class HintTracker {
  private fired = new Set<string>();
  private hints: HintDef[];

  constructor(hints: HintDef[]) {
    this.hints = hints;
  }

  reset(): void {
    this.fired.clear();
  }

  check(pos: Vec3): HintDef | null {
    for (const h of this.hints) {
      if (this.fired.has(h.id)) continue;
      if (insideZone(h.zone, pos)) {
        this.fired.add(h.id);
        return h;
      }
    }
    return null;
  }
}
