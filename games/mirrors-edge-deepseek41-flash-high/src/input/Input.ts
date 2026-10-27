/** Keyboard + pointer-lock mouse input. */
export class Input {
  sensitivity = 1;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private releaseWanted = false;
  private mouseDX = 0;
  private mouseDY = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly keyDownHandler: (event: KeyboardEvent) => void;
  private readonly keyUpHandler: (event: KeyboardEvent) => void;
  private readonly mouseMoveHandler: (event: MouseEvent) => void;
  private readonly lockChangeHandler: () => void;
  private readonly contextMenuHandler: (event: Event) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.keyDownHandler = (event: KeyboardEvent) => {
      if (event.repeat) {
        if (this.locked) event.preventDefault();
        return;
      }
      this.down.add(event.code);
      this.pressed.add(event.code);
      if (this.locked && isGameKey(event.code)) event.preventDefault();
    };
    this.keyUpHandler = (event: KeyboardEvent) => {
      this.down.delete(event.code);
    };
    this.mouseMoveHandler = (event: MouseEvent) => {
      if (!this.locked) return;
      // Clamp occasional browser spikes.
      this.mouseDX += THREE_clamp(event.movementX, -160, 160);
      this.mouseDY += THREE_clamp(event.movementY, -160, 160);
    };
    this.lockChangeHandler = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.releaseWanted = false;
        this.down.clear();
        this.mouseDX = 0;
        this.mouseDY = 0;
      } else if (this.releaseWanted) {
        // The lock request completed after we already left the run (a race at
        // start-up).  Drop it again immediately.
        document.exitPointerLock();
      }
      this.onLockChange?.(this.locked);
    };
    this.contextMenuHandler = (event: Event) => event.preventDefault();

    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('mousemove', this.mouseMoveHandler);
    document.addEventListener('pointerlockchange', this.lockChangeHandler);
    this.canvas.addEventListener('contextmenu', this.contextMenuHandler);
  }

  requestLock(): void {
    this.releaseWanted = false;
    const promise = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        /* Browsers may refuse when the call is not user initiated. */
      });
    }
  }

  releaseLock(): void {
    this.releaseWanted = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  anyDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  consumeMouse(): { dx: number; dy: number } {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** Clears per-frame edges. Called after the last fixed simulation step. */
  endFrame(): void {
    this.pressed.clear();
  }

  reset(): void {
    this.down.clear();
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
    window.removeEventListener('mousemove', this.mouseMoveHandler);
    document.removeEventListener('pointerlockchange', this.lockChangeHandler);
    this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
  }
}

function THREE_clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function isGameKey(code: string): boolean {
  return (
    code === 'Space' ||
    code === 'ControlLeft' ||
    code === 'ControlRight' ||
    code === 'ShiftLeft' ||
    code === 'ShiftRight' ||
    code === 'KeyW' ||
    code === 'KeyA' ||
    code === 'KeyS' ||
    code === 'KeyD' ||
    code === 'KeyR' ||
    code === 'KeyE' ||
    code === 'KeyC' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight'
  );
}
