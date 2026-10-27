import * as THREE from 'three';

export interface CameraMotionState {
  speed: number;
  grounded: boolean;
  sliding: boolean;
  wallRunning: boolean;
  wallSide: -1 | 0 | 1;
  vaulting: boolean;
  mantling: boolean;
  sprinting: boolean;
  strafe: number;
  forward: number;
}

const BASE_FOV = 79;

/**
 * First-person camera rig.  Handles look, head bob, speed-based FOV, roll,
 * landing impacts, slide height and wall-run tilt.
 */
export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  pitch = 0;
  sensitivity = 1;
  reduceMotion = false;

  private bobPhase = 0;
  private eyeHeight = 1.62;
  private currentEye = 1.62;
  private landDip = 0;
  private landVelocity = 0;
  private currentRoll = 0;
  private currentFov = BASE_FOV;
  private currentPitchOffset = 0;
  private vaultTilt = 0;

  private readonly right = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.05, 1800);
    this.camera.rotation.order = 'YXZ';
  }

  look(dx: number, dy: number): void {
    const scale = 0.00215 * this.sensitivity;
    this.yaw -= dx * scale;
    this.pitch -= dy * scale;
    this.pitch = Math.max(-1.46, Math.min(1.46, this.pitch));
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0;
  }

  getForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  getRight(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  land(impact: number): void {
    if (this.reduceMotion) return;
    const strength = Math.min(impact / 22, 1);
    this.landVelocity -= 1.65 * strength;
    this.currentPitchOffset += 0.012 * strength;
  }

  jumpKick(strength = 0.5): void {
    if (this.reduceMotion) return;
    this.currentPitchOffset -= 0.018 * strength;
  }

  wallJumpKick(): void {
    if (this.reduceMotion) return;
    this.currentRoll += 0.06;
    this.currentPitchOffset -= 0.012;
  }

  update(dt: number, position: THREE.Vector3, motion: CameraMotionState): void {
    const camera = this.camera;

    // Slide height and generic eye smoothing.
    const targetEye = motion.sliding ? 0.78 : 1.62;
    this.eyeHeight = targetEye;
    const eyeRate = motion.sliding ? 13 : 9;
    this.currentEye += (this.eyeHeight - this.currentEye) * Math.min(1, eyeRate * dt);

    const speed = motion.speed;
    const speedFactor = Math.min(Math.max((speed - 4) / 7.5, 0), 1);
    const moving = speed > 0.6 && motion.grounded;
    const bobAmount = this.reduceMotion ? 0 : Math.min(speed / 11, 1);

    if (moving) {
      this.bobPhase += dt * (5.4 + speed * 0.65);
    } else {
      this.bobPhase += dt * 1.4;
    }

    const bobStrength = moving ? bobAmount : 0;
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * bobStrength;
    const bobX = Math.cos(this.bobPhase) * 0.019 * bobStrength;

    // Landing spring.
    this.landDip += this.landVelocity * dt;
    this.landVelocity += (-this.landDip * 190 - this.landVelocity * 18) * dt;
    if (Math.abs(this.landDip) < 0.0001 && Math.abs(this.landVelocity) < 0.001) {
      this.landDip = 0;
      this.landVelocity = 0;
    }

    // Pitch kick decay.
    this.currentPitchOffset += (0 - this.currentPitchOffset) * Math.min(1, 10 * dt);

    // Roll: strafe + wall run.
    let targetRoll = motion.strafe * -0.024 * (0.4 + speedFactor * 0.6);
    if (motion.wallRunning) targetRoll += -motion.wallSide * 0.125;
    if (this.reduceMotion) targetRoll = 0;
    this.currentRoll += (targetRoll - this.currentRoll) * Math.min(1, 8 * dt);

    // Vault / mantle pitch bleed.
    this.vaultTilt += ((motion.vaulting ? 0.055 : motion.mantling ? 0.035 : 0) - this.vaultTilt) * Math.min(1, 9 * dt);
    if (this.reduceMotion) this.vaultTilt = 0;

    // FOV.
    let targetFov = BASE_FOV + speedFactor * 9;
    if (motion.sliding) targetFov += 2.5;
    if (motion.wallRunning) targetFov += 2;
    if (this.reduceMotion) targetFov = BASE_FOV;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, 5.5 * dt);
    if (Math.abs(camera.fov - this.currentFov) > 0.01) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }

    this.getRight(this.right);

    // Wall runs push the camera slightly towards the wall.
    const wallShift = motion.wallRunning ? -motion.wallSide * 0.11 : 0;

    camera.position.set(
      position.x + this.right.x * (bobX + wallShift),
      position.y + this.currentEye + bobY + this.landDip,
      position.z + this.right.z * (bobX + wallShift),
    );

    const roll = this.currentRoll + (motion.wallRunning ? 0 : 0);
    camera.rotation.set(
      this.pitch + this.currentPitchOffset - this.vaultTilt,
      this.yaw,
      roll,
      'YXZ',
    );
  }
}
