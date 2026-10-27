/** Keyboard + mouse state with Pointer Lock handling. */

const GAME_KEYS = new Set([
  'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyR',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'ArrowUp', 'ArrowDown',
]);

export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;

  pointerLocked = false;
  onLockChange?: (locked: boolean) => void;
  onKeyDown?: (code: string) => void;

  constructor(private lockTarget: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedSet.add(e.code);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.onKeyDown?.(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.lockTarget;
      if (!this.pointerLocked) this.down.clear();
      this.onLockChange?.(this.pointerLocked);
    });
    document.addEventListener('contextmenu', (e) => {
      if (e.target === this.lockTarget) e.preventDefault();
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True if the key went down since the end of the previous frame. */
  pressed(code: string): boolean {
    return this.pressedSet.has(code);
  }

  /** True if the key went up since the end of the previous frame. */
  released(code: string): boolean {
    return this.releasedSet.has(code);
  }

  /** Raw accumulated mouse deltas for this frame. */
  consumeMouse(): [number, number] {
    const r: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  /** Called at the very end of each rendered frame. */
  endFrame(): void {
    this.pressedSet.clear();
    this.releasedSet.clear();
  }

  requestLock(): void {
    try {
      const r = this.lockTarget.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      /* pointer lock unavailable — game still runs */
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
