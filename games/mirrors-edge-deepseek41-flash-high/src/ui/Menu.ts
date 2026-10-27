import { formatTime } from '../game/GameState';

export interface GameSettings {
  sensitivity: number;
  reduceMotion: boolean;
}

export interface MenuCallbacks {
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onSettingsChange: (settings: GameSettings) => void;
}

const SETTINGS_KEY = 'rooftop-flow:settings';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing menu element #${id}`);
  return node as T;
}

/** Title screen, controls sheet, pause menu and finish screen. */
export class Menu {
  settings: GameSettings = { sensitivity: 1, reduceMotion: false };

  private readonly main = el('menu');
  private readonly pause = el('pause');
  private readonly finish = el('finish');
  private readonly controls = el('controls-panel');
  private readonly menuBest = el('menu-best');
  private readonly pauseTime = el('pause-time');
  private readonly pauseCp = el('pause-cp');
  private readonly finishTime = el('finish-time');
  private readonly finishBest = el('finish-best');
  private readonly finishCp = el('finish-cp');
  private readonly newBest = el('new-best');
  private readonly sensSlider = el<HTMLInputElement>('sensitivity');
  private readonly sensValue = el('sens-value');
  private readonly reduceToggle = el<HTMLInputElement>('reduce-motion');
  private readonly pauseSens = el<HTMLInputElement>('pause-sensitivity');
  private readonly pauseReduce = el<HTMLInputElement>('pause-reduce-motion');

  constructor(private readonly callbacks: MenuCallbacks) {
    this.loadSettings();
    this.bind();
    this.syncSettingsUi();
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      if (typeof parsed.sensitivity === 'number' && parsed.sensitivity >= 0.3 && parsed.sensitivity <= 2.5) {
        this.settings.sensitivity = parsed.sensitivity;
      }
      if (typeof parsed.reduceMotion === 'boolean') {
        this.settings.reduceMotion = parsed.reduceMotion;
      }
    } catch {
      /* ignore corrupt settings */
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  private bind(): void {
    el('start-btn').addEventListener('click', () => this.callbacks.onStart());
    el('controls-btn').addEventListener('click', () => this.controls.classList.remove('hidden'));
    el('controls-close').addEventListener('click', () => this.controls.classList.add('hidden'));
    el('controls-close-btn').addEventListener('click', () => this.controls.classList.add('hidden'));

    el('resume-btn').addEventListener('click', () => this.callbacks.onResume());
    el('restart-btn').addEventListener('click', () => this.callbacks.onRestart());
    el('quit-btn').addEventListener('click', () => this.callbacks.onQuit());

    el('again-btn').addEventListener('click', () => this.callbacks.onRestart());
    el('finish-menu-btn').addEventListener('click', () => this.callbacks.onQuit());

    const onSensitivity = (value: number) => {
      this.settings.sensitivity = value;
      this.syncSettingsUi();
      this.saveSettings();
      this.callbacks.onSettingsChange(this.settings);
    };

    this.sensSlider.addEventListener('input', () => onSensitivity(Number(this.sensSlider.value)));
    this.pauseSens.addEventListener('input', () => onSensitivity(Number(this.pauseSens.value)));

    const onMotion = (value: boolean) => {
      this.settings.reduceMotion = value;
      this.syncSettingsUi();
      this.saveSettings();
      this.callbacks.onSettingsChange(this.settings);
    };
    this.reduceToggle.addEventListener('change', () => onMotion(this.reduceToggle.checked));
    this.pauseReduce.addEventListener('change', () => onMotion(this.pauseReduce.checked));

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && !this.controls.classList.contains('hidden')) {
        this.controls.classList.add('hidden');
      }

      // Keyboard fallbacks for the screens, useful if pointer lock is still
      // being released when the overlay appears.
      if (!this.finish.classList.contains('hidden')) {
        if (event.code === 'Enter' || event.code === 'Space') {
          event.preventDefault();
          this.callbacks.onRestart();
        } else if (event.code === 'KeyM') {
          this.callbacks.onQuit();
        }
        return;
      }

      if (!this.pause.classList.contains('hidden')) {
        if (event.code === 'Enter') {
          event.preventDefault();
          this.callbacks.onResume();
        } else if (event.code === 'KeyM') {
          this.callbacks.onQuit();
        }
        return;
      }

      if (
        !this.main.classList.contains('hidden') &&
        event.code === 'Enter' &&
        this.controls.classList.contains('hidden')
      ) {
        event.preventDefault();
        this.callbacks.onStart();
      }
    });
  }

  private syncSettingsUi(): void {
    const value = this.settings.sensitivity.toFixed(2).replace(/0$/, '');
    this.sensSlider.value = String(this.settings.sensitivity);
    this.pauseSens.value = String(this.settings.sensitivity);
    this.sensValue.textContent = value;
    this.reduceToggle.checked = this.settings.reduceMotion;
    this.pauseReduce.checked = this.settings.reduceMotion;
  }

  showMain(best: number | null): void {
    this.pause.classList.add('hidden');
    this.finish.classList.add('hidden');
    this.main.classList.remove('hidden');
    this.controls.classList.add('hidden');
    this.menuBest.textContent =
      best === null ? 'BEST RUN — --:--.--' : `BEST RUN — ${formatTime(best)}`;
  }

  showPause(elapsed: number, checkpoint: number, total: number): void {
    this.main.classList.add('hidden');
    this.finish.classList.add('hidden');
    this.pause.classList.remove('hidden');
    this.pauseTime.textContent = formatTime(elapsed);
    this.pauseCp.textContent = `${checkpoint} / ${total}`;
  }

  showFinish(
    time: number,
    best: number | null,
    isNewBest: boolean,
    checkpoint: number,
    total: number,
  ): void {
    this.main.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.finish.classList.remove('hidden');
    this.finishTime.textContent = formatTime(time);
    this.finishBest.textContent =
      best === null ? 'BEST — --:--.--' : `BEST — ${formatTime(best)}`;
    this.finishCp.textContent = `CHECKPOINTS — ${checkpoint} / ${total}`;
    this.newBest.classList.toggle('hidden', !isNewBest);
  }

  hideAll(): void {
    this.main.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.finish.classList.add('hidden');
  }

  showControls(): void {
    this.controls.classList.remove('hidden');
  }
}
