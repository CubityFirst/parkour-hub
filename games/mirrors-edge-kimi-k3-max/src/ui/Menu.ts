import { formatTime, Settings } from '../game/GameState';

export interface MenuCallbacks {
  onStart(): void;
  onResume(): void;
  onRestartRun(): void;
  onQuitToMenu(): void;
  onSettingsChanged(s: Settings): void;
}

const CONTROLS_ROWS: Array<[string, string]> = [
  ['W A S D', 'Move'],
  ['MOUSE', 'Look around'],
  ['SHIFT', 'Sprint'],
  ['SPACE', 'Jump / wall jump'],
  ['CTRL / C', 'Slide (hold)'],
  ['E', 'Vault / climb'],
  ['R', 'Restart from checkpoint'],
  ['ESC', 'Pause'],
];

function settingsBlock(): string {
  return `
    <div class="settings">
      <div class="setting">
        <label>MOUSE SENSITIVITY <span class="sens-val"></span></label>
        <input type="range" class="sens" min="0.3" max="2" step="0.05" />
      </div>
      <div class="setting">
        <label>CAMERA MOTION</label>
        <div class="seg">
          <button class="seg-btn motion" data-v="full">FULL</button>
          <button class="seg-btn motion" data-v="reduced">REDUCED</button>
        </div>
      </div>
    </div>`;
}

/** Main menu, controls panel, pause menu and finish screen (plain DOM). */
export class Menu {
  private menuEl: HTMLElement;
  private pauseEl: HTMLElement;
  private finishEl: HTMLElement;
  private controlsEl: HTMLElement;
  private bestLineEl: HTMLElement;
  private finishTimeEl: HTMLElement;
  private finishBestEl: HTMLElement;

  constructor(root: HTMLElement, private settings: Settings, private cb: MenuCallbacks) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div class="screen menu-screen">
        <div class="menu-inner">
          <div class="brand"><span class="brand-mark"></span>ROOFTOP&nbsp;<strong>FLOW</strong></div>
          <div class="tagline">A FIRST-PERSON PARKOUR RUN ACROSS THE WHITE CITY</div>
          <div class="menu-buttons">
            <button class="btn primary" data-a="start">START RUN</button>
            <button class="btn" data-a="controls">CONTROLS</button>
          </div>
          ${settingsBlock()}
          <div class="best-line"></div>
          <div class="footnote">BEST PLAYED IN CHROME / EDGE / FIREFOX · CLICK START TO CAPTURE THE MOUSE</div>
        </div>
        <div class="controls-panel hidden">
          <h3>CONTROLS</h3>
          <table>${CONTROLS_ROWS.map(([k, a]) => `<tr><td>${k}</td><td>${a}</td></tr>`).join('')}</table>
          <button class="btn" data-a="close-controls">CLOSE</button>
        </div>
      </div>

      <div class="screen pause-screen hidden">
        <div class="panel">
          <h2>PAUSED</h2>
          <div class="rule"></div>
          <div class="menu-buttons">
            <button class="btn primary" data-a="resume">RESUME</button>
            <button class="btn" data-a="restart">RESTART RUN</button>
            <button class="btn" data-a="quit">QUIT TO MENU</button>
          </div>
          ${settingsBlock()}
          <div class="keys-recap">SHIFT SPRINT · SPACE JUMP · CTRL SLIDE · E VAULT · R CHECKPOINT</div>
        </div>
      </div>

      <div class="screen finish-screen hidden">
        <div class="panel">
          <h2>LEVEL <strong>COMPLETE</strong></h2>
          <div class="rule"></div>
          <div class="finish-time"></div>
          <div class="finish-best"></div>
          <div class="menu-buttons">
            <button class="btn primary" data-a="restart">RESTART</button>
            <button class="btn" data-a="quit">MAIN MENU</button>
          </div>
        </div>
      </div>`,
    );

    const q = <T extends HTMLElement>(sel: string): T => {
      const el = root.querySelector(sel);
      if (!el) throw new Error(`Menu element missing: ${sel}`);
      return el as unknown as T;
    };
    this.menuEl = q('.menu-screen');
    this.pauseEl = q('.pause-screen');
    this.finishEl = q('.finish-screen');
    this.controlsEl = q('.controls-panel');
    this.bestLineEl = q('.best-line');
    this.finishTimeEl = q('.finish-time');
    this.finishBestEl = q('.finish-best');

    root.querySelectorAll('[data-a]').forEach((el) => {
      el.addEventListener('click', () => {
        const a = (el as HTMLElement).dataset.a;
        if (a === 'start') cb.onStart();
        else if (a === 'controls') this.controlsEl.classList.remove('hidden');
        else if (a === 'close-controls') this.controlsEl.classList.add('hidden');
        else if (a === 'resume') cb.onResume();
        else if (a === 'restart') cb.onRestartRun();
        else if (a === 'quit') cb.onQuitToMenu();
      });
    });

    // sensitivity sliders (one per screen, kept in sync)
    root.querySelectorAll<HTMLInputElement>('input.sens').forEach((inp) => {
      inp.value = String(settings.sensitivity);
      inp.addEventListener('input', () => {
        settings.sensitivity = parseFloat(inp.value);
        root.querySelectorAll<HTMLInputElement>('input.sens').forEach((o) => {
          if (o !== inp) o.value = inp.value;
        });
        this.refreshSettingLabels(root);
        cb.onSettingsChanged(settings);
      });
    });
    root.querySelectorAll<HTMLButtonElement>('button.motion').forEach((btn) => {
      btn.addEventListener('click', () => {
        settings.cameraMotion = btn.dataset.v === 'reduced' ? 'reduced' : 'full';
        this.refreshSettingLabels(root);
        cb.onSettingsChanged(settings);
      });
    });
    this.refreshSettingLabels(root);
  }

  private refreshSettingLabels(root: HTMLElement): void {
    root.querySelectorAll('.sens-val').forEach((el) => {
      el.textContent = this.settings.sensitivity.toFixed(2);
    });
    root.querySelectorAll<HTMLButtonElement>('button.motion').forEach((b) => {
      b.classList.toggle('active', b.dataset.v === this.settings.cameraMotion);
    });
  }

  hideAll(): void {
    this.menuEl.classList.add('hidden');
    this.pauseEl.classList.add('hidden');
    this.finishEl.classList.add('hidden');
    this.controlsEl.classList.add('hidden');
  }

  showMain(best: number | null): void {
    this.hideAll();
    this.bestLineEl.innerHTML = best !== null ? `BEST TIME — <strong>${formatTime(best)}</strong>` : 'NO COMPLETED RUNS YET';
    this.menuEl.classList.remove('hidden');
  }

  showPause(): void {
    this.hideAll();
    this.pauseEl.classList.remove('hidden');
  }

  showFinish(time: number, best: number, isNewBest: boolean): void {
    this.hideAll();
    this.finishTimeEl.textContent = formatTime(time);
    this.finishBestEl.innerHTML =
      `BEST — <strong>${formatTime(best)}</strong>` + (isNewBest ? '<span class="new-best">NEW BEST!</span>' : '');
    this.finishEl.classList.remove('hidden');
  }
}
