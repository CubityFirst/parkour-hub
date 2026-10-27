import * as THREE from 'three';

export interface Checkpoint {
  index: number;
  /** Respawn position (feet) and view yaw. */
  pos: THREE.Vector3;
  yaw: number;
  trigger: { min: THREE.Vector3; max: THREE.Vector3 };
  flagMat: THREE.MeshLambertMaterial;
}

/**
 * Checkpoint flags planted along the route. Trigger volumes activate the
 * next checkpoint; activated flags turn red and pulse gently.
 */
export class CheckpointSystem {
  readonly list: Checkpoint[] = [];
  current = 0;

  constructor(private scene: THREE.Scene) {}

  add(pos: THREE.Vector3, yaw: number): void {
    const index = this.list.length;
    const active = index === 0;
    const flagMat = new THREE.MeshLambertMaterial({
      color: active ? 0xe02a30 : 0x9aa4ad,
      emissive: active ? 0x4a0d10 : 0x000000,
    });

    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0xdfe3e8 }),
    );
    pole.position.y = 1.5;
    pole.castShadow = true;
    const penn = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.95, 4), flagMat);
    penn.rotation.z = -Math.PI / 2;
    penn.scale.set(1, 1, 0.25);
    penn.position.set(0.5, 2.6, 0);
    group.add(pole, penn);
    group.position.set(pos.x - 2.4, pos.y, pos.z);
    this.scene.add(group);

    this.list.push({
      index,
      pos,
      yaw,
      trigger: {
        min: new THREE.Vector3(pos.x - 4.5, pos.y - 2, pos.z - 4.5),
        max: new THREE.Vector3(pos.x + 4.5, pos.y + 3, pos.z + 4.5),
      },
      flagMat,
    });
  }

  /** Returns the newly activated checkpoint, if any. */
  check(p: THREE.Vector3): Checkpoint | null {
    for (const c of this.list) {
      if (c.index <= this.current) continue;
      const t = c.trigger;
      if (
        p.x > t.min.x && p.x < t.max.x &&
        p.y > t.min.y && p.y < t.max.y &&
        p.z > t.min.z && p.z < t.max.z
      ) {
        this.current = c.index;
        c.flagMat.color.set(0xe02a30);
        return c;
      }
    }
    return null;
  }

  respawnTarget(): { pos: THREE.Vector3; yaw: number } {
    const c = this.list[this.current];
    return { pos: c.pos.clone(), yaw: c.yaw };
  }

  reset(): void {
    this.current = 0;
    for (const c of this.list) {
      if (c.index > 0) {
        c.flagMat.color.set(0x9aa4ad);
        c.flagMat.emissive.set(0x000000);
      }
    }
  }

  /** Gentle emissive pulse on activated flags. */
  update(time: number): void {
    for (const c of this.list) {
      if (c.index > this.current) continue;
      const k = 0.3 + 0.18 * Math.sin(time * 3 + c.index * 1.7);
      c.flagMat.emissive.setRGB(k, 0.05 * k, 0.06 * k);
    }
  }
}
