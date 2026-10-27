/**
 * HUD — a minimal DOM overlay driven by the Game each frame:
 * run timer, speed read-out, contextual control hints, checkpoint
 * notifications and the finish flash. Pure presentation; no game logic.
 */

import { formatTime } from '../game/GameState.ts';

export interface HintInfo {
  text: string;
  sub?: string;
}

export class HUD {
  private root: HTMLElement;
  private timerEl: HTMLElement;
  private speedEl: HTMLElement;
  private hintEl: HTMLElement;
  private hintSubEl: HTMLElement;
  private toastEl: HTMLElement;
  private flashEl: HTMLElement;
  private objectiveEl: HTMLElement;

  private hintUntil = 0;
  private toastUntil = 0;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div class="hud-topbar">
        <div class="hud-timer"><span class="hud-label">RUN</span><span class="hud-time">0:00.00</span></div>
        <div class="hud-objective">REACH THE FINISH GATE</div>
      </div>
      <div class="hud-crosshair"><i></i><i></i></div>
      <div class="hud-bottom">
        <div class="hud-speed"><span class="hud-speed-val">0</span><span class="hud-label">KM/H</span></div>
        <div class="hud-hint"></div>
        <div class="hud-hint-sub"></div>
      </div>
      <div class="hud-toast"></div>
      <div class="hud-flash"></div>
    `;
    parent.appendChild(this.root);

    this.timerEl = this.root.querySelector('.hud-time')!;
    this.speedEl = this.root.querySelector('.hud-speed-val')!;
    this.hintEl = this.root.querySelector('.hud-hint')!;
    this.hintSubEl = this.root.querySelector('.hud-hint-sub')!;
    this.toastEl = this.root.querySelector('.hud-toast')!;
    this.flashEl = this.root.querySelector('.hud-flash')!;
    this.objectiveEl = this.root.querySelector('.hud-objective')!;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
  }

  setTimer(ms: number): void {
    if (!this.visible) return;
    this.timerEl.textContent = formatTime(ms);
  }

  setSpeed(kmh: number): void {
    if (!this.visible) return;
    this.speedEl.textContent = String(Math.round(kmh));
  }

  setObjective(text: string): void {
    this.objectiveEl.textContent = text;
  }

  /** shows a contextual hint for `durationMs` (default 4.2s) */
  showHint(h: HintInfo, durationMs = 4200): void {
    if (!this.visible) return;
    this.hintEl.textContent = h.text;
    this.hintSubEl.textContent = h.sub ?? '';
    this.hintEl.classList.add('hud-hint-on');
    this.hintSubEl.classList.add('hud-hint-on');
    this.hintUntil = performance.now() + durationMs;
  }

  showCheckpointToast(label: string, durationMs = 2600): void {
    if (!this.visible) return;
    this.toastEl.textContent = label;
    this.toastEl.classList.add('hud-toast-on');
    this.toastUntil = performance.now() + durationMs;
  }

  finishFlash(): void {
    this.flashEl.classList.remove('hud-flash-on');
    // retrigger CSS animation
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('hud-flash-on');
  }

  /** fade expired hints/toasts; call once per rendered frame */
  update(): void {
    const now = performance.now();
    if (this.hintUntil && now > this.hintUntil) {
      this.hintEl.classList.remove('hud-hint-on');
      this.hintSubEl.classList.remove('hud-hint-on');
      this.hintUntil = 0;
    }
    if (this.toastUntil && now > this.toastUntil) {
      this.toastEl.classList.remove('hud-toast-on');
      this.toastUntil = 0;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
