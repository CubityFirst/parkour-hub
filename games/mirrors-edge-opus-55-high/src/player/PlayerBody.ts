import * as THREE from 'three';
import type { PlayerController } from './PlayerController';

/**
 * Stylised low-poly body: arms rendered as a view model (drawn on top of the
 * world so they never clip into walls) and legs drawn in the world so they
 * appear when looking down or sliding.
 */

interface ArmPose {
  pos: THREE.Vector3;
  rot: THREE.Euler;
}

function pose(x: number, y: number, z: number, rx: number, ry = 0, rz = 0): ArmPose {
  return { pos: new THREE.Vector3(x, y, z), rot: new THREE.Euler(rx, ry, rz) };
}

class Arm {
  readonly root = new THREE.Group();
  private targetPos = new THREE.Vector3();
  private targetQuat = new THREE.Quaternion();

  constructor(side: number, sleeve: THREE.Material, skin: THREE.Material, band: THREE.Material) {
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.46), sleeve);
    forearm.position.z = 0.2;
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.08, 0.035), band);
    wrist.position.z = -0.04;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.1), skin);
    hand.position.set(0, -0.005, -0.12);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.065), skin);
    fingers.position.set(0, -0.016, -0.175);
    fingers.rotation.x = -0.35;
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.06), skin);
    thumb.position.set(-side * 0.045, 0.0, -0.09);
    thumb.rotation.y = side * 0.4;
    this.root.add(forearm, wrist, hand, fingers, thumb);
    for (const c of this.root.children) (c as THREE.Mesh).frustumCulled = false;
  }

  setTarget(p: ArmPose): void {
    this.targetPos.copy(p.pos);
    this.targetQuat.setFromEuler(p.rot);
  }

  update(k: number): void {
    this.root.position.lerp(this.targetPos, k);
    this.root.quaternion.slerp(this.targetQuat, k);
  }

  snap(): void {
    this.root.position.copy(this.targetPos);
    this.root.quaternion.copy(this.targetQuat);
  }
}

class Leg {
  readonly hip = new THREE.Group();
  readonly knee = new THREE.Group();

  constructor(side: number, pants: THREE.Material, shoe: THREE.Material, sole: THREE.Material) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.48, 0.19), pants);
    thigh.position.y = -0.24;
    this.knee.position.y = -0.46;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.15), pants);
    shin.position.y = -0.23;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.29), shoe);
    foot.position.set(0, -0.47, -0.06);
    const soleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.03, 0.3), sole);
    soleMesh.position.set(0, -0.535, -0.06);
    this.knee.add(shin, foot, soleMesh);
    this.hip.add(thigh, this.knee);
    this.hip.position.x = side * 0.11;
  }
}

export class PlayerBody {
  /** Rendered in the view-model pass (on top of everything). */
  readonly viewModel = new THREE.Group();
  /** Rendered in the world. */
  readonly legs = new THREE.Group();

  private left: Arm;
  private right: Arm;
  private legL: Leg;
  private legR: Leg;
  private pelvis = new THREE.Group();
  private hidden = { l: pose(-0.34, -0.8, -0.15, 0.7), r: pose(0.34, -0.8, -0.15, 0.7) };
  private legsVisible = 0;

  constructor() {
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc8906c, roughness: 0.7 });
    const band = new THREE.MeshStandardMaterial({ color: 0xe0201c, roughness: 0.6, emissive: 0x400404 });
    this.left = new Arm(-1, sleeve, skin, band);
    this.right = new Arm(1, sleeve, skin, band);
    this.viewModel.add(this.left.root, this.right.root);
    this.left.setTarget(this.hidden.l);
    this.right.setTarget(this.hidden.r);
    this.left.snap();
    this.right.snap();

    const pants = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.9 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xd8201c, roughness: 0.6, emissive: 0x300202 });
    const sole = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.8 });
    this.legL = new Leg(-1, pants, shoe, sole);
    this.legR = new Leg(1, pants, shoe, sole);
    this.pelvis.add(this.legL.hip, this.legR.hip);
    this.legs.add(this.pelvis);
  }

  update(dt: number, player: PlayerController, camera: THREE.Camera, renderPos: THREE.Vector3, yaw: number, pitch: number, bobPhase: number, sprinting: boolean): void {
    this.viewModel.position.copy(camera.position);
    this.viewModel.quaternion.copy(camera.quaternion);

    const speed = player.horizontalSpeed;
    const s = Math.sin(bobPhase);
    let l = this.hidden.l;
    let r = this.hidden.r;

    // Pose notes: an arm's forearm extends along local +Z from the wrist, so a
    // positive X rotation makes it run down and back toward the shoulder.
    switch (player.state) {
      case 'ground':
        if (sprinting && speed > 8) {
          // Pumping arms that just enter the bottom corners of the screen.
          l = pose(-0.33, -0.43 + Math.max(0, s) * 0.09, -0.46 - s * 0.07, 0.55 + s * 0.25, -0.25, 0.2);
          r = pose(0.33, -0.43 + Math.max(0, -s) * 0.09, -0.46 + s * 0.07, 0.55 - s * 0.25, 0.25, -0.2);
        }
        break;
      case 'air':
        if (speed > 5) {
          l = pose(-0.31, -0.37, -0.5, 0.42, -0.2, 0.25);
          r = pose(0.31, -0.37, -0.5, 0.42, 0.2, -0.25);
        }
        break;
      case 'slide':
        l = pose(-0.33, -0.36, -0.5, 0.3, -0.3, 0.35);
        r = pose(0.4, -0.62, -0.3, 0.7, 0.2, -0.2);
        break;
      case 'wallrun': {
        const side = player.wallSide;
        // Hand brushing along the wall, the other arm pumping.
        const wallHand = pose(side * 0.46, -0.06, -0.56, 0.35, -side * 0.3, side * 0.9);
        const other = pose(-side * 0.3, -0.4, -0.48, 0.5, side * 0.2, -side * 0.25);
        l = side < 0 ? wallHand : other;
        r = side > 0 ? wallHand : other;
        break;
      }
      case 'climb': {
        const u = Math.max(0, player.climbProgress);
        if (player.climb?.kind === 'vault') {
          // One hand planted on the obstacle (palm down), the other swinging over.
          l = pose(-0.16, -0.5 - u * 0.12, -0.55 + u * 0.3, -0.95, -0.15, 0);
          r = pose(0.32, -0.42, -0.45, 0.5, 0.2, -0.2);
        } else {
          // Both palms pressing down on the ledge while pulling up.
          const y = -0.28 - u * 0.3;
          l = pose(-0.24, y, -0.55 + u * 0.15, -0.85, -0.15, 0);
          r = pose(0.24, y, -0.55 + u * 0.15, -0.85, 0.15, 0);
        }
        break;
      }
    }
    this.left.setTarget(l);
    this.right.setTarget(r);
    const k = 1 - Math.exp(-(player.state === 'climb' ? 26 : 14) * dt);
    this.left.update(k);
    this.right.update(k);

    // --- Legs ------------------------------------------------------------------
    const showLegs = player.state === 'slide' || pitch < -0.5 || (player.crouched && pitch < -0.2);
    this.legsVisible += ((showLegs ? 1 : 0) - this.legsVisible) * (1 - Math.exp(-12 * dt));
    this.legs.visible = this.legsVisible > 0.02;
    if (!this.legs.visible) return;

    this.legs.position.copy(renderPos);
    this.legs.rotation.set(0, yaw, 0);
    const hipY = player.crouched ? 0.45 : 0.95;
    this.pelvis.position.set(0, hipY, 0.08);

    if (player.state === 'slide') {
      // Lead leg straight forward, trailing leg tucked.
      this.legL.hip.rotation.set(1.45, 0, 0.05);
      this.legL.knee.rotation.set(-0.1, 0, 0);
      this.legR.hip.rotation.set(1.0, 0, -0.1);
      this.legR.knee.rotation.set(-1.6, 0, 0);
      this.pelvis.position.set(0, 0.32, 0.05);
    } else if (player.crouched) {
      this.legL.hip.rotation.set(1.2, 0, 0);
      this.legL.knee.rotation.set(-1.9, 0, 0);
      this.legR.hip.rotation.set(1.0, 0, 0);
      this.legR.knee.rotation.set(-1.8, 0, 0);
    } else if (!player.grounded) {
      this.legL.hip.rotation.set(0.6, 0, 0);
      this.legL.knee.rotation.set(-0.9, 0, 0);
      this.legR.hip.rotation.set(0.2, 0, 0);
      this.legR.knee.rotation.set(-0.5, 0, 0);
    } else {
      const amp = Math.min(1, speed / 9) * 0.75;
      this.legL.hip.rotation.set(s * amp, 0, 0);
      this.legR.hip.rotation.set(-s * amp, 0, 0);
      this.legL.knee.rotation.set(-Math.max(0, -s) * amp * 1.4, 0, 0);
      this.legR.knee.rotation.set(-Math.max(0, s) * amp * 1.4, 0, 0);
    }
  }
}
