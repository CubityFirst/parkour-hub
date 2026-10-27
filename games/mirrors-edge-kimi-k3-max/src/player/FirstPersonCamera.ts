import * as THREE from 'three';
import { TUNING } from './PlayerPhysics';
import { PlayerBody } from './PlayerBody';

export interface FrameState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  grounded: boolean;
  sliding: boolean;
  sprinting: boolean;
  strafe: number;
  wallrunSide: number; // -1 left, 0 none, +1 right
  vaultT: number; // -1 or 0..1
  mantleT: number; // -1 or 0..1
}

/**
 * First-person camera: mouse look, speed FOV, head bob, strafe lean,
 * wallrun tilt, landing dip, vault dip, slide height — all spring-smoothed.
 */
export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  pitch = 0;

  private roll = 0;
  private readonly baseFov = 74;
  private fov = this.baseFov;
  private eyeH = TUNING.eyeStand;
  private bobPhase = 0;
  private dip = 0;
  private dipV = 0;
  private kick = 0;
  private kickV = 0;
  private body3d: PlayerBody;

  constructor(scene: THREE.Scene) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.08, 3000);
    this.camera.rotation.order = 'YXZ';
    this.body3d = new PlayerBody(this.camera);
    scene.add(this.camera);
  }

  look(dx: number, dy: number, sens: number): void {
    const s = sens * 0.0022;
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * s));
  }

  onLand(fallSpeed: number): void {
    const k = Math.min(0.5, 0.05 + fallSpeed * 0.03);
    this.dipV -= k;
    this.kickV -= k * 0.16;
  }

  onVault(): void {
    this.kickV += 0.14;
  }

  resetView(yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.dip = 0;
    this.dipV = 0;
    this.kick = 0;
    this.kickV = 0;
  }

  setBodyVisible(v: boolean): void {
    this.body3d.setVisible(v);
  }

  update(dt: number, s: FrameState, motionScale: number): void {
    // landing dip & vault kick springs
    this.dipV += (-this.dip * 170 - this.dipV * 15) * dt;
    this.dip += this.dipV * dt;
    this.kickV += (-this.kick * 150 - this.kickV * 14) * dt;
    this.kick += this.kickV * dt;

    const hspeed = Math.hypot(s.vel.x, s.vel.z);
    const spNorm = Math.max(0, Math.min(1, (hspeed - 4.5) / 5.5));

    // head bob
    if (s.grounded && !s.sliding && hspeed > 0.6) this.bobPhase += dt * hspeed * 1.35;
    const bobY = Math.sin(this.bobPhase * 2) * 0.03 * spNorm * motionScale;
    const bobX = Math.cos(this.bobPhase) * 0.018 * spNorm * motionScale;

    // eye height (slide)
    const targetH = s.sliding ? TUNING.eyeSlide : TUNING.eyeStand;
    this.eyeH += (targetH - this.eyeH) * Math.min(1, 13 * dt);

    // roll: wallrun tilt (toward the wall) + strafe lean
    const rollTarget = -s.wallrunSide * 0.235 * (0.4 + 0.6 * motionScale) - s.strafe * 0.02 * motionScale;
    this.roll += (rollTarget - this.roll) * Math.min(1, 9 * dt);

    // speed FOV
    const fovTarget = this.baseFov + spNorm * 13 * motionScale + (s.wallrunSide !== 0 ? 3 : 0);
    if (Math.abs(fovTarget - this.fov) > 0.01) {
      this.fov += (fovTarget - this.fov) * Math.min(1, 6.5 * dt);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // vault / mantle camera dip
    let actionDip = 0;
    if (s.vaultT >= 0) actionDip = -Math.sin(s.vaultT * Math.PI) * 0.13 * motionScale;
    if (s.mantleT >= 0) actionDip = -Math.sin(s.mantleT * Math.PI) * 0.2 * motionScale;

    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.camera.position.set(
      s.pos.x + rx * bobX,
      s.pos.y + this.eyeH + bobY + this.dip * motionScale,
      s.pos.z + rz * bobX,
    );
    this.camera.rotation.set(this.pitch + this.kick * motionScale + actionDip, this.yaw, this.roll);

    this.body3d.update(dt, {
      bobPhase: this.bobPhase,
      sprinting: s.sprinting,
      sliding: s.sliding,
      wallrunSide: s.wallrunSide,
      vaultT: s.vaultT,
      mantleT: s.mantleT,
      hspeed,
      motionScale,
      grounded: s.grounded,
    });
  }
}
