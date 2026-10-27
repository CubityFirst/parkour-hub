import * as THREE from 'three';

export interface BodyAnimState {
  bobPhase: number;
  sprinting: boolean;
  sliding: boolean;
  wallrunSide: number;
  vaultT: number; // -1 or 0..1
  mantleT: number; // -1 or 0..1
  hspeed: number;
  motionScale: number;
  grounded: boolean;
}

/**
 * Stylized first-person hands (white sleeve + red glove) parented to the camera.
 * Procedurally posed: sprint swing, slide spread, wallrun reach, vault raise.
 */
export class PlayerBody {
  private group = new THREE.Group();
  private handL: THREE.Group;
  private handR: THREE.Group;

  constructor(camera: THREE.Camera) {
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xf2f3f5 });
    const gloveMat = new THREE.MeshLambertMaterial({ color: 0xd8262c, emissive: 0x380a0c });

    const build = (side: number): THREE.Group => {
      const g = new THREE.Group();
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.26), sleeveMat);
      sleeve.position.z = 0.08;
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.14), gloveMat);
      glove.position.z = -0.12;
      g.add(sleeve, glove);
      g.scale.setScalar(0.6);
      g.position.set(0.29 * side, -0.26, -0.5);
      g.rotation.set(0.15, -0.12 * side, 0);
      g.traverse((o) => {
        o.frustumCulled = false;
      });
      return g;
    };

    this.handL = build(-1);
    this.handR = build(1);
    this.group.add(this.handL, this.handR);
    camera.add(this.group);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  update(dt: number, s: BodyAnimState): void {
    const ms = s.motionScale;
    const swing = Math.sin(s.bobPhase) * (s.sprinting ? 0.055 : 0.018) * ms;
    const lift = Math.abs(Math.cos(s.bobPhase)) * 0.012 * ms;

    const target = {
      l: { x: -0.29, y: -0.26 + lift, z: -0.5 - swing, rx: 0.15 },
      r: { x: 0.29, y: -0.26 + lift, z: -0.5 + swing, rx: 0.15 },
    };

    if (s.sliding) {
      target.l.x = -0.38;
      target.r.x = 0.38;
      target.l.y = target.r.y = -0.21;
      target.l.z = target.r.z = -0.42;
      target.l.rx = target.r.rx = 0.3;
    }
    if (s.wallrunSide !== 0) {
      const h = s.wallrunSide > 0 ? target.r : target.l;
      h.x += 0.15 * s.wallrunSide;
      h.z = -0.58;
      h.rx = -0.5;
    }
    const vk = s.vaultT >= 0 ? Math.sin(s.vaultT * Math.PI) : 0;
    const mk = s.mantleT >= 0 ? Math.sin(Math.min(1, s.mantleT) * Math.PI) : 0;
    const raise = Math.max(vk, mk);
    if (raise > 0) {
      target.l.y += raise * 0.24;
      target.r.y += raise * 0.24;
      target.l.z = target.r.z = -0.55;
      target.l.rx = target.r.rx = -0.9 * raise;
    }

    const k = Math.min(1, 14 * dt);
    const pairs: Array<[THREE.Group, { x: number; y: number; z: number; rx: number }]> = [
      [this.handL, target.l],
      [this.handR, target.r],
    ];
    for (const [hand, t] of pairs) {
      hand.position.x += (t.x - hand.position.x) * k;
      hand.position.y += (t.y - hand.position.y) * k;
      hand.position.z += (t.z - hand.position.z) * k;
      hand.rotation.x += (t.rx - hand.rotation.x) * k;
    }
  }
}
