/**
 * Input handling.
 *
 * The controller never reads keyboard/mouse directly; it reads this shared
 * `InputState` snapshot. The browser fills it from DOM events; the headless
 * level-verification bot fills the same struct with scripted commands.
 */

export interface InputState {
  /** Movement axes in player space: forward (W/S) and strafe (D/A). */
  moveForward: number;
  moveRight: number;
  sprint: boolean;
  jump: boolean;
  /** Edge-detect: true only on the frame Space was pressed. */
  jumpPressed: boolean;
  slide: boolean;
  /** Edge-detect for vault / interact key. */
  interactPressed: boolean;
  restartPressed: boolean;
  /** Accumulated mouse movement since last frame (pixels). */
  lookDX: number;
  lookDY: number;
}

export const createInputState = (): InputState => ({
  moveForward: 0,
  moveRight: 0,
  sprint: false,
  jump: false,
  jumpPressed: false,
  slide: false,
  interactPressed: false,
  restartPressed: false,
  lookDX: 0,
  lookDY: 0,
});

const KEY_MOVE: Record<string, { fwd?: number; right?: number }> = {
  KeyW: { fwd: 1 },
  ArrowUp: { fwd: 1 },
  KeyS: { fwd: -1 },
  ArrowDown: { fwd: -1 },
  KeyD: { right: 1 },
  ArrowRight: { right: 1 },
  KeyA: { right: -1 },
  ArrowLeft: { right: -1 },
};

export class KeyboardMouseInput {
  readonly state: InputState = createInputState();

  private keys = new Set<string>();
  private pointerLocked = false;
  private target: HTMLElement;
  sensitivity = 1;

  onPauseRequest: () => void = () => {};

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onDocumentMouseMove);
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  requestPointerLock(): void {
    this.target.requestPointerLock?.();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once per rendered frame after consumption by the controller. */
  endFrame(): void {
    this.state.lookDX = 0;
    this.state.lookDY = 0;
    this.state.jumpPressed = false;
    this.state.interactPressed = false;
    this.state.restartPressed = false;
  }

  /**
   * Clear one-shot edges after the FIRST fixed step of a frame, so mouse
   * deltas and button presses are never double-consumed across multiple
   * simulation ticks within the same rendered frame.
   */
  clearEdges(): void {
    this.state.lookDX = 0;
    this.state.lookDY = 0;
    this.state.jumpPressed = false;
    this.state.interactPressed = false;
  }

  /** Re-evaluate axes from held keys (called per fixed step). */
  sampleHeldKeys(): void {
    let fwd = 0;
    let right = 0;
    for (const code of this.keys) {
      const m = KEY_MOVE[code];
      if (m) {
        fwd += m.fwd ?? 0;
        right += m.right ?? 0;
      }
    }
    this.state.moveForward = Math.max(-1, Math.min(1, fwd));
    this.state.moveRight = Math.max(-1, Math.min(1, right));
    this.state.sprint =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.state.jump = this.keys.has('Space');
    this.state.slide =
      this.keys.has('ControlLeft') ||
      this.keys.has('ControlRight') ||
      this.keys.has('KeyC');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      // Browsers exit pointer lock themselves; the change handler pauses.
      return;
    }
    if (['Space', 'ControlLeft', 'ControlRight', 'Tab'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.keys.add(e.code);
    // Space stays held while airborne, so jumpPressed must be set per frame
    // by the controller's "consumed" flag, not here.
    if (e.code === 'Space') this.state.jumpPressed = true;
    if (e.code === 'KeyE') this.state.interactPressed = true;
    if (e.code === 'KeyR') this.state.restartPressed = true;
    this.sampleHeldKeys();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    this.sampleHeldKeys();
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.sampleHeldKeys();
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.target;
    if (!this.pointerLocked) this.onPauseRequest();
  };

  private onMouseMove = (e: MouseEvent): void => {
    void e;
  };

  private onDocumentMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.state.lookDX += e.movementX * this.sensitivity;
    this.state.lookDY += e.movementY * this.sensitivity;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
  }
}
