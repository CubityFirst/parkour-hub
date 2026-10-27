import * as THREE from 'three';

export interface Checkpoint {
  index: number;
  /** Floor position of the checkpoint marker. */
  position: THREE.Vector3;
  /** Where the player is placed when respawning (feet position). */
  spawn: THREE.Vector3;
  yaw: number;
  radius: number;
  /** Half-width of the invisible activation gate across the roof. */
  halfWidth: number;
  group: THREE.Group;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  diamond: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  pulse: number;
}

const TORUS = new THREE.TorusGeometry(2.15, 0.055, 8, 48);
const DIAMOND = new THREE.OctahedronGeometry(0.34, 0);
const BEAM = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6, 1, true);

/**
 * The checkpoint markers that split the level into digestible chunks.
 * Each one is a red ring on the roof with a slowly spinning diamond above it.
 */
export class CheckpointSystem {
  readonly checkpoints: Checkpoint[] = [];
  current = 0;

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly startSpawn: THREE.Vector3,
    private readonly startYaw = Math.PI,
  ) {}

  add(index: number, x: number, y: number, z: number, yaw = Math.PI): Checkpoint {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe62820,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(TORUS, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.055;
    group.add(ring);

    const diamondMat = new THREE.MeshStandardMaterial({
      color: 0xe62a22,
      emissive: 0x6b0b07,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      metalness: 0.15,
    });
    const diamond = new THREE.Mesh(DIAMOND, diamondMat);
    diamond.position.y = 2.35;
    group.add(diamond);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xff443a,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(BEAM, beamMat);
    beam.position.y = 1.35;
    group.add(beam);

    const checkpoint: Checkpoint = {
      index,
      position: new THREE.Vector3(x, y, z),
      spawn: new THREE.Vector3(x, y + 0.02, z + 1.0),
      yaw,
      radius: 2.6,
      halfWidth: 9.5,
      group,
      ring,
      diamond,
      beam,
      active: false,
      pulse: 0,
    };
    this.checkpoints.push(checkpoint);
    this.parent.add(group);
    return checkpoint;
  }

  reset(): void {
    this.current = 0;
    for (const cp of this.checkpoints) {
      cp.active = false;
      cp.ring.material.color.setHex(0xe62820);
      cp.ring.material.opacity = 0.95;
      cp.diamond.visible = true;
      cp.diamond.scale.setScalar(1);
      cp.beam.material.opacity = 0.12;
    }
  }

  activate(index: number): Checkpoint | null {
    const cp = this.checkpoints.find((c) => c.index === index);
    if (!cp || cp.active) return null;
    cp.active = true;
    cp.pulse = 1;
    cp.ring.material.color.setHex(0xffffff);
    cp.ring.material.opacity = 0.55;
    cp.diamond.visible = false;
    cp.beam.material.opacity = 0;
    this.current = Math.max(this.current, index);
    return cp;
  }

  /** Which checkpoint (if any) the player is standing in. */
  check(x: number, y: number, z: number): Checkpoint | null {
    for (const cp of this.checkpoints) {
      if (Math.abs(y - cp.position.y) > 4) continue;
      // Wide enough to catch any lane across a roof, but still anchored to the
      // marker's z position so it reads as a gate.
      if (Math.abs(z - cp.position.z) <= 2.4 && Math.abs(x - cp.position.x) <= cp.halfWidth) {
        if (!cp.active) return cp;
      }
    }
    return null;
  }

  get spawnPosition(): THREE.Vector3 {
    if (this.current === 0) return this.startSpawn;
    const cp = this.checkpoints.find((c) => c.index === this.current);
    return cp ? cp.spawn : this.startSpawn;
  }

  get spawnYaw(): number {
    if (this.current === 0) return this.startYaw;
    const cp = this.checkpoints.find((c) => c.index === this.current);
    return cp ? cp.yaw : this.startYaw;
  }

  get count(): number {
    return this.checkpoints.length;
  }

  update(dt: number, elapsed: number): void {
    for (const cp of this.checkpoints) {
      cp.pulse = Math.max(0, cp.pulse - dt * 1.6);
      const boost = 1 + cp.pulse * 0.3;
      if (cp.diamond.visible) {
        cp.diamond.rotation.y += dt * 1.4;
        cp.diamond.position.y = 2.35 + Math.sin(elapsed * 1.8 + cp.index) * 0.14;
        cp.diamond.scale.setScalar(boost);
      }
      cp.ring.material.opacity = cp.active
        ? 0.4 + Math.sin(elapsed * 2 + cp.index) * 0.1
        : 0.8 + Math.sin(elapsed * 2.4 + cp.index) * 0.15;
      cp.beam.material.opacity = cp.active ? 0 : 0.1 + Math.sin(elapsed * 2.2) * 0.03;
    }
  }
}
