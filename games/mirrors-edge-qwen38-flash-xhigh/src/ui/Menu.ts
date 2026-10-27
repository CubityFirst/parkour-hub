/**
 * Menu — all DOM screens: main menu, controls, pause and finish.
 * Builds static markup once and toggles visibility; Game owns state flow.
 */

import { formatTime, type Settings } from '../game/GameState.ts';

export interface MenuCallbacks {
  onStart(): void;
  onResume(): void;
  onRestartCheckpoint(): void;
  onRestartRun(): void;
  onMainMenu(): void;
  onSettingsChanged(s: Settings): void;
}

type Screen = 'main' | 'controls' | 'pause' | 'finish';

export class Menu {
  private root: HTMLElement;
  private screens = new Map<Screen, HTMLElement>();
  private settings: Settings;
  private cb: MenuCallbacks;
  private finishTimeEl!: HTMLElement;
  private finishBestEl!: HTMLElement;
  private finishRecordEl!: HTMLElement;

  constructor(parent: HTMLElement, settings: Settings, cb: MenuCallbacks) {
    this.settings = { ...settings };
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'menu-root';
    this.root.innerHTML = `
      <section class="screen screen-main" data-screen="main">
        <div class="title-block">
          <div class="title-rule"></div>
          <h1 class="title">ROOFTOP<span>FLOW</span></h1>
          <p class="tagline">A one-minute parkour run across the white city.</p>
        </div>
        <div class="menu-buttons">
          <button class="btn btn-primary" data-act="start">START RUN</button>
          <button class="btn" data-act="controls">CONTROLS</button>
        </div>
        <div class="settings-block">${this.settingsMarkup()}</div>
        <p class="credits">Original fan tribute to the rooftop-runner genre · Three.js · no assets</p>
      </section>

      <section class="screen screen-controls" data-screen="controls">
        <h2>CONTROLS</h2>
        <table class="controls-table">
          <tr><td><kbd>W A S D</kbd></td><td>Move</td></tr>
          <tr><td><kbd>MOUSE</kbd></td><td>Look</td></tr>
          <tr><td><kbd>SHIFT</kbd></td><td>Sprint</td></tr>
          <tr><td><kbd>SPACE</kbd></td><td>Jump · jump out of slides &amp; walls · release zipline</td></tr>
          <tr><td><kbd>CTRL</kbd> / <kbd>C</kbd></td><td>Slide (hold while grounded at speed)</td></tr>
          <tr><td><kbd>E</kbd></td><td>Vault low obstacles</td></tr>
          <tr><td><kbd>R</kbd></td><td>Restart from last checkpoint</td></tr>
          <tr><td><kbd>ESC</kbd></td><td>Pause</td></tr>
        </table>
        <p class="hint-line">Follow the red. Airborne near a tall red wall? Keep sprinting — you will run it.
        Sprint off a red edge over a too-wide gap and you catch the zipline.
        Ledges you cannot quite hop become automatic mantles.</p>
        <div class="menu-buttons">
          <button class="btn btn-primary" data-act="back-main">BACK</button>
        </div>
      </section>

      <section class="screen screen-pause" data-screen="pause">
        <h2>PAUSED</h2>
        <div class="menu-buttons">
          <button class="btn btn-primary" data-act="resume">RESUME</button>
          <button class="btn" data-act="restart-cp">RESTART FROM CHECKPOINT</button>
          <button class="btn" data-act="restart-run">RESTART RUN</button>
          <button class="btn" data-act="main-menu">MAIN MENU</button>
        </div>
        <div class="settings-block">${this.settingsMarkup()}</div>
      </section>

      <section class="screen screen-finish" data-screen="finish">
        <div class="title-rule"></div>
        <h2 class="finish-title">LEVEL COMPLETE</h2>
        <div class="finish-time" data-el="time">0:00.00</div>
        <div class="finish-best" data-el="best">BEST —:——</div>
        <div class="finish-record hidden" data-el="record">NEW PERSONAL BEST</div>
        <div class="menu-buttons">
          <button class="btn btn-primary" data-act="restart-run">RUN AGAIN</button>
          <button class="btn" data-act="main-menu">MAIN MENU</button>
        </div>
      </section>
    `;
    parent.appendChild(this.root);

    for (const s of this.root.querySelectorAll<HTMLElement>('.screen')) {
      this.screens.set((s.dataset.screen ?? 'main') as Screen, s);
    }
    this.finishTimeEl = this.root.querySelector('[data-el="time"]')!;
    this.finishBestEl = this.root.querySelector('[data-el="best"]')!;
    this.finishRecordEl = this.root.querySelector('[data-el="record"]')!;

    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest?.('button');
      if (!btn) return;
      switch (btn.dataset.act) {
        case 'start': this.cb.onStart(); break;
        case 'controls': this.show('controls'); break;
        case 'back-main': this.show('main'); break;
        case 'resume': this.cb.onResume(); break;
        case 'restart-cp': this.cb.onRestartCheckpoint(); break;
        case 'restart-run': this.cb.onRestartRun(); break;
        case 'main-menu': this.cb.onMainMenu(); break;
      }
    });
    this.root.addEventListener('input', (e) => this.onSlider((e.target as HTMLElement)));
    this.bindSliders();
    this.show('main');
  }

  show(screen: Screen | null): void {
    this.root.classList.toggle('hidden', screen === null);
    for (const [name, el] of this.screens) {
      el.classList.toggle('screen-on', name === screen);
    }
  }

  showFinish(timeMs: number, bestMs: number | null, isRecord: boolean): void {
    this.finishTimeEl.textContent = formatTime(timeMs);
    this.finishBestEl.textContent =
      bestMs !== null ? `BEST ${formatTime(bestMs)}` : 'BEST —:——';
    this.finishRecordEl.classList.toggle('hidden', !isRecord);
    this.show('finish');
  }

  private settingsMarkup(): string {
    return `
      <label class="setting">
        <span>MOUSE SENSITIVITY</span>
        <input type="range" data-set="sensitivity" min="0.25" max="3" step="0.05" />
        <output data-out="sensitivity">1.00</output>
      </label>
      <label class="setting">
        <span>CAMERA MOTION</span>
        <input type="range" data-set="cameraMotion" min="0" max="1" step="0.05" />
        <output data-out="cameraMotion">FULL</output>
      </label>
      <label class="setting setting-toggle">
        <span>SOUND</span>
        <button class="toggle" data-set="sound" type="button">ON</button>
      </label>
    `;
  }

  private bindSliders(): void {
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[type="range"][data-set]')) {
      input.value = String(this.settings[input.dataset.set as keyof Settings]);
    }
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('button.toggle[data-set="sound"]')) {
      b.classList.toggle('toggle-on', this.settings.sound);
      b.textContent = this.settings.sound ? 'ON' : 'OFF';
    }
    this.refreshOutputs();
  }

  private onSlider(target: HTMLElement): void {
    const key = target.dataset.set as keyof Settings | undefined;
    if (!key) return;
    if (target instanceof HTMLInputElement) {
      const v = parseFloat(target.value);
      this.settings[key] = v as never;
      // mirror the value into the sibling block's duplicate sliders
      for (const other of this.root.querySelectorAll<HTMLInputElement>(`input[data-set="${key}"]`)) {
        other.value = target.value;
      }
    } else if (target instanceof HTMLButtonElement && key === 'sound') {
      this.settings.sound = !this.settings.sound;
      for (const b of this.root.querySelectorAll<HTMLButtonElement>('button.toggle[data-set="sound"]')) {
        b.classList.toggle('toggle-on', this.settings.sound);
        b.textContent = this.settings.sound ? 'ON' : 'OFF';
      }
    }
    this.refreshOutputs();
    this.cb.onSettingsChanged({ ...this.settings });
  }

  private refreshOutputs(): void {
    const sens = this.root.querySelectorAll<HTMLElement>('[data-out="sensitivity"]');
    for (const o of sens) o.textContent = this.settings.sensitivity.toFixed(2);
    const motion = this.root.querySelectorAll<HTMLElement>('[data-out="cameraMotion"]');
    const label =
      this.settings.cameraMotion <= 0.05 ? 'REDUCED' : this.settings.cameraMotion >= 0.95 ? 'FULL' : `${Math.round(this.settings.cameraMotion * 100)}%`;
    for (const o of motion) o.textContent = label;
  }

  dispose(): void {
    this.root.remove();
  }
}
