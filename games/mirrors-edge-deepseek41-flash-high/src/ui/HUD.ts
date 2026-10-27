import { formatTime } from '../game/GameState';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing HUD element #${id}`);
  return node as T;
}

/**
 * In-game HUD: timer, checkpoint progress, contextual hints, crosshair and a
 * minimal speed meter.
 */
export class HUD {
  private readonly root = el('hud');
  private readonly timerEl = el('timer');
  private readonly cpEl = el('cp-value');
  private readonly bestEl = el('best-value');
  private readonly sectionEl = el('section-toast');
  private readonly cpToastEl = el('checkpoint-toast');
  private readonly cpToastText = el('checkpoint-toast-text');
  private readonly hintEl = el('hint');
  private readonly hintText = el('hint-text');
  private readonly flowFill = el('flow-fill');
  private readonly flowSpeed = el('flow-speed');
  private readonly moveState = el('move-state');
  private readonly speedOverlay = el('speed-overlay');
  private readonly fade = el('fade');

  private sectionTimer = 0;
  private cpTimer = 0;
  private hintTimer = 0;

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setTimer(seconds: number): void {
    this.timerEl.textContent = formatTime(seconds);
  }

  setCheckpoint(index: number, total: number): void {
    this.cpEl.textContent = `${index} / ${total}`;
  }

  setBest(seconds: number | null): void {
    this.bestEl.textContent = seconds === null ? '--:--.--' : formatTime(seconds);
  }

  showSection(text: string): void {
    this.sectionEl.textContent = text;
    this.sectionEl.classList.add('visible');
    this.sectionTimer = 3.0;
  }

  showCheckpoint(index: number): void {
    this.cpToastText.textContent = `CHECKPOINT ${index}`;
    this.cpToastEl.classList.add('visible');
    this.cpTimer = 2.4;
  }

  showHint(text: string, duration = 4.2): void {
    this.hintText.textContent = text;
    this.hintEl.classList.add('visible');
    this.hintTimer = duration;
  }

  setMovement(speed: number, stateLabel: string): void {
    const ratio = Math.min(1, speed / 13);
    this.flowFill.style.width = `${Math.round(ratio * 100)}%`;
    this.flowSpeed.textContent = speed.toFixed(1);
    this.moveState.textContent = stateLabel;
    const overlay = speed < 7 ? 0 : Math.min(0.55, ((speed - 7) / 6.5) * 0.55);
    this.speedOverlay.style.opacity = overlay.toFixed(2);
  }

  flash(): void {
    this.fade.classList.remove('flash');
    // Force a reflow so the animation can restart immediately.
    void this.fade.offsetWidth;
    this.fade.classList.add('flash');
  }

  setFade(active: boolean): void {
    this.fade.classList.toggle('active', active);
  }

  update(dt: number): void {
    if (this.sectionTimer > 0) {
      this.sectionTimer -= dt;
      if (this.sectionTimer <= 0) this.sectionEl.classList.remove('visible');
    }
    if (this.cpTimer > 0) {
      this.cpTimer -= dt;
      if (this.cpTimer <= 0) this.cpToastEl.classList.remove('visible');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('visible');
    }
  }

  resetTransient(): void {
    this.sectionEl.classList.remove('visible');
    this.cpToastEl.classList.remove('visible');
    this.hintEl.classList.remove('visible');
    this.sectionTimer = 0;
    this.cpTimer = 0;
    this.hintTimer = 0;
    this.speedOverlay.style.opacity = '0';
    this.flowFill.style.width = '0%';
    this.flowSpeed.textContent = '0.0';
    this.moveState.textContent = 'ON FOOT';
  }

  get fadeElement(): HTMLElement {
    return this.fade;
  }
}
