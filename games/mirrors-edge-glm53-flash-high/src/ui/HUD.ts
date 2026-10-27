/**
 * Minimal in-game HUD: crosshair, timer, checkpoint toasts, contextual hints
 * and a respawn flash. Pure DOM, styled in main.css.
 */
export class HUD {
  private readonly root: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly objective: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly flash: HTMLDivElement;

  private hintTimer = 0;
  private toastTimer = 0;
  private flashTimer = 0;

  constructor(uiRoot: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.classList.add('hidden');

    this.crosshair = document.createElement('div');
    this.crosshair.id = 'crosshair';

    this.timer = document.createElement('div');
    this.timer.id = 'timer';

    this.objective = document.createElement('div');
    this.objective.id = 'objective';
    this.objective.innerHTML = 'REACH THE <b>RED FINISH GATE</b>';

    this.toast = document.createElement('div');
    this.toast.id = 'toast';

    this.hint = document.createElement('div');
    this.hint.id = 'hint';

    this.flash = document.createElement('div');
    this.flash.id = 'respawn-flash';

    this.root.append(this.crosshair, this.timer, this.objective, this.toast, this.hint, this.flash);
    uiRoot.appendChild(this.root);
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setTimer(seconds: number): void {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    this.timer.textContent = `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  showToast(main: string, sub = ''): void {
    this.toast.innerHTML = `${main}${sub ? `<span class="sub">${sub}</span>` : ''}`;
    this.toast.classList.add('show');
    this.toastTimer = 2.2;
  }

  showHint(text: string, duration = 4.5): void {
    this.hint.textContent = text;
    this.hint.classList.add('show');
    this.hintTimer = duration;
  }

  flashRespawn(): void {
    this.flash.classList.add('show');
    this.flashTimer = 0.6;
  }

  update(dt: number): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.classList.remove('show');
    }
  }

  reset(): void {
    this.hint.classList.remove('show');
    this.toast.classList.remove('show');
    this.flash.classList.remove('show');
    this.hintTimer = this.toastTimer = this.flashTimer = 0;
  }
}
