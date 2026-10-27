import * as THREE from 'three';

export interface MotionSettings {
  sensitivity: number;
  reducedMotion: boolean;
}

const BASE_FOV = 78;
const PITCH_LIMIT = Math.PI / 2 - 0.02;

/**
 * First-person camera with the subtle motion layer:
 * head bob, speed FOV, strafe roll, wall-run tilt, landing dip and
 * smooth eye-height changes while sliding.
 */
export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0;

  private eye = 1.62;
  private eyeTarget = 1.62;
  private bobPhase = 0;
  private bobY = 0;
  private bobX = 0;
  private roll = 0;
  private wallTiltTarget = 0;
  private wallTilt = 0;
  private dip = 0;
  private dipVel = 0;
  private fov = BASE_FOV;

  private right = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.08, 2400);
    this.camera.rotation.order = 'YXZ';
  }

  getBobPhase(): number {
    return this.bobPhase;
  }

  getRight(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  addMouse(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * 0.0022 * sensitivity;
    this.pitch -= dy * 0.0022 * sensitivity;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  }

  /** impact is 0..1 */
  onLand(impact: number): void {
    this.dipVel -= 2.2 * impact;
  }

  setWallTilt(radians: number): void {
    this.wallTiltTarget = radians;
  }

  update(dt: number, player: { pos: THREE.Vector3; height: number; grounded: boolean; sliding: boolean; hSpeed: number; strafeLean: number }, s: MotionSettings): void {
    const reduced = s.reducedMotion;

    // Eye height (slides lower smoothly).
    this.eyeTarget = player.sliding ? 0.72 : 1.62;
    this.eye += (this.eyeTarget - this.eye) * Math.min(1, dt * (reduced ? 20 : 12));

    // Head bob while moving on the ground.
    const speed = player.hSpeed;
    if (!reduced && player.grounded && !player.sliding && speed > 1) {
      this.bobPhase += dt * (5.5 + speed * 0.75);
      const amp = Math.min(speed / 10, 1);
      this.bobY = Math.sin(this.bobPhase * 2) * 0.028 * amp;
      this.bobX = Math.cos(this.bobPhase) * 0.02 * amp;
    } else {
      this.bobY *= 1 - Math.min(1, dt * 8);
      this.bobX *= 1 - Math.min(1, dt * 8);
    }

    // Landing dip spring.
    this.dipVel += (-this.dip * 220 - this.dipVel * 14) * dt;
    this.dip += this.dipVel * dt;

    // Roll: strafe lean + wall-run tilt.
    this.wallTilt += (this.wallTiltTarget - this.wallTilt) * Math.min(1, dt * 7);
    const strafeTarget = reduced ? 0 : -player.strafeLean * 0.022;
    this.roll = strafeTarget + this.wallTilt;

    // FOV: widens with speed.
    const speed01 = THREE.MathUtils.clamp((speed - 6) / 5, 0, 1);
    const fovTarget = BASE_FOV + speed01 * (reduced ? 4 : 9) + (player.sliding ? 3 : 0);
    this.fov += (fovTarget - this.fov) * Math.min(1, dt * 6);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    // Compose transform.
    this.camera.rotation.set(this.pitch, this.yaw, this.roll);
    this.getRight(this.right);
    const feetY = player.pos.y - player.height / 2;
    const eyeY = reduced ? this.eye : this.eye + this.bobY + this.dip * 0.1;
    this.camera.position.set(
      player.pos.x + this.right.x * this.bobX,
      feetY + eyeY,
      player.pos.z + this.right.z * this.bobX
    );
  }
}
