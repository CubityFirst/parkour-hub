/**
 * Central keyboard + mouse input state.
 * Mouse deltas accumulate while pointer-locked and are consumed each frame.
 */
export class InputState {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  private locked = false;

  constructor() {
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      // Keep Space / arrows from scrolling the page while playing.
      if (this.locked && (e.code === 'Space' || e.code.startsWith('Arrow'))) {
        e.preventDefault();
      }
    });
    document.addEventListener('keyup', (e) => this.down.delete(e.code));
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
      if (!this.locked) this.down.clear();
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  isPointerLocked(): boolean {
    return this.locked;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True on the frame the key was first pressed. */
  onPress(code: string): boolean {
    return this.pressed.has(code);
  }

  consumeMouse(): [number, number] {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return [dx, dy];
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
