import * as THREE from 'three';
import type { PlayerController } from './PlayerController';
import { PHYS } from './PlayerPhysics';

export interface CameraSettings {
  baseFov: number;
  /** 1 = full camera motion, ~0.25 = reduced motion */
  motion: number;
}

/** Critically-damped exponential smoothing factor. */
function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * First-person camera: mouse look plus all the procedural motion that sells
 * speed and physicality (head bob, FOV, roll, landing dips, vault/mantle).
 */
export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0;

  /** Bob phase in radians; one step every PI. */
  bobPhase = 0;
  /** Fired when a foot hits the ground according to the bob cycle. */
  onFootstep: ((speed: number) => void) | null = null;

  private eye: number = PHYS.eyeStand;
  private smoothFeetY = 0;
  private fov = 80;
  private roll = 0;
  private landOffset = 0;
  private landVel = 0;
  private pitchKick = 0;
  private pitchKickVel = 0;
  private bobAmount = 0;
  private lastStepIndex = 0;
  private renderPos = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(80, aspect, 0.05, 2600);
    this.camera.rotation.order = 'YXZ';
  }

  look(dx: number, dy: number, sensitivity: number): void {
    const k = 0.0022 * sensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  /** Called when the player teleports so smoothing doesn't sweep across the map. */
  snap(player: PlayerController, yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0;
    this.smoothFeetY = player.pos.y;
    this.eye = PHYS.eyeStand;
    this.landOffset = this.landVel = 0;
    this.pitchKick = this.pitchKickVel = 0;
    this.roll = 0;
  }

  landingImpact(impact: number, motion: number): void {
    const strength = Math.min(1, impact / 22);
    this.landVel -= (1.2 + strength * 3.2) * Math.max(0.3, motion);
    this.pitchKickVel -= strength * 0.6 * motion;
  }

  jumpKick(motion: number): void {
    this.landVel -= 0.5 * motion;
    this.pitchKickVel += 0.15 * motion;
  }

  update(dt: number, alpha: number, player: PlayerController, moveX: number, settings: CameraSettings): void {
    const m = settings.motion;
    const speed = player.horizontalSpeed;
    const state = player.state;

    // --- Position (interpolated between physics ticks) ----------------------
    this.renderPos.lerpVectors(player.prevPos, player.pos, alpha);
    // Smooth out step-ups while grounded; follow exactly in the air.
    const dy = this.renderPos.y - this.smoothFeetY;
    if (player.grounded && Math.abs(dy) < 0.6 && state !== 'climb') {
      this.smoothFeetY += dy * damp(22, dt);
    } else {
      this.smoothFeetY = this.renderPos.y;
    }

    // --- Eye height ----------------------------------------------------------
    let eyeTarget = player.crouched ? PHYS.eyeCrouch : PHYS.eyeStand;
    if (state === 'slide') eyeTarget = PHYS.eyeCrouch - 0.06;
    if (state === 'climb') eyeTarget = PHYS.eyeCrouch + 0.25;
    this.eye += (eyeTarget - this.eye) * damp(state === 'slide' ? 16 : 11, dt);

    // --- Springs for landing dip and pitch kicks ------------------------------
    this.landVel += (-140 * this.landOffset - 15 * this.landVel) * dt;
    this.landOffset += this.landVel * dt;
    this.pitchKickVel += (-120 * this.pitchKick - 14 * this.pitchKickVel) * dt;
    this.pitchKick += this.pitchKickVel * dt;

    // --- Head bob -----------------------------------------------------------
    const bobbing = player.grounded && state === 'ground' && speed > 0.8;
    this.bobAmount += ((bobbing ? Math.min(1, speed / PHYS.sprintSpeed) : 0) - this.bobAmount) * damp(8, dt);
    if (bobbing) {
      const stride = 1.5 + speed * 0.12;
      this.bobPhase += (dt * speed * Math.PI) / stride;
      const stepIndex = Math.floor(this.bobPhase / Math.PI);
      if (stepIndex !== this.lastStepIndex) {
        this.lastStepIndex = stepIndex;
        this.onFootstep?.(speed);
      }
    }
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.045 * this.bobAmount * m + 0.02 * this.bobAmount * m;
    const bobX = Math.sin(this.bobPhase) * 0.022 * this.bobAmount * m;
    const bobRoll = Math.sin(this.bobPhase) * 0.006 * this.bobAmount * m;

    // --- Roll ---------------------------------------------------------------
    let rollTarget = -moveX * 0.018 * m;
    if (state === 'wallrun') rollTarget = player.wallSide * 0.17 * m;
    if (state === 'slide') rollTarget = 0.045 * m;
    let climbPitch = 0;
    if (state === 'climb' && player.climb) {
      const u = player.climbProgress;
      const s = Math.sin(u * Math.PI);
      if (player.climb.kind === 'vault') {
        rollTarget = 0.07 * s * m;
        climbPitch = -0.16 * s * m;
      } else {
        climbPitch = -0.26 * s * m;
        rollTarget = 0.03 * s * m;
      }
    }
    this.roll += (rollTarget - this.roll) * damp(state === 'wallrun' ? 7 : 10, dt);

    // --- Field of view ------------------------------------------------------
    const speedK = Math.max(0, Math.min(1, (speed - 6.5) / 6));
    let fovTarget = settings.baseFov + speedK * 10 * (0.35 + 0.65 * m);
    if (state === 'wallrun') fovTarget += 3 * m;
    if (state === 'slide') fovTarget += 4 * m;
    this.fov += (fovTarget - this.fov) * damp(5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // --- Apply ----------------------------------------------------------------
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.camera.position.set(
      this.renderPos.x + cy * bobX,
      this.smoothFeetY + this.eye + bobY + this.landOffset * 0.3,
      this.renderPos.z - sy * bobX,
    );
    this.camera.rotation.set(this.pitch + this.pitchKick + climbPitch, this.yaw, this.roll + bobRoll);
  }

  get currentFov(): number {
    return this.fov;
  }
}
