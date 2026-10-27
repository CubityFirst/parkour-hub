/**
 * First-person body: simple stylised arms, hands and feet rendered on a
 * dedicated layer (1) so they can never clip into world geometry — the game
 * draws them in a second pass with a cleared depth buffer.
 *
 * Poses are procedural: sprint arm swing tied to the gait phase, hands up
 * while riding the zipline, a reach-forward on vault/mantle, one arm braced
 * against the wall during wall runs, and legs that tuck under a slide.
 */

import * as THREE from 'three';
import type { PlayerController } from './PlayerController.ts';
import { clamp, lerp } from '../core/vec3.ts';

const LAYER_BODY = 1;

function makeLimbGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.085, 0.085, 0.42);
}

export class BodyView {
  readonly group = new THREE.Group();
  motionScale = 1;

  private sleeveMat: THREE.MeshStandardMaterial;
  private handMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private shoeMat: THREE.MeshStandardMaterial;

  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private zipPose = 0; // eased 0..1 while hanging
  private vaultPose = 0;
  private wallPose = 0;
  private slidePose = 0;

  constructor() {
    this.sleeveMat = new THREE.MeshStandardMaterial({
      color: 0xeef1f4,
      roughness: 0.85,
    });
    this.handMat = new THREE.MeshStandardMaterial({
      color: 0xd92f22, // red gloves = runner kit
      roughness: 0.6,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.9 });
    this.shoeMat = new THREE.MeshStandardMaterial({ color: 0xc22a20, roughness: 0.55 });

    const limb = makeLimbGeometry();

    const buildArm = (side: number): THREE.Group => {
      const g = new THREE.Group();
      const upper = new THREE.Mesh(limb, this.sleeveMat);
      upper.position.set(0, 0, -0.19);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.13), this.handMat);
      hand.position.set(0, -0.02, -0.44);
      g.add(upper, hand);
      g.position.set(side * 0.34, -0.28, -0.18);
      g.traverse((o) => {
        o.layers.set(LAYER_BODY);
      });
      return g;
    };
    this.armL = buildArm(-1);
    this.armR = buildArm(1);

    const buildLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.4), this.pantsMat);
      thigh.position.set(0, -0.02, -0.16);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), this.shoeMat);
      shoe.position.set(0, -0.075, -0.36);
      g.add(thigh, shoe);
      g.position.set(side * 0.13, -0.24, -0.05);
      g.traverse((o) => {
        o.layers.set(LAYER_BODY);
      });
      return g;
    };
    this.legL = buildLeg(-1);
    this.legR = buildLeg(1);

    this.group.add(this.armL, this.armR, this.legL, this.legR);
  }

  update(c: PlayerController, dt: number, elapsed: number): void {
    const speedN = clamp(c.speedXZ / 9.4, 0, 1);
    const mode = c.mode;
    this.zipPose += ((mode === 'zipline' ? 1 : 0) - this.zipPose) * clamp(dt * 10, 0, 1);
    this.vaultPose +=
      ((mode === 'vault' || mode === 'mantle' ? 1 : 0) - this.vaultPose) * clamp(dt * 12, 0, 1);
    const wallTarget = mode === 'wallrun' ? 1 : 0;
    this.wallPose += (wallTarget - this.wallPose) * clamp(dt * 10, 0, 1);
    const slideTarget = c.sliding ? 1 : 0;
    this.slidePose += (slideTarget - this.slidePose) * clamp(dt * 14, 0, 1);

    const m = this.motionScale;
    const swing = Math.sin(c.gaitPhase) * 0.55 * speedN * m * (c.body.grounded ? 1 : 0.25);
    const swingR = Math.sin(c.gaitPhase + Math.PI) * 0.55 * speedN * m * (c.body.grounded ? 1 : 0.25);
    const breathe = Math.sin(elapsed * 1.6) * 0.02;

    // ---- arms ----
    // base: relaxed forward-lower pose; sprint: alternate pendulum swing
    const armBaseX = -0.12 + breathe;
    const idleSpread = 0.1;

    const setArm = (g: THREE.Group, baseSwing: number, side: number): void => {
      let rotX = armBaseX + baseSwing;
      let rotY = side * idleSpread;
      let rotZ = 0;
      let px = side * 0.34;
      let py = -0.30;
      let pz = -0.16;

      // zipline: both hands up gripping the cable
      rotX = lerp(rotX, 1.55, this.zipPose);
      py = lerp(py, 0.02, this.zipPose);
      pz = lerp(pz, -0.34, this.zipPose);
      px = lerp(px, side * 0.13, this.zipPose);
      rotZ = lerp(rotZ, -side * 0.15 + Math.sin(elapsed * 2.4) * 0.04 * m, this.zipPose);

      // vault/mantle: quick reach-and-press over the obstacle
      rotX = lerp(rotX, 1.9, this.vaultPose);
      py = lerp(py, -0.06, this.vaultPose);
      pz = lerp(pz, -0.42, this.vaultPose);
      px = lerp(px, side * 0.2, this.vaultPose);

      // wall run: outside hand reaches to the wall, other tucks
      if (this.wallPose > 0.001) {
        const reachSide = c.parkour.wallSide; // +1 wall on right
        const w = this.wallPose;
        if (side === reachSide) {
          rotZ = lerp(rotZ, -side * 0.9, w);
          px = lerp(px, side * 0.42, w);
          rotX = lerp(rotX, 0.25, w);
        } else {
          rotX = lerp(rotX, -0.5, w);
        }
      }

      g.rotation.set(rotX, rotY, rotZ);
      g.position.set(px, py, pz);
    };
    setArm(this.armL, -swing, -1);
    setArm(this.armR, -swingR, 1);

    // ---- legs ----
    const legSwing = Math.sin(c.gaitPhase) * 0.5 * speedN * m;
    const setLeg = (g: THREE.Group, s: number): void => {
      let rotX = -0.08 + s;
      if (!c.body.grounded && this.zipPose < 0.5) rotX = -0.5 + s * 0.3; // airborne tuck
      rotX = lerp(rotX, 0.95, this.zipPose); // legs trail below on the zipline
      rotX = lerp(rotX, 1.25, this.slidePose); // stretched forward while sliding
      g.rotation.set(rotX, 0, 0);
      g.position.y = lerp(-0.24, -0.28, this.zipPose);
    };
    setLeg(this.legL, legSwing);
    setLeg(this.legR, -legSwing);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
      }
    });
    for (const mat of [this.sleeveMat, this.handMat, this.pantsMat, this.shoeMat]) {
      mat.dispose();
    }
  }
}
