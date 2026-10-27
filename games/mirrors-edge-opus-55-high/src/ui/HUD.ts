import { formatTime } from '../game/GameState';

/** Minimal in-game heads-up display. */
export class HUD {
  readonly root: HTMLElement;
  private timer: HTMLElement;
  private best: HTMLElement;
  private toast: HTMLElement;
  private toastTitle: HTMLElement;
  private toastSub: HTMLElement;
  private hint: HTMLElement;
  private fade: HTMLElement;
  private vignette: HTMLElement;
  private progress: HTMLElement;
  private level: HTMLElement;
  private toastTimer = 0;
  private hintText: string | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div class="vignette"></div>
      <div class="crosshair"></div>
      <div class="hud-top">
        <div class="hud-left">
          <div class="hud-level"></div>
          <div class="hud-progress"></div>
        </div>
        <div class="hud-timer-wrap">
          <div class="hud-timer">0:00.00</div>
          <div class="hud-best"></div>
        </div>
      </div>
      <div class="hud-toast"><div class="toast-title"></div><div class="toast-sub"></div></div>
      <div class="hud-hint"></div>
      <div class="hud-keys">R — restart checkpoint · T — restart level · ESC — pause</div>
      <div class="hud-fade"></div>
    `;
    parent.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.timer = q('.hud-timer');
    this.best = q('.hud-best');
    this.toast = q('.hud-toast');
    this.toastTitle = q('.toast-title');
    this.toastSub = q('.toast-sub');
    this.hint = q('.hud-hint');
    this.fade = q('.hud-fade');
    this.vignette = q('.vignette');
    this.progress = q('.hud-progress');
    this.level = q('.hud-level');
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  setLevel(label: string, name: string): void {
    this.level.innerHTML = `<b>${label}</b> ${label === name ? '' : name}`;
  }

  setProgress(reached: number, total: number): void {
    let html = '';
    for (let i = 0; i < total; i++) html += `<span class="${i < reached ? 'on' : ''}"></span>`;
    this.progress.innerHTML = html;
  }

  setTime(t: number, best: number | null): void {
    this.timer.textContent = formatTime(t);
    this.best.textContent = best !== null ? `BEST ${formatTime(best)}` : '';
  }

  showToast(title: string, sub: string, seconds = 2.4): void {
    this.toastTitle.textContent = title;
    this.toastSub.textContent = sub;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth; // restart animation
    this.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  setHint(text: string | null): void {
    if (text === this.hintText) return;
    this.hintText = text;
    if (text) {
      this.hint.textContent = text;
      this.hint.classList.add('show');
    } else {
      this.hint.classList.remove('show');
    }
  }

  /** Quick white flash used on respawn. */
  flash(): void {
    this.fade.classList.remove('flash');
    void this.fade.offsetWidth;
    this.fade.classList.add('flash');
  }

  /** Speed vignette strength 0..1. */
  setSpeedFx(k: number): void {
    this.vignette.style.opacity = String(0.15 + k * 0.5);
  }

  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
  }
}
