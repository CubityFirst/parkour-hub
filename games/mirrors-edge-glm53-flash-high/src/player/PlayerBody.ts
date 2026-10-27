import * as THREE from 'three';

/**
 * Subtle first-person body: two stylized arms that pump while sprinting
 * and reach forward during vaults/mantles. Attached to the camera.
 */
export class PlayerBody {
  readonly group = new THREE.Group();
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private vaultAnim = 0;

  private static readonly baseY = -0.26;
  private static readonly baseZ = -0.5;

  constructor(camera: THREE.PerspectiveCamera) {
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xf3f4f5, roughness: 0.85 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.7 });

    const armGeo = new THREE.BoxGeometry(0.09, 0.09, 0.4);
    const handGeo = new THREE.BoxGeometry(0.1, 0.06, 0.12);

    const buildArm = (side: number) => {
      const arm = new THREE.Mesh(armGeo, sleeve);
      arm.position.set(side * 0.27, PlayerBody.baseY, PlayerBody.baseZ);
      arm.rotation.x = 0.15;
      const hand = new THREE.Mesh(handGeo, glove);
      hand.position.set(0, -0.01, -0.25);
      arm.add(hand);
      return arm;
    };

    this.armR = buildArm(1);
    this.armL = buildArm(-1);
    this.group.add(this.armR, this.armL);
    camera.add(this.group);
  }

  /** Called when a vault / mantle starts. */
  triggerVault(): void {
    this.vaultAnim = 1;
  }

  update(dt: number, grounded: boolean, hSpeed: number, bobPhase: number): void {
    // Sprint pump — arms swing gently in opposition.
    const amp = grounded ? Math.min(hSpeed / 10, 1) : 0;
    const swing = Math.sin(bobPhase) * 0.07 * amp;
    const raise = this.vaultAnim * 0.22;

    this.armR.position.y = PlayerBody.baseY + Math.max(0, swing) + raise;
    this.armL.position.y = PlayerBody.baseY + Math.max(0, -swing) + raise;
    this.armR.position.z = PlayerBody.baseZ - this.vaultAnim * 0.1;
    this.armL.position.z = PlayerBody.baseZ - this.vaultAnim * 0.1;
    this.armR.rotation.x = 0.15 - this.vaultAnim * 0.5;
    this.armL.rotation.x = 0.15 - this.vaultAnim * 0.5;

    // Fade out of the way when idle so the view stays clean.
    const visibleTarget = amp > 0.05 || this.vaultAnim > 0.02 ? 1 : 0.35;
    this.group.scale.setScalar(this.group.scale.x + (visibleTarget - this.group.scale.x) * Math.min(1, dt * 6));

    this.vaultAnim = Math.max(0, this.vaultAnim - dt * 2.2);
  }
}
