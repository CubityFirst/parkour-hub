import { formatTime } from '../game/GameState';
import type { Settings } from '../game/Settings';

export interface MenuCallbacks {
  onContinue(): void;
  onPlayLevel(index: number): void;
  onResume(): void;
  onRestartCheckpoint(): void;
  onRestartLevel(): void;
  onNextLevel(): void;
  onMainMenu(): void;
  onSettingsChange(s: Settings): void;
  onClick(): void;
}

/** What the level browser shows for one level. */
export interface LevelCard {
  label: string;
  name: string;
  tagline: string;
  best: number | null;
  unlocked: boolean;
  completed: boolean;
  current: boolean;
}

export interface FinishInfo {
  levelLabel: string;
  levelName: string;
  time: number;
  best: number | null;
  record: boolean;
  respawns: number;
  /** Label of the level that was just unlocked, if any. */
  unlocked: string | null;
  hasNext: boolean;
}

type Screen = 'main' | 'levels' | 'controls' | 'paused' | 'finished' | 'loading' | 'none';

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look around'],
  ['Shift', 'Sprint (hold)'],
  ['Space', 'Jump · hold for higher · wall jump'],
  ['C / Ctrl', 'Slide (while running) · crouch'],
  ['E', 'Vault / climb'],
  ['R', 'Restart from checkpoint'],
  ['T', 'Restart level (resets the timer)'],
  ['Esc', 'Pause / release mouse'],
];

const TIPS = [
  'Jump while running beside a wall to wall run. Jump again to kick off it.',
  'Hold W while jumping at a ledge to climb up automatically.',
  'Hold slide while landing to roll the fall into a slide and keep your speed.',
  'Press Space next to a waist-high obstacle to vault it at full speed.',
  'Red things are there to help you. Follow them.',
  'Press T at any time to restart the level and reset the clock.',
  'Wall run, jump, and hit the opposite wall to chain two wall runs together.',
];

/** Main menu, level browser, pause menu, controls and finish screens. */
export class Menu {
  readonly root: HTMLElement;
  private screens: Record<Exclude<Screen, 'none'>, HTMLElement>;
  private settingsEl: HTMLElement;
  private current: Screen = 'none';
  private returnTo: Screen = 'main';

  constructor(parent: HTMLElement, private settings: Settings, private cb: MenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = `
      <section class="screen screen-loading">
        <div class="brand"><span class="brand-mark"></span>ROOFTOP<b>FLOW</b></div>
        <div class="loading-bar"><span></span></div>
      </section>

      <section class="screen screen-main">
        <div class="panel">
          <div class="brand big"><span class="brand-mark"></span>ROOFTOP<b>FLOW</b></div>
          <p class="tagline">Run the rooftops. Keep your momentum. Never stop moving.</p>
          <div class="buttons">
            <button class="btn primary continue" data-act="continue">PLAY</button>
            <button class="btn" data-act="levels">LEVEL SELECT</button>
            <button class="btn" data-act="controls">CONTROLS</button>
          </div>
          <div class="best-line"></div>
          <div class="settings-slot"></div>
        </div>
        <div class="tip"></div>
      </section>

      <section class="screen screen-levels">
        <div class="panel wide">
          <h2>LEVEL SELECT</h2>
          <p class="small">Finish a level to unlock the next one.</p>
          <div class="level-grid"></div>
          <div class="buttons inline"><button class="btn" data-act="back">BACK</button></div>
        </div>
      </section>

      <section class="screen screen-controls">
        <div class="panel">
          <h2>CONTROLS</h2>
          <table class="controls">
            ${CONTROLS.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}
          </table>
          <p class="small">Tip: use <kbd>C</kbd> to slide if your browser closes tabs with Ctrl+W.</p>
          <div class="buttons"><button class="btn" data-act="back">BACK</button></div>
        </div>
      </section>

      <section class="screen screen-paused">
        <div class="panel">
          <div class="finish-kicker pause-level"></div>
          <h2>PAUSED</h2>
          <div class="buttons">
            <button class="btn primary" data-act="resume">RESUME</button>
            <button class="btn" data-act="restart-cp">RESTART CHECKPOINT</button>
            <button class="btn" data-act="restart">RESTART LEVEL</button>
            <button class="btn" data-act="levels">LEVEL SELECT</button>
            <button class="btn" data-act="controls">CONTROLS</button>
            <button class="btn ghost" data-act="menu">MAIN MENU</button>
          </div>
          <div class="settings-slot"></div>
        </div>
      </section>

      <section class="screen screen-finished">
        <div class="panel finish">
          <div class="finish-kicker"></div>
          <h1>LEVEL COMPLETE</h1>
          <div class="finish-time">0:00.00</div>
          <div class="record">NEW BEST TIME</div>
          <div class="finish-best"></div>
          <div class="finish-stats"></div>
          <div class="unlock"></div>
          <div class="buttons">
            <button class="btn primary" data-act="next">NEXT LEVEL</button>
            <button class="btn" data-act="restart">RESTART</button>
            <button class="btn" data-act="levels">LEVEL SELECT</button>
            <button class="btn ghost" data-act="menu">MAIN MENU</button>
          </div>
        </div>
      </section>
    `;
    parent.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.screens = {
      loading: q('.screen-loading'),
      main: q('.screen-main'),
      levels: q('.screen-levels'),
      controls: q('.screen-controls'),
      paused: q('.screen-paused'),
      finished: q('.screen-finished'),
    };
    this.settingsEl = this.buildSettings();
    q('.tip').textContent = `TIP — ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;

    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const card = target.closest('.level-card') as HTMLElement | null;
      if (card) {
        if (card.classList.contains('locked')) return;
        this.cb.onClick();
        this.cb.onPlayLevel(Number(card.dataset.index));
        return;
      }
      const btn = target.closest('button[data-act]') as HTMLButtonElement | null;
      if (!btn) return;
      this.cb.onClick();
      switch (btn.dataset.act) {
        case 'continue':
          this.cb.onContinue();
          break;
        case 'levels':
        case 'controls':
          this.returnTo = this.current;
          this.show(btn.dataset.act);
          break;
        case 'back':
          this.show(this.returnTo);
          break;
        case 'resume':
          this.cb.onResume();
          break;
        case 'restart-cp':
          this.cb.onRestartCheckpoint();
          break;
        case 'restart':
          this.cb.onRestartLevel();
          break;
        case 'next':
          this.cb.onNextLevel();
          break;
        case 'menu':
          this.cb.onMainMenu();
          break;
      }
    });
  }

  get screen(): Screen {
    return this.current;
  }

  show(screen: Screen): void {
    this.current = screen;
    for (const [name, el] of Object.entries(this.screens)) el.classList.toggle('active', name === screen);
    this.root.classList.toggle('hidden', screen === 'none');
    const slot = screen === 'main' || screen === 'paused' ? this.screens[screen].querySelector('.settings-slot') : null;
    if (slot) slot.appendChild(this.settingsEl);
  }

  setLoading(p: number): void {
    (this.screens.loading.querySelector('.loading-bar span') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
  }

  /** Main-menu play button and summary line. */
  setContinue(label: string, summary: string): void {
    (this.screens.main.querySelector('.continue') as HTMLElement).textContent = label;
    (this.screens.main.querySelector('.best-line') as HTMLElement).textContent = summary;
  }

  setPauseLevel(text: string): void {
    (this.screens.paused.querySelector('.pause-level') as HTMLElement).textContent = text;
  }

  setLevels(cards: LevelCard[]): void {
    const grid = this.screens.levels.querySelector('.level-grid') as HTMLElement;
    grid.innerHTML = cards
      .map((c, i) => {
        const status = !c.unlocked ? 'LOCKED' : c.completed ? 'COMPLETED' : 'NEW';
        const cls = ['level-card', c.unlocked ? '' : 'locked', c.completed ? 'done' : '', c.current ? 'current' : ''].join(' ');
        return `
          <div class="${cls}" data-index="${i}" role="button" tabindex="${c.unlocked ? 0 : -1}">
            <div class="lc-top"><span class="lc-label">${c.label}</span><span class="lc-status">${status}</span></div>
            <div class="lc-name">${c.unlocked ? c.name : '— — —'}</div>
            <div class="lc-tag">${c.unlocked ? c.tagline : 'Finish the previous level to unlock.'}</div>
            <div class="lc-best">${c.best !== null ? `BEST ${formatTime(c.best)}` : '&nbsp;'}</div>
          </div>`;
      })
      .join('');
  }

  showFinish(info: FinishInfo): void {
    const s = this.screens.finished;
    (s.querySelector('.finish-kicker') as HTMLElement).textContent = `${info.levelLabel} · ${info.levelName}`;
    (s.querySelector('.finish-time') as HTMLElement).textContent = formatTime(info.time);
    (s.querySelector('.finish-best') as HTMLElement).textContent = info.best !== null ? `BEST  ${formatTime(info.best)}` : '';
    (s.querySelector('.record') as HTMLElement).style.display = info.record ? '' : 'none';
    (s.querySelector('.finish-stats') as HTMLElement).textContent =
      info.respawns === 0 ? 'FLAWLESS — NO FALLS' : `${info.respawns} ${info.respawns === 1 ? 'RESPAWN' : 'RESPAWNS'}`;
    const unlock = s.querySelector('.unlock') as HTMLElement;
    unlock.textContent = info.unlocked ? `${info.unlocked} UNLOCKED` : '';
    unlock.style.display = info.unlocked ? '' : 'none';
    const next = s.querySelector('[data-act=next]') as HTMLElement;
    const restart = s.querySelector('[data-act=restart]') as HTMLElement;
    next.style.display = info.hasNext ? '' : 'none';
    restart.classList.toggle('primary', !info.hasNext);
    if (!info.hasNext) (s.querySelector('h1') as HTMLElement).textContent = 'ALL LEVELS COMPLETE';
    else (s.querySelector('h1') as HTMLElement).textContent = 'LEVEL COMPLETE';
    this.show('finished');
  }

  private buildSettings(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'settings';
    const s = this.settings;
    el.innerHTML = `
      <label class="row"><span>Mouse sensitivity</span><input type="range" min="0.2" max="3" step="0.05" data-k="sensitivity"><output></output></label>
      <label class="row"><span>Field of view</span><input type="range" min="70" max="105" step="1" data-k="fov"><output></output></label>
      <label class="row"><span>Volume</span><input type="range" min="0" max="1" step="0.05" data-k="volume"><output></output></label>
      <div class="row"><span>Camera motion</span>
        <div class="seg" data-k="reducedMotion"><button data-v="false">FULL</button><button data-v="true">REDUCED</button></div></div>
      <div class="row"><span>Graphics</span>
        <div class="seg" data-k="quality"><button data-v="high">HIGH</button><button data-v="low">PERFORMANCE</button></div></div>
      <div class="row"><span>Invert mouse Y</span>
        <div class="seg" data-k="invertY"><button data-v="false">OFF</button><button data-v="true">ON</button></div></div>
    `;
    const fmt = (k: string, v: number) => (k === 'sensitivity' ? v.toFixed(2) : k === 'volume' ? `${Math.round(v * 100)}%` : `${v}°`);
    el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) => {
      const k = input.dataset.k as 'sensitivity' | 'fov' | 'volume';
      const out = input.nextElementSibling as HTMLOutputElement;
      input.value = String(s[k]);
      out.textContent = fmt(k, s[k]);
      input.addEventListener('input', () => {
        s[k] = Number(input.value);
        out.textContent = fmt(k, s[k]);
        this.cb.onSettingsChange(s);
      });
    });
    el.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
      const k = seg.dataset.k as 'reducedMotion' | 'quality' | 'invertY';
      const sync = () => seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(s[k])));
      sync();
      seg.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('button');
        if (!b) return;
        e.stopPropagation();
        const v = b.dataset.v!;
        if (k === 'quality') s.quality = v as Settings['quality'];
        else s[k] = v === 'true';
        sync();
        this.cb.onClick();
        this.cb.onSettingsChange(s);
      });
    });
    return el;
  }
}
