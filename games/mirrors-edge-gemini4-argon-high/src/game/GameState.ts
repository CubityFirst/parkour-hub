export enum GamePhase {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED'
}

export interface GameSettings {
  mouseSensitivity: number;
  reduceCameraMotion: boolean;
  soundEnabled: boolean;
  autoVault: boolean;
}

const BEST_TIME_STORAGE_KEY = 'rooftop_flow_best_time_v1';
const SETTINGS_STORAGE_KEY = 'rooftop_flow_settings_v1';

export class GameState {
  public phase: GamePhase = GamePhase.MENU;
  public elapsedTime: number = 0;
  public bestTime: number | null = null;
  public isNewRecord: boolean = false;
  public currentCheckpointIndex: number = 0;
  public totalCheckpoints: number = 6;
  public currentSectionName: string = 'SECTION 1 — MOVEMENT TUTORIAL';
  public currentSpeed: number = 0;
  public peakSpeed: number = 0;
  public parkourActionLabel: string = '';

  public settings: GameSettings = {
    mouseSensitivity: 1.0,
    reduceCameraMotion: false,
    soundEnabled: true,
    autoVault: false
  };

  private phaseChangeListeners: Array<(phase: GamePhase) => void> = [];

  constructor() {
    this.loadSavedData();
  }

  private loadSavedData(): void {
    try {
      const savedBest = localStorage.getItem(BEST_TIME_STORAGE_KEY);
      if (savedBest !== null) {
        const parsed = parseFloat(savedBest);
        if (!isNaN(parsed) && parsed > 0) {
          this.bestTime = parsed;
        }
      }

      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        this.settings = {
          ...this.settings,
          ...parsedSettings
        };
      }
    } catch {
      // Ignore storage errors in restricted environments
    }
  }

  public saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage errors
    }
  }

  public setPhase(newPhase: GamePhase): void {
    if (this.phase === newPhase) return;
    this.phase = newPhase;
    for (const listener of this.phaseChangeListeners) {
      listener(newPhase);
    }
  }

  public onPhaseChange(listener: (phase: GamePhase) => void): void {
    this.phaseChangeListeners.push(listener);
  }

  public resetRun(): void {
    this.elapsedTime = 0;
    this.isNewRecord = false;
    this.currentCheckpointIndex = 0;
    this.currentSectionName = 'SECTION 1 — MOVEMENT TUTORIAL';
    this.currentSpeed = 0;
    this.peakSpeed = 0;
    this.parkourActionLabel = '';
  }

  public completeLevel(): void {
    if (this.phase === GamePhase.FINISHED) return;
    if (this.bestTime === null || this.elapsedTime < this.bestTime) {
      this.bestTime = this.elapsedTime;
      this.isNewRecord = true;
      try {
        localStorage.setItem(BEST_TIME_STORAGE_KEY, this.bestTime.toFixed(3));
      } catch {
        // Ignore storage errors
      }
    } else {
      this.isNewRecord = false;
    }
    this.setPhase(GamePhase.FINISHED);
  }

  public static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hundredths = Math.floor((seconds % 1) * 100);
    const minStr = mins.toString().padStart(2, '0');
    const secStr = secs.toString().padStart(2, '0');
    const msStr = hundredths.toString().padStart(2, '0');
    return `${minStr}:${secStr}.${msStr}`;
  }
}
