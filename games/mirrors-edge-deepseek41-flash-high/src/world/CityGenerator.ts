import * as THREE from 'three';
import type { Materials } from './Materials';

interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  tint: number;
}

const GROUND_Y = -52;

/**
 * Procedural skyline.  Everything here is decorative and instanced, so the
 * course feels like it sits in the middle of a much larger city.
 */
export class CityGenerator {
  readonly group = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly dummy = new THREE.Object3D();

  constructor(
    scene: THREE.Scene,
    private readonly materials: Materials,
  ) {
    this.group.name = 'city';
    scene.add(this.group);
  }

  build(): void {
    this.ground();
    this.nearBlocks();

    const glass: BuildingSpec[] = [];
    const office: BuildingSpec[] = [];
    const apartment: BuildingSpec[] = [];

    const rand = mulberry32(9137);
    const palette = [0xffffff, 0xeaf4fb, 0xdcecf6, 0xf6fbff, 0xcfe3ef];

    // Mid-distance blocks flanking the course.
    for (let i = 0; i < 96; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * (26 + rand() * 118);
      const z = -120 + rand() * 520;
      const w = 9 + rand() * 17;
      const d = 9 + rand() * 17;
      const h = 34 + rand() * 56;
      const spec: BuildingSpec = {
        x,
        z,
        w,
        d,
        h,
        rot: (rand() < 0.25 ? Math.PI / 2 : 0) + (rand() - 0.5) * 0.12,
        tint: palette[Math.floor(rand() * palette.length)],
      };
      const roll = rand();
      if (roll < 0.45) glass.push(spec);
      else if (roll < 0.8) office.push(spec);
      else apartment.push(spec);
    }

    // Distant skyline ring, big towers with hazy silhouettes.
    for (let i = 0; i < 84; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 260 + rand() * 380;
      const x = Math.sin(angle) * radius;
      const z = 40 + Math.cos(angle) * radius;
      const w = 18 + rand() * 34;
      const d = 18 + rand() * 34;
      const h = 80 + rand() * 150;
      const spec: BuildingSpec = {
        x,
        z,
        w,
        d,
        h,
        rot: rand() * Math.PI,
        tint: palette[Math.floor(rand() * palette.length)],
      };
      if (rand() < 0.55) glass.push(spec);
      else office.push(spec);
    }

    // Low mid-ground blocks so the gaps read as real drops.
    for (let i = 0; i < 54; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * (24 + rand() * 22);
      const z = -60 + rand() * 430;
      const w = 10 + rand() * 12;
      const d = 10 + rand() * 12;
      const h = 18 + rand() * 24;
      apartment.push({
        x,
        z,
        w,
        d,
        h,
        rot: 0,
        tint: 0xf2f7fa,
      });
    }

    const glassMap = this.materials.glassTexture.clone();
    glassMap.needsUpdate = true;
    glassMap.repeat.set(3, 5);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: glassMap,
      roughness: 0.2,
      metalness: 0.55,
      envMapIntensity: 1.2,
    });

    const officeMap = this.materials.officeTexture.clone();
    officeMap.needsUpdate = true;
    officeMap.repeat.set(4, 5);
    const officeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: officeMap,
      roughness: 0.55,
      metalness: 0.18,
    });

    const apartmentMap = this.materials.apartmentTexture.clone();
    apartmentMap.needsUpdate = true;
    apartmentMap.repeat.set(3, 4);
    const apartmentMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: apartmentMap,
      roughness: 0.7,
      metalness: 0.05,
    });

    this.instanced(glass, glassMat);
    this.instanced(office, officeMat);
    this.instanced(apartment, apartmentMat);
  }

  private instanced(specs: BuildingSpec[], material: THREE.MeshStandardMaterial): void {
    if (specs.length === 0) return;
    const mesh = new THREE.InstancedMesh(this.box, material, specs.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    const color = new THREE.Color();
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      this.dummy.position.set(s.x, GROUND_Y + s.h / 2, s.z);
      this.dummy.rotation.set(0, s.rot, 0);
      this.dummy.scale.set(s.w, s.h, s.d);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      color.setHex(s.tint);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
  }

  private ground(): void {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0xb8cad6, roughness: 0.95, metalness: 0 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, GROUND_Y - 0.2, 140);
    plane.receiveShadow = false;
    this.group.add(plane);
  }

  /** A handful of larger, closer towers built from the detailed materials. */
  private nearBlocks(): void {
    const specs: Array<[number, number, number, number, number, number]> = [
      [-27, -4, 20, 26, 44, 0],
      [29, 22, 18, 30, 52, 1],
      [-31, 58, 24, 22, 36, 1],
      [33, 78, 20, 24, 40, 0],
      [-28, 118, 18, 28, 46, 0],
      [31, 140, 22, 20, 38, 1],
      [-30, 182, 26, 24, 42, 1],
      [34, 200, 20, 26, 48, 0],
      [-26, 246, 18, 22, 35, 0],
      [30, 262, 24, 24, 44, 1],
    ];
    for (const [x, z, w, d, h, glass] of specs) {
      const y = GROUND_Y + h / 2;
      const mat = glass
        ? this.materials.facade(Math.max(w, d), h)
        : this.materials.office(Math.max(w, d), h);
      const mesh = new THREE.Mesh(this.box, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(w, h, d);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);

      // Simple rooftop cap.
      const cap = new THREE.Mesh(this.box, this.materials.whiteMatte);
      cap.position.set(x, y + h / 2 + 0.4, z);
      cap.scale.set(w + 1.2, 0.8, d + 1.2);
      cap.castShadow = false;
      this.group.add(cap);
    }
  }
}

/** Tiny deterministic PRNG so the skyline is stable between reloads. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
