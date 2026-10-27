/**
 * First-person camera rig: smooths the raw body yaw/pitch and layers on the
 * movement-communication effects (head bob, speed FOV, strafe roll, wall-run
 * tilt, landing dip, slide crouch, vault arc, zipline sway).
 *
 * `motionScale` (0..1) is the "reduce camera motion" accessibility setting;
 * 0 keeps the camera rock-steady while all gameplay stays identical.
 */

import * as THREE from 'three';
import { MOUSE, MOVE, PLAYER } from './Movement.ts';
import type { PlayerController } from './PlayerController.ts';
import { clamp, smooth } from '../core/vec3.ts';

export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  motionScale = 1;

  private eye = PLAYER.standEye;
  private dip = 0; // landing compression (m)
  private dipVel = 0;
  private roll = 0;
  private bobY = 0;
  private bobX = 0;
  private swayTime = 0;
  private displayYaw = 0;
  private displayPitch = 0;
  private fov = 74;
  private vaultPunch = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.fov, aspect, 0.035, 1600);
    this.camera.rotation.order = 'YXZ';
  }

  /** react to controller events (landing impact etc.) */
  handleEvent(type: string, intensity = 0): void {
    if (type === 'land') {
      const impact = clamp((intensity - 3.5) / 22, 0, 1);
      this.dipVel -= impact * 9; // spring kick downward
    } else if (type === 'wallJump') {
      this.dipVel -= 1.6;
    } else if (type === 'zipRelease') {
      this.dipVel -= 2.2;
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(c: PlayerController, dt: number): void {
    const b = c.body;
    const m = this.motionScale;
    this.swayTime += dt;

    // ---- smoothed look -------------------------------------------------
    // yaw is unbounded; track with wrapped difference so no spin-up on respawn
    this.displayYaw += angleDelta(b.yaw, this.displayYaw) * smooth(60, dt);
    this.displayPitch += (b.pitch - this.displayPitch) * smooth(60, dt);
    this.displayPitch = clamp(this.displayPitch, -MOUSE.pitchLimit, MOUSE.pitchLimit);

    // ---- eye height: slide crouch + bob + landing spring ---------------
    const targetEye =
      c.sliding && c.mode !== 'wallrun' ? PLAYER.slideEye : PLAYER.standEye;
    this.eye += (targetEye - this.eye) * smooth(c.sliding ? 16 : 9, dt);

    // head bob driven by the gait phase (subtle, rate-scaled with speed)
    let bobTargetY = 0;
    let bobTargetX = 0;
    if (b.grounded && !c.sliding && c.speedXZ > 1.2) {
      const amp = m * clamp(c.speedXZ / MOVE.sprintSpeed, 0, 1) * 0.028;
      bobTargetY = Math.sin(c.gaitPhase * 2) * amp;
      bobTargetX = Math.sin(c.gaitPhase) * amp * 0.62;
    }
    this.bobY += (bobTargetY - this.bobY) * smooth(24, dt);
    this.bobX += (bobTargetX - this.bobX) * smooth(24, dt);

    // landing dip spring (critically-ish damped)
    this.dipVel += -this.dip * 260 * dt - this.dipVel * 16 * dt;
    this.dip += this.dipVel * dt;
    this.dip = clamp(this.dip, -0.24, 0.08);

    // ---- roll: strafe lean + wall tilt + zipline sway -------------------
    let rollTarget = 0;
    if (c.mode === 'wallrun') {
      rollTarget = c.parkour.wallSide * MOVE.wallRun.roll;
    } else if (b.grounded) {
      rollTarget = -c.strafeInput * 0.026 * m * clamp(c.speedXZ / MOVE.walkSpeed, 0, 1);
    } else if (c.mode === 'zipline') {
      rollTarget = Math.sin(this.swayTime * 2.4) * 0.055 * m + Math.sin(c.parkour.progress * 20) * 0.01;
    }
    rollTarget *= m;
    this.roll += (rollTarget - this.roll) * smooth(8, dt);

    // ---- vault punch: small rise-and-settle camera offset ---------------
    const vpTarget = c.mode === 'vault' || c.mode === 'mantle' ? Math.sin(Math.PI * c.parkour.progress) : 0;
    this.vaultPunch += (vpTarget - this.vaultPunch) * smooth(14, dt);

    // ---- FOV -------------------------------------------------------------
    const speedFov = clamp((c.speedXZ - 5.6) * 1.9, 0, 16);
    const zipFov = c.mode === 'zipline' ? 8 : 0;
    const fovTarget = 74 + speedFov + zipFov + this.vaultPunch * 3;
    const newFov = this.fov + (fovTarget - this.fov) * smooth(5, dt);
    if (Math.abs(newFov - this.fov) > 0.01) {
      this.fov = newFov;
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // ---- place camera ------------------------------------------------------
    const rx = Math.cos(b.yaw);
    const rz = -Math.sin(b.yaw);
    const pos = this.camera.position;
    pos.set(
      b.pos.x + rx * this.bobX,
      b.pos.y + this.eye + this.bobY + this.dip + this.vaultPunch * 0.16 * m,
      b.pos.z + rz * this.bobX,
    );
    this.camera.rotation.set(this.displayPitch, this.displayYaw, this.roll);
  }

  /** hard-align display state to the body (respawn / first spawn) */
  snapTo(c: PlayerController): void {
    this.displayYaw = c.body.yaw;
    this.displayPitch = c.body.pitch;
    this.dip = 0;
    this.dipVel = 0;
    this.roll = 0;
    this.eye = PLAYER.standEye;
    this.vaultPunch = 0;
  }
}

/** shortest signed delta from a to b, both raw radians (unwrapped targets) */
function angleDelta(target: number, current: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
