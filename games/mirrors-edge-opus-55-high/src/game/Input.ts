/**
 * Keyboard + pointer-locked mouse input.
 *
 * "Pressed" actions are counted on keydown and consumed by the first physics
 * tick that runs afterwards, so short taps are never lost even when a frame
 * runs zero or several fixed ticks.
 */
export type Action = 'jump' | 'slide' | 'interact' | 'restart' | 'restartLevel';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyE', 'KeyR', 'KeyT',
]);

export class Input {
  private down = new Set<string>();
  private pressed: Record<Action, number> = { jump: 0, slide: 0, interact: 0, restart: 0, restartLevel: 0 };
  private mouseX = 0;
  private mouseY = 0;
  /** Only capture keys while the game is active. */
  enabled = false;

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', this.onMouseMove);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  async lock(): Promise<void> {
    if (this.locked) return;
    try {
      // Raw (unaccelerated) mouse input where supported.
      await (this.target.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | void).call(this.target, { unadjustedMovement: true });
    } catch {
      try {
        await this.target.requestPointerLock();
      } catch {
        /* Browser refused (e.g. too soon after Esc) - the UI asks for another click. */
      }
    }
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (GAME_KEYS.has(e.code) || e.ctrlKey) e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    if (e.code === 'Space') this.pressed.jump++;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') this.pressed.slide++;
    if (e.code === 'KeyE') this.pressed.interact++;
    if (e.code === 'KeyR') this.pressed.restart++;
    if (e.code === 'KeyT') this.pressed.restartLevel++;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || !this.enabled) return;
    // Some browsers occasionally report huge spikes on lock/unlock.
    if (Math.abs(e.movementX) > 800 || Math.abs(e.movementY) > 800) return;
    this.mouseX += e.movementX;
    this.mouseY += e.movementY;
  };

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  get moveX(): number {
    return (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
  }

  get moveZ(): number {
    return (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
  }

  get sprint(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  get jumpHeld(): boolean {
    return this.isDown('Space');
  }

  get slideHeld(): boolean {
    return this.isDown('ControlLeft') || this.isDown('ControlRight') || this.isDown('KeyC');
  }

  /** Consume one queued press of an action. */
  consume(action: Action): boolean {
    if (this.pressed[action] > 0) {
      this.pressed[action] = 0;
      return true;
    }
    return false;
  }

  peek(action: Action): boolean {
    return this.pressed[action] > 0;
  }

  takeMouse(): [number, number] {
    const r: [number, number] = [this.mouseX, this.mouseY];
    this.mouseX = this.mouseY = 0;
    return r;
  }

  clear(): void {
    this.down.clear();
    for (const k of Object.keys(this.pressed) as Action[]) this.pressed[k] = 0;
    this.mouseX = this.mouseY = 0;
  }
}
