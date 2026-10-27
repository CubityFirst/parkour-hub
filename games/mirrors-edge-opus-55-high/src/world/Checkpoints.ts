import * as THREE from 'three';
import { overlaps, type AABB } from './CollisionWorld';
import type { CheckpointDef, HintDef, LevelData } from './LevelLayout';

export type CheckpointEvent =
  | { type: 'checkpoint'; checkpoint: CheckpointDef; total: number }
  | { type: 'finish' }
  | { type: 'hint'; text: string | null };

/**
 * Tracks checkpoint, hint and finish trigger volumes, and renders the
 * checkpoint beacons (white when inactive, glowing red once reached).
 */
export class Checkpoints {
  readonly group = new THREE.Group();
  /** Index into data.checkpoints of the last reached checkpoint (-1 = start). */
  current = -1;
  finished = false;
  private activeHint: HintDef | null = null;
  private beacons: { light: THREE.Mesh; ring: THREE.Mesh; activatedAt: number }[] = [];
  private idleMat: THREE.MeshStandardMaterial;
  private activeMat: THREE.MeshStandardMaterial;
  private time = 0;
  private disposables: { dispose(): void }[] = [];

  constructor(private data: LevelData) {
    this.idleMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.15 });
    this.activeMat = new THREE.MeshStandardMaterial({ color: 0xff2a22, roughness: 0.4, emissive: 0xff1a12, emissiveIntensity: 1.6 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.5, metalness: 0.5 });
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.07, 2.4, 8).translate(0, 1.2, 0);
    const lightGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.5, 16).translate(0, 2.65, 0);
    const ringGeo = new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
    this.disposables.push(this.idleMat, this.activeMat, poleMat, poleGeo, lightGeo, ringGeo);
    for (const cp of data.checkpoints) {
      const g = new THREE.Group();
      g.position.set(...cp.marker);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.castShadow = true;
      const light = new THREE.Mesh(lightGeo, this.idleMat);
      const ring = new THREE.Mesh(ringGeo, this.idleMat);
      g.add(pole, light, ring);
      this.group.add(g);
      this.beacons.push({ light, ring, activatedAt: -1 });
    }
  }

  get spawnPoint(): { pos: THREE.Vector3; yaw: number } {
    if (this.current < 0) return { pos: new THREE.Vector3(...this.data.spawn), yaw: this.data.spawnYaw };
    const cp = this.data.checkpoints[this.current];
    return { pos: new THREE.Vector3(...cp.spawn), yaw: cp.yaw };
  }

  reset(): void {
    this.current = -1;
    this.finished = false;
    this.activeHint = null;
    for (const b of this.beacons) {
      b.activatedAt = -1;
      b.light.material = this.idleMat;
      b.ring.material = this.idleMat;
      b.light.scale.setScalar(1);
    }
  }

  /** Check the player's body against all trigger volumes. */
  update(dt: number, body: AABB, out: CheckpointEvent[]): void {
    this.time += dt;
    const cps = this.data.checkpoints;
    for (let i = this.current + 1; i < cps.length; i++) {
      if (overlaps(body, cps[i].trigger)) {
        this.current = i;
        const b = this.beacons[i];
        b.activatedAt = this.time;
        b.light.material = this.activeMat;
        b.ring.material = this.activeMat;
        out.push({ type: 'checkpoint', checkpoint: cps[i], total: cps.length });
      }
    }
    if (!this.finished && overlaps(body, this.data.finish)) {
      this.finished = true;
      out.push({ type: 'finish' });
    }

    let hint: HintDef | null = null;
    for (const h of this.data.hints) {
      if (overlaps(body, h.trigger)) {
        hint = h;
        break;
      }
    }
    if (hint !== this.activeHint) {
      this.activeHint = hint;
      out.push({ type: 'hint', text: hint ? hint.text : null });
    }

    // Little pop animation on freshly activated beacons.
    for (const b of this.beacons) {
      if (b.activatedAt < 0) continue;
      const t = this.time - b.activatedAt;
      const s = t < 0.6 ? 1 + Math.sin((t / 0.6) * Math.PI) * 0.5 : 1;
      b.light.scale.set(s, 1, s);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
