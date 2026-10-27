import { formatTime } from '../game/GameState';

/** In-game overlay: crosshair, timer, checkpoint toast, hints, respawn flash. */
export class HUD {
  private rootEl: HTMLElement;
  private timerEl: HTMLElement;
  private toastEl: HTMLElement;
  private hintEl: HTMLElement;
  private vaultEl: HTMLElement;
  private flashEl: HTMLElement;
  private currentHint: string | null = null;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="hud hidden">
        <div class="crosshair"></div>
        <div class="hud-brand"><span class="brand-mark small"></span>ROOFTOP FLOW</div>
        <div class="timer">0:00.000</div>
        <div class="toast"></div>
        <div class="hint"></div>
        <div class="vault-hint">E — VAULT</div>
        <div class="keys-line">SHIFT SPRINT · SPACE JUMP · CTRL SLIDE · E VAULT · R CHECKPOINT</div>
        <div class="flash"></div>
      </div>`,
    );
    const q = <T extends HTMLElement>(sel: string): T => {
      const el = root.querySelector(sel);
      if (!el) throw new Error(`HUD element missing: ${sel}`);
      return el as unknown as T;
    };
    this.rootEl = q('.hud');
    this.timerEl = q('.timer');
    this.toastEl = q('.toast');
    this.hintEl = q('.hint');
    this.vaultEl = q('.vault-hint');
    this.flashEl = q('.flash');
  }

  show(): void {
    this.rootEl.classList.remove('hidden');
  }

  hide(): void {
    this.rootEl.classList.add('hidden');
  }

  setTime(t: number): void {
    this.timerEl.textContent = formatTime(t);
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth; // restart the CSS animation
    this.toastEl.classList.add('show');
  }

  setHint(text: string | null): void {
    if (text === this.currentHint) return;
    this.currentHint = text;
    if (text) {
      this.hintEl.textContent = text;
      this.hintEl.classList.add('visible');
    } else {
      this.hintEl.classList.remove('visible');
    }
  }

  setVaultHint(visible: boolean): void {
    this.vaultEl.classList.toggle('visible', visible);
  }

  flash(): void {
    this.flashEl.classList.remove('show');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('show');
  }
}
