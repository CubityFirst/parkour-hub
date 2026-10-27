import * as THREE from "three";
import { Level } from "../world/Level";
import type { SolidBox } from "../world/Level";

type KeyName = "KeyW" | "KeyA" | "KeyS" | "KeyD" | "ShiftLeft" | "ShiftRight" | "Space" | "ControlLeft" | "ControlRight" | "KeyC" | "KeyE" | "KeyR";

const PLAYER_RADIUS = 0.34;
const STAND_HEIGHT = 1.78;
const SLIDE_HEIGHT = 0.78;

export class PlayerController {
  readonly position = new THREE.Vector3(0, 0.02, 42);
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = -0.02;

  private readonly keys = new Set<string>();
  private readonly vaultStart = new THREE.Vector3();
  private readonly vaultEnd = new THREE.Vector3();
  private vaultTimer = 0;
  private vaultDuration = 0;
  private mantleTimer = 0;
  private mantleDuration = 0.42;
  private mantleStart = new THREE.Vector3();
  private mantleEnd = new THREE.Vector3();
  private jumpBuffer = 0;
  private coyoteTime = 0;
  private jumpHeldTime = 0;
  private slideTimer = 0;
  private wallRunTimer = 0;
  private wallRunNormal = new THREE.Vector3();
  private wallRunBox?: SolidBox;
  private grounded = true;
  private sliding = false;
  private vaulting = false;
  private mantling = false;
  private wallRunning = false;
  private cameraHeight = 1.58;
  private cameraRoll = 0;
  private landKick = 0;
  private elapsed = 0;
  private sensitivity = 0.00215;
  private resetRequested = false;
  private interactRequested = false;
  private jumpPressedThisStep = false;
  private lastFootstep = 0;
  private action = "READY";
  private onJump?: () => void;
  private onLand?: () => void;
  private onVault?: () => void;
  private onStep?: () => void;
  private onSlide?: () => void;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly level: Level,
  ) {
    this.position.set(0, 0.02, 42);
    this.canvas.addEventListener("click", this.tryLock);
    document.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  setAudioCallbacks(callbacks: { jump?: () => void; land?: () => void; vault?: () => void; step?: () => void; slide?: () => void }): void {
    this.onJump = callbacks.jump;
    this.onLand = callbacks.land;
    this.onVault = callbacks.vault;
    this.onStep = callbacks.step;
    this.onSlide = callbacks.slide;
  }

  private readonly tryLock = (): void => {
    if (document.pointerLockElement !== this.canvas && document.pointerLockElement == null) {
      void this.canvas.requestPointerLock();
    }
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    this.yaw -= event.movementX * this.sensitivity;
    this.pitch -= event.movementY * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const code = event.code as KeyName;
    if (["Space", "ControlLeft", "ControlRight"].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.keys.add(code);
    if (event.code === "Space") {
      this.jumpBuffer = 0.14;
      this.jumpPressedThisStep = true;
    }
    if (event.code === "KeyE") this.interactRequested = true;
    if (event.code === "KeyR") this.resetRequested = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly clearKeys = (): void => {
    this.keys.clear();
  };

  consumeResetRequest(): boolean {
    const requested = this.resetRequested;
    this.resetRequested = false;
    return requested;
  }

  getHorizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get isSliding(): boolean {
    return this.sliding;
  }

  get isWallRunning(): boolean {
    return this.wallRunning;
  }

  get isVaulting(): boolean {
    return this.vaulting || this.mantling;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get currentAction(): string {
    return this.action;
  }

  step(dt: number): void {
    this.elapsed += dt;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyoteTime = this.grounded ? 0.11 : Math.max(0, this.coyoteTime - dt);
    this.jumpHeldTime = this.keys.has("Space") ? this.jumpHeldTime + dt : 0;
    this.action = "RUN";
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const forwardInput = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const sideInput = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const hasInput = forwardInput !== 0 || sideInput !== 0;
    const wish = new THREE.Vector3()
      .addScaledVector(forward, forwardInput)
      .addScaledVector(right, sideInput);
    if (wish.lengthSq() > 1) wish.normalize();

    if (this.interactRequested) {
      if (this.grounded && !this.sliding) this.tryVault(forward);
      if (!this.grounded && !this.wallRunning && !this.vaulting) this.tryMantle();
      this.interactRequested = false;
    }

    if (this.grounded && (this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.keys.has("KeyC")) && !this.sliding) {
      if (this.getHorizontalSpeed() > 4.4) {
        this.sliding = true;
        this.slideTimer = 1.18;
        this.onSlide?.();
      }
    }
    if (!this.grounded) this.sliding = false;

    if (this.mantling) {
      this.advanceMantle(dt);
      this.jumpPressedThisStep = false;
      return;
    }
    if (this.vaulting) {
      this.advanceVault(dt);
      this.jumpPressedThisStep = false;
      return;
    }

    if (this.grounded) {
      const platform = this.level.floorAt(this.position.x, this.position.z, this.position.y + 0.08, PLAYER_RADIUS);
      if (!platform) {
        this.grounded = false;
        this.coyoteTime = 0.11;
      } else {
        this.position.y = platform.top;
      }
    }

    if (this.sliding) {
      this.action = "SLIDE";
      this.slideTimer = Math.max(0, this.slideTimer - dt);
      if (hasInput) {
        const desired = wish.multiplyScalar(Math.max(this.getHorizontalSpeed(), 5.2));
        this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, dt * 2.5);
        this.velocity.z += (desired.z - this.velocity.z) * Math.min(1, dt * 2.5);
      }
      const slideSpeed = this.getHorizontalSpeed();
      const decel = 2.8 * dt;
      if (slideSpeed > 0.01) {
        const scale = Math.max(0, slideSpeed - decel) / slideSpeed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
      if (this.slideTimer <= 0 || slideSpeed < 2.8) this.sliding = false;
    } else if (hasInput) {
      const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
      const targetSpeed = sprinting ? 11.8 : 7.4;
      const targetX = wish.x * targetSpeed;
      const targetZ = wish.z * targetSpeed;
      const accel = this.grounded ? 25 : 8.4;
      this.velocity.x = this.approach(this.velocity.x, targetX, accel * dt);
      this.velocity.z = this.approach(this.velocity.z, targetZ, accel * dt);
      if (sprinting && this.getHorizontalSpeed() > 8.5) this.action = "SPRINT";
    } else {
      const drag = this.grounded ? 12.5 : 0.65;
      const speed = this.getHorizontalSpeed();
      if (speed > 0.01) {
        const nextSpeed = Math.max(0, speed - drag * dt);
        const scale = nextSpeed / speed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }

    if (this.jumpBuffer > 0 && (this.grounded || this.coyoteTime > 0)) {
      this.jump();
    }

    this.updateWallRun(dt);
    if (!this.wallRunning) {
      let gravity = 22;
      if (this.jumpHeldTime < 0.19 && this.velocity.y > 0) gravity = 13.8;
      this.velocity.y -= gravity * dt;
    } else {
      this.action = "WALL RUN";
      this.wallRunTimer += dt;
      this.velocity.y = Math.max(-1.65, this.velocity.y - 4.8 * dt);
      if (this.jumpPressedThisStep) {
        this.wallJump();
      } else if (this.wallRunTimer > 1.65 || !this.wallRunBox || !this.stillAlongWall(this.wallRunBox)) {
        this.wallRunning = false;
        this.wallRunBox = undefined;
      }
    }

    const maxStep = 0.18;
    const horizontalDistance = Math.hypot(this.velocity.x, this.velocity.z) * dt;
    const parts = Math.max(1, Math.ceil(horizontalDistance / maxStep));
    const dx = (this.velocity.x * dt) / parts;
    const dz = (this.velocity.z * dt) / parts;
    for (let i = 0; i < parts; i++) {
      this.moveHorizontalAxis("x", dx);
      this.moveHorizontalAxis("z", dz);
    }

    const oldY = this.position.y;
    const nextY = oldY + this.velocity.y * dt;
    if (this.velocity.y <= 0) {
      const platform = this.level.floorAt(this.position.x, this.position.z, oldY + 0.035, PLAYER_RADIUS);
      if (platform && nextY <= platform.top && oldY >= platform.top - 0.12 && !this.wallRunning) {
        this.position.y = platform.top;
        this.velocity.y = 0;
        if (!this.grounded && oldY - platform.top > 0.22) {
          this.landKick = Math.min(0.16, Math.sqrt((oldY - platform.top) * 44) * 0.012 + 0.02);
          this.onLand?.();
        }
        this.grounded = true;
        this.coyoteTime = 0.11;
        this.sliding = this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.keys.has("KeyC");
        if (this.sliding) this.onSlide?.();
      } else {
        this.position.y = nextY;
        this.grounded = false;
      }
    } else {
      this.position.y = nextY;
      this.grounded = false;
    }

    if (this.position.y < -18) {
      this.action = "FALL";
    }
    if (this.grounded && this.getHorizontalSpeed() > 1.4) {
      this.lastFootstep += dt * this.getHorizontalSpeed() / 5.5;
      if (this.lastFootstep >= 1) {
        this.lastFootstep -= 1;
        this.onStep?.();
      }
    }
    if (this.wallRunning) {
      this.cameraRoll = this.wallRunNormal.x !== 0 ? -this.wallRunNormal.x * 0.13 : this.wallRunNormal.z * 0.13;
    } else {
      const strafe = sideInput;
      this.cameraRoll = THREE.MathUtils.damp(this.cameraRoll, -strafe * 0.025, 6, dt);
    }
    this.jumpPressedThisStep = false;
  }

  private approach(current: number, target: number, delta: number): number {
    return current < target ? Math.min(target, current + delta) : Math.max(target, current - delta);
  }

  private jump(): void {
    this.velocity.y = this.sliding ? 9.5 : 9.35;
    this.grounded = false;
    this.sliding = false;
    this.coyoteTime = 0;
    this.jumpBuffer = 0;
    this.jumpHeldTime = 0;
    this.action = "JUMP";
    this.onJump?.();
  }

  private wallJump(): void {
    this.wallRunning = false;
    this.wallRunBox = undefined;
    this.velocity.x = this.wallRunNormal.x * 7.1 + this.velocity.x;
    this.velocity.z = this.wallRunNormal.z * 7.1 + this.velocity.z;
    this.velocity.y = 9.4;
    this.jumpBuffer = 0;
    this.jumpHeldTime = 0;
    this.jumpPressedThisStep = false;
    this.action = "WALL KICK";
    this.onJump?.();
  }

  private moveHorizontalAxis(axis: "x" | "z", amount: number): void {
    if (amount === 0) return;
    const old = axis === "x" ? this.position.x : this.position.z;
    if (axis === "x") this.position.x += amount;
    else this.position.z += amount;
    const height = this.sliding ? SLIDE_HEIGHT : STAND_HEIGHT;
    for (const box of this.level.solids) {
      if (this.vaulting && box.kind === "vault") continue;
      if (this.mantling && box.kind !== "wallrun") continue;
      if (this.position.y >= box.maxY || this.position.y + height <= box.minY) continue;
      const overlapX = this.position.x + PLAYER_RADIUS > box.minX && this.position.x - PLAYER_RADIUS < box.maxX;
      const overlapZ = this.position.z + PLAYER_RADIUS > box.minZ && this.position.z - PLAYER_RADIUS < box.maxZ;
      if (overlapX && overlapZ) {
        if (axis === "x") this.position.x = old;
        else this.position.z = old;
        if (axis === "x") this.velocity.x = 0;
        else this.velocity.z = 0;
        break;
      }
    }
  }

  private updateWallRun(dt: number): void {
    if (this.grounded || this.sliding || this.vaulting || this.mantling) return;
    if (this.wallRunning) {
      if (!this.wallRunBox || !this.stillAlongWall(this.wallRunBox)) {
        this.wallRunning = false;
        this.wallRunBox = undefined;
      } else {
        if (this.wallRunNormal.x !== 0) {
          this.position.x = this.wallRunNormal.x < 0
            ? this.wallRunBox.minX - PLAYER_RADIUS - 0.035
            : this.wallRunBox.maxX + PLAYER_RADIUS + 0.035;
          if (Math.abs(this.velocity.z) < 8.5) this.velocity.z = Math.sign(this.velocity.z || -1) * 8.5;
        } else {
          this.position.z = this.wallRunNormal.z < 0
            ? this.wallRunBox.minZ - PLAYER_RADIUS - 0.035
            : this.wallRunBox.maxZ + PLAYER_RADIUS + 0.035;
          if (Math.abs(this.velocity.x) < 8.5) this.velocity.x = Math.sign(this.velocity.x || 1) * 8.5;
        }
        return;
      }
    }

    const result = this.level.findWallRunSurface(this.position.x, this.position.z, this.velocity.x, this.velocity.z);
    if (result && this.position.y > 0.45 && this.position.y < 3.4) {
      this.wallRunning = true;
      this.wallRunBox = result.surface.box;
      this.wallRunNormal.set(result.normalX, 0, result.normalZ);
      this.wallRunTimer = 0;
      this.velocity.y = Math.max(this.velocity.y, 2.6);
      if (result.normalX !== 0) {
        this.position.x = result.normalX < 0
          ? result.surface.box.minX - PLAYER_RADIUS - 0.035
          : result.surface.box.maxX + PLAYER_RADIUS + 0.035;
        this.velocity.x = 0;
      } else {
        this.position.z = result.normalZ < 0
          ? result.surface.box.minZ - PLAYER_RADIUS - 0.035
          : result.surface.box.maxZ + PLAYER_RADIUS + 0.035;
        this.velocity.z = 0;
      }
    }
    void dt;
  }

  private stillAlongWall(box: SolidBox): boolean {
    if (box.maxZ - box.minZ > box.maxX - box.minX) {
      return this.position.z >= box.minZ - 0.6 && this.position.z <= box.maxZ + 0.6;
    }
    return this.position.x >= box.minX - 0.6 && this.position.x <= box.maxX + 0.6;
  }

  private tryVault(forward: THREE.Vector3): void {
    if (this.getHorizontalSpeed() < 3.4) return;
    const target = this.level.findVaultTarget(this.position.x, this.position.z, forward.x, forward.z);
    if (!target) return;
    const widthX = target.maxX - target.minX;
    const widthZ = target.maxZ - target.minZ;
    const centerX = (target.minX + target.maxX) / 2;
    const centerZ = (target.minZ + target.maxZ) / 2;
    const distanceToCenter = (centerX - this.position.x) * forward.x + (centerZ - this.position.z) * forward.z;
    const halfExtent = (Math.abs(forward.x) * widthX + Math.abs(forward.z) * widthZ) / 2;
    const distance = Math.max(0, distanceToCenter) + halfExtent + PLAYER_RADIUS + 0.42;
    this.vaultStart.copy(this.position);
    this.vaultEnd.set(this.position.x + forward.x * distance, this.position.y, this.position.z + forward.z * distance);
    this.vaultDuration = THREE.MathUtils.clamp(0.43 + target.maxY * 0.09, 0.48, 0.63);
    this.vaultTimer = this.vaultDuration;
    this.vaulting = true;
    this.sliding = false;
    this.action = "VAULT";
    this.onVault?.();
  }

  private advanceVault(dt: number): void {
    this.vaultTimer = Math.max(0, this.vaultTimer - dt);
    const t = 1 - this.vaultTimer / this.vaultDuration;
    const smooth = t * t * (3 - 2 * t);
    this.position.x = THREE.MathUtils.lerp(this.vaultStart.x, this.vaultEnd.x, smooth);
    this.position.z = THREE.MathUtils.lerp(this.vaultStart.z, this.vaultEnd.z, smooth);
    this.position.y = this.vaultStart.y + Math.sin(Math.PI * t) * 1.22;
    this.velocity.x *= 0.998;
    this.velocity.z *= 0.998;
    this.velocity.y = 0;
    this.grounded = false;
    this.action = "VAULT";
    if (this.vaultTimer <= 0) {
      const floor = this.level.floorAt(this.position.x, this.position.z, this.vaultStart.y + 0.2, PLAYER_RADIUS);
      this.position.y = floor?.top ?? this.vaultStart.y;
      this.vaulting = false;
      this.grounded = Boolean(floor);
      this.velocity.y = 0;
    }
  }

  private tryMantle(): void {
    let best: { platform: { x: number; z: number; width: number; depth: number; top: number }; distance: number; x: number; z: number } | undefined;
    for (const platform of this.level.platforms) {
      if (platform.top < this.position.y - 1.1 || platform.top > this.position.y + 0.75) continue;
      const halfW = platform.width / 2 - 0.48;
      const halfD = platform.depth / 2 - 0.48;
      const targetX = THREE.MathUtils.clamp(this.position.x, platform.x - halfW, platform.x + halfW);
      const targetZ = THREE.MathUtils.clamp(this.position.z, platform.z - halfD, platform.z + halfD);
      const distance = Math.hypot(targetX - this.position.x, targetZ - this.position.z);
      if (distance < 1.25 && (!best || distance < best.distance)) {
        best = { platform, distance, x: targetX, z: targetZ };
      }
    }
    if (!best) return;
    this.mantleStart.copy(this.position);
    this.mantleEnd.set(best.x, best.platform.top, best.z);
    this.mantleTimer = this.mantleDuration;
    this.mantling = true;
    this.velocity.set(0, 0, 0);
    this.action = "MANTLE";
  }

  private advanceMantle(dt: number): void {
    this.mantleTimer = Math.max(0, this.mantleTimer - dt);
    const t = 1 - this.mantleTimer / this.mantleDuration;
    const smooth = t * t * (3 - 2 * t);
    this.position.x = THREE.MathUtils.lerp(this.mantleStart.x, this.mantleEnd.x, smooth);
    this.position.z = THREE.MathUtils.lerp(this.mantleStart.z, this.mantleEnd.z, smooth);
    this.position.y = THREE.MathUtils.lerp(this.mantleStart.y, this.mantleEnd.y, smooth) + Math.sin(Math.PI * t) * 0.14;
    this.action = "MANTLE";
    if (this.mantleTimer <= 0) {
      this.position.copy(this.mantleEnd);
      this.grounded = true;
      this.mantling = false;
    }
  }

  respawn(x: number, y: number, z: number): void {
    this.position.set(x, y + 0.025, z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.sliding = false;
    this.vaulting = false;
    this.mantling = false;
    this.wallRunning = false;
    this.wallRunBox = undefined;
    this.jumpBuffer = 0;
    this.coyoteTime = 0.11;
    this.cameraHeight = 1.58;
    this.landKick = 0;
  }

  updateCamera(dt: number, reducedMotion: boolean): void {
    const speed = this.getHorizontalSpeed();
    const targetHeight = this.sliding ? 0.56 : STAND_HEIGHT - 0.2;
    this.cameraHeight = THREE.MathUtils.damp(this.cameraHeight, targetHeight, this.sliding ? 15 : 10, dt);
    const sprintBlend = THREE.MathUtils.clamp((speed - 6) / 7, 0, 1);
    const bobAmount = reducedMotion ? 0.006 : 0.018 + sprintBlend * 0.028;
    const bob = this.grounded && !reducedMotion
      ? Math.sin(this.elapsed * (7 + speed * 0.9)) * bobAmount
      : 0;
    this.landKick = THREE.MathUtils.damp(this.landKick, 0, 12, dt);
    const fovTarget = 74 + sprintBlend * (reducedMotion ? 3 : 8);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fovTarget, 5.5, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(this.position.x, this.position.y + this.cameraHeight + bob - this.landKick, this.position.z);
    const roll = reducedMotion ? this.cameraRoll * 0.35 : this.cameraRoll;
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, roll);
  }
}


