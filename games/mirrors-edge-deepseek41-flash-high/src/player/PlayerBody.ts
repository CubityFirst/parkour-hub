import * as THREE from 'three';
import type { PlayerController } from './PlayerController';

interface ArmRig {
  group: THREE.Group;
  forearm: THREE.Mesh;
  hand: THREE.Mesh;
  side: -1 | 1;
}

/**
 * Subtle first-person body presence: stylised forearms and hands that sit in
 * the lower corners of the view.  They swing while sprinting, reach forward
 * during vaults and mantles, and press towards the wall during a wall run.
 */
export class PlayerBody {
  private readonly group = new THREE.Group();
  private readonly left: ArmRig;
  private readonly right: ArmRig;
  private time = 0;
  private reach = 0;
  private wallReach = 0;
  private hidden = true;

  constructor(camera: THREE.Camera) {
    camera.add(this.group);
    this.group.visible = false;

    const sleeve = new THREE.MeshStandardMaterial({
      color: 0x9fabb4,
      roughness: 0.82,
      metalness: 0.02,
    });
    const glove = new THREE.MeshStandardMaterial({
      color: 0x2a3034,
      roughness: 0.65,
      metalness: 0.05,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0xc99b7d,
      roughness: 0.75,
      metalness: 0.0,
    });
    const band = new THREE.MeshStandardMaterial({
      color: 0xd11f19,
      roughness: 0.6,
      metalness: 0.02,
    });

    this.left = this.buildArm(-1, sleeve, glove, skin, band);
    this.right = this.buildArm(1, sleeve, glove, skin, band);
    this.left.group.position.set(-0.42, -0.64, -0.4);
    this.right.group.position.set(0.42, -0.64, -0.4);
  }

  private buildArm(
    side: -1 | 1,
    sleeveMat: THREE.Material,
    gloveMat: THREE.Material,
    skinMat: THREE.Material,
    bandMat: THREE.Material,
  ): ArmRig {
    const group = new THREE.Group();

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.07, 0.26), sleeveMat);
    forearm.position.set(0, 0, -0.13);
    forearm.rotation.x = 0.06;
    group.add(forearm);

    // Red runner band around the wrist.
    const wristBand = new THREE.Mesh(new THREE.BoxGeometry(0.069, 0.078, 0.045), bandMat);
    wristBand.position.set(0, 0, -0.255);
    group.add(wristBand);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.056, 0.12), gloveMat);
    hand.position.set(0, -0.004, -0.32);
    hand.rotation.x = -0.1;
    group.add(hand);

    // Small exposed finger pad keeps the glove from reading as a block.
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.044, 0.042), skinMat);
    fingers.position.set(0, -0.003, -0.381);
    group.add(fingers);

    group.rotation.y = side * 0.18;
    group.rotation.z = side * 0.05;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = false;
      }
    });

    this.group.add(group);
    return { group, forearm, hand, side };
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
    this.group.visible = visible;
  }

  update(dt: number, player: PlayerController, reduceMotion: boolean): void {
    if (this.hidden) return;
    this.time += dt;

    const speed = player.speed;
    const moving = player.grounded && speed > 1;
    const sprintFactor = Math.min(Math.max((speed - 5) / 6, 0), 1);
    const swing = moving ? Math.sin(this.time * (6 + speed * 0.55)) : Math.sin(this.time * 1.2) * 0.15;
    const bob = reduceMotion ? 0 : 1;

    const vaulting = player.parkour.isVaulting;
    const mantling = player.parkour.isMantling;
    const sliding = player.sliding;
    const wallRun = player.wallRunning;

    const targetReach = vaulting ? 1 : mantling ? 0.8 : 0;
    this.reach += (targetReach - this.reach) * Math.min(1, 12 * dt);
    const targetWall = wallRun ? 1 : 0;
    this.wallReach += (targetWall - this.wallReach) * Math.min(1, 7 * dt);

    const swingAmount = reduceMotion ? 0 : 0.03 + sprintFactor * 0.04;
    const armBob = swing * swingAmount * bob;
    const lift = reduceMotion ? 0 : Math.min(0.23, speed * 0.02);

    for (const arm of [this.left, this.right]) {
      const side = arm.side;
      const phase = side === 1 ? 1 : -1;

      let x = side * (0.42 - sprintFactor * 0.02);
      let y = -0.64 + lift + armBob * phase * 0.5;
      let z = -0.4 - armBob * phase;

      // Tuck the arms away while sliding.
      if (sliding) {
        y -= 0.08;
        z += 0.04;
      }

      // Both arms punch forward over vaults and mantles.
      if (this.reach > 0.01) {
        x += (side * 0.27 - x) * this.reach;
        y += (-0.29 - y) * this.reach;
        z += (-0.48 - z) * this.reach;
      }

      // Reach the wall-side arm out toward the red panel.
      if (this.wallReach > 0.01 && side === this.wallArmSide(player)) {
        x += (side * 0.46 - x) * this.wallReach;
        y += (-0.35 - y) * this.wallReach;
        z += (-0.4 - z) * this.wallReach;
      }

      arm.group.position.set(x, y, z);
      arm.group.rotation.x = -0.04 + 0.62 * this.reach;
      arm.group.rotation.y = side * 0.18 - side * 0.5 * this.wallReach;
      arm.group.rotation.z = side * 0.05;
    }
  }

  /** The wall side in camera space: +1 is the right side of the screen. */
  private wallArmSide(player: PlayerController): -1 | 1 {
    return player.wallSide === 0 ? 1 : player.wallSide;
  }
}
