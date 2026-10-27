import * as THREE from 'three';
import { CollisionWorld } from './CollisionWorld';
import { makeWindowTexture } from './WindowTexture';

// ---------------------------------------------------------------------------
// Level data types
// ---------------------------------------------------------------------------

export interface Checkpoint {
  index: number;
  pos: THREE.Vector3;   // feet position
  radius: number;
  yMin: number;
  yMax: number;
  marker: THREE.Mesh;
  hit: boolean;
}

export interface HintZone {
  pos: THREE.Vector3;
  radius: number;
  text: string;
  used: boolean;
}

export interface FinishZone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  yMin: number;
}

// ---------------------------------------------------------------------------
// Level: one continuous rooftop route along +X, six sections, ~200 m.
// Red objects mark the intended route (Runner Vision).
// ---------------------------------------------------------------------------

export class Level {
  readonly group = new THREE.Group();
  readonly spawn = new THREE.Vector3(-9, 0, 0);
  readonly spawnYaw = -Math.PI / 2; // face +X
  readonly checkpoints: Checkpoint[] = [];
  readonly hints: HintZone[] = [];
  readonly finish: FinishZone = { x0: 209, x1: 211, z0: -4, z1: 4, yMin: -12 };

  private readonly animated: { obj: THREE.Object3D; spin: number }[] = [];
  private readonly mats: {
    roof: THREE.Material; side: THREE.Material; sideDark: THREE.Material; concrete: THREE.Material;
    gray: THREE.Material; metal: THREE.Material; red: THREE.Material; redBright: THREE.Material;
    glass: THREE.Material;
  } = {} as never;

  constructor(private readonly scene: THREE.Scene, private readonly collision: CollisionWorld) {
    this.buildMaterials();
    this.build();
    scene.add(this.group);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of Object.values(this.mats)) {
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
    this.collision.clear();
  }

  resetRun(): void {
    for (const c of this.checkpoints) {
      c.hit = false;
      (c.marker.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15;
    }
    for (const h of this.hints) h.used = false;
  }

  update(dt: number): void {
    for (const a of this.animated) a.obj.rotation.y += a.spin * dt;
  }

  // -------------------------------------------------------------------------
  // Materials
  // -------------------------------------------------------------------------

  private buildMaterials(): void {
    const windows = makeWindowTexture();
    this.mats.roof = new THREE.MeshStandardMaterial({ color: 0xf5f6f7, roughness: 0.92 });
    this.mats.side = new THREE.MeshStandardMaterial({ map: windows, roughness: 0.85 });
    this.mats.sideDark = new THREE.MeshStandardMaterial({ color: 0x6c7681, roughness: 0.9 });
    this.mats.concrete = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.95 });
    this.mats.gray = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.85 });
    this.mats.metal = new THREE.MeshStandardMaterial({ color: 0x8f979f, roughness: 0.45, metalness: 0.6 });
    this.mats.red = new THREE.MeshStandardMaterial({ color: 0xe0242b, roughness: 0.5 });
    this.mats.redBright = new THREE.MeshStandardMaterial({
      color: 0xff2e35, roughness: 0.4, emissive: 0xaa0d12, emissiveIntensity: 0.35
    });
    this.mats.glass = new THREE.MeshStandardMaterial({
      color: 0x9cc4e4, roughness: 0.12, metalness: 0.75, envMapIntensity: 1.1
    });
  }
  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  /** A full building with a walkable rooftop. Adds one collider. */
  private building(
    cx: number, cz: number, w: number, d: number, topY: number,
    depth = 28, style: 'concrete' | 'glass' = 'concrete'
  ): void {
    const sideMat = style === 'glass' ? this.mats.glass : this.mats.side;
    const bodyMats = [sideMat, sideMat, this.mats.roof, this.mats.sideDark, sideMat, sideMat];
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, depth, d), bodyMats);
    body.position.set(cx, topY - depth / 2, cz);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Thin roof slab for a visible ledge lip.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), this.mats.roof);
    slab.position.set(cx, topY - 0.175, cz);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.group.add(slab);

    this.collision.addMinMax(cx - w / 2, topY - depth, cz - d / 2, cx + w / 2, topY, cz + d / 2);
  }

  /** Freestanding box (walls, obstacles). */
  private block(cx: number, cy: number, cz: number, w: number, h: number, d: number,
    mat: THREE.Material | THREE.Material[], collide = true, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    this.group.add(mesh);
    if (collide) this.collision.addBox(mesh.position, new THREE.Vector3(w, h, d));
    return mesh;
  }

  /** Red marker plate flush with a rooftop edge (visual route guidance). */
  private edgeMarker(x: number, topY: number, z0: number, z1: number): void {
    const len = Math.abs(z1 - z0);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, len), this.mats.redBright);
    plate.position.set(x, topY + 0.03, (z0 + z1) / 2);
    plate.receiveShadow = true;
    this.group.add(plate);
  }

  /** Slide-under ventilation duct: passable gap underneath, red for visibility. */
  private vent(x: number, roofY: number, zSpan: number): void {
    // Duct body — collider with a 1.0 m gap below.
    this.block(x, roofY + 1.65, 0, 2.2, 1.3, zSpan, this.mats.red);
    // Legs (decorative, no collision)
    for (const zs of [-zSpan / 2 + 0.4, zSpan / 2 - 0.4]) {
      for (const xs of [-0.8, 0.8]) {
        this.block(x + xs, roofY + 0.5, zs, 0.16, 1.0, 0.16, this.mats.metal, false);
      }
    }
  }

  /** Gray AC unit — vaultable obstacle. */
  private acUnit(x: number, roofY: number, z: number, rot = 0): void {
    const unit = this.block(x, roofY + 0.55, z, 1.6, 1.1, 1.3, this.mats.gray);
    unit.rotation.y = rot;
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 16), this.mats.metal);
    fan.position.set(x, roofY + 1.14, z);
    fan.castShadow = true;
    this.group.add(fan);
  }

  /** Red door on a small utility structure. */
  private door(x: number, roofY: number, z: number): void {
    this.block(x, roofY + 1.25, z, 2.6, 2.5, 2.0, this.mats.concrete);
    this.block(x + 1.32, roofY + 1.1, z, 0.12, 2.2, 1.1, this.mats.red, false);
  }

  /** Red pipe running along a rooftop edge (decorative). */
  private pipe(x0: number, x1: number, y: number, z: number): void {
    const len = Math.abs(x1 - x0);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 10), this.mats.red);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set((x0 + x1) / 2, y, z);
    pipe.castShadow = true;
    this.group.add(pipe);
  }

  /** Rooftop railing (decorative, never blocks the route). */
  private railing(x0: number, x1: number, y: number, z: number): void {
    const len = Math.abs(x1 - x0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), this.mats.metal);
    bar.position.set((x0 + x1) / 2, y + 1.0, z);
    this.group.add(bar);
    for (let x = x0; x <= x1; x += 2) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), this.mats.metal);
      post.position.set(x, y + 0.5, z);
      post.castShadow = true;
      this.group.add(post);
    }
  }

  private antenna(x: number, roofY: number, z: number, h: number): void {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 8), this.mats.metal);
    mast.position.set(x, roofY + h / 2, z);
    mast.castShadow = true;
    this.group.add(mast);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), this.mats.redBright);
    tip.position.set(x, roofY + h + 0.12, z);
    this.group.add(tip);
    this.animated.push({ obj: tip, spin: 0.8 });
  }

  /** Checkpoint marker: red pad + spinning red cube on a post. */
  private checkpointMarker(x: number, roofY: number, z: number, index: number): void {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.06, 24), this.mats.redBright);
    pad.position.set(x, roofY + 0.03, z);
    pad.receiveShadow = true;
    this.group.add(pad);

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), this.mats.metal);
    post.position.set(x + 1.6, roofY + 1.2, z);
    post.castShadow = true;
    this.group.add(post);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xff2e35, emissive: 0xaa0d12, emissiveIntensity: 0.15 })
    );
    cube.position.set(x + 1.6, roofY + 2.7, z);
    cube.castShadow = true;
    this.group.add(cube);
    this.animated.push({ obj: cube, spin: 1.4 });

    this.checkpoints.push({
      index,
      pos: new THREE.Vector3(x, roofY, z),
      radius: 4,
      yMin: roofY - 4,
      yMax: roofY + 8,
      marker: cube,
      hit: false
    });
  }

  private hint(x: number, y: number, z: number, radius: number, text: string): void {
    this.hints.push({ pos: new THREE.Vector3(x, y, z), radius, text, used: false });
  }

  private finishGate(x: number, roofY: number): void {
    // Red rug leading in.
    const rug = new THREE.Mesh(new THREE.BoxGeometry(6, 0.05, 8), this.mats.redBright);
    rug.position.set(x - 4, roofY + 0.03, 0);
    rug.receiveShadow = true;
    this.group.add(rug);

    // Pillars + banner.
    for (const zs of [-3.5, 3.5]) {
      this.block(x, roofY + 2.5, zs, 0.6, 5.0, 0.6, this.mats.red, false);
    }
    this.block(x, roofY + 5.2, 0, 0.7, 0.9, 7.6, this.mats.red, false);
  }

  // -------------------------------------------------------------------------
  // The level itself
  // -------------------------------------------------------------------------

  private build(): void {
    // === Section 1 — Movement tutorial =====================================
    this.building(0, 0, 26, 24, 0);            // A  (x -13..13)
    this.building(23.5, 0, 14, 20, 0);         // A2 (x 16.5..30.5)
    this.door(-11, 0, -9.5);
    this.pipe(-12.5, 12.5, 0.9, 11.4);         // red pipe along the north edge
    this.railing(-12, 12, 0, -11.4);
    this.antenna(-3, 0, -10.5, 5);

    this.block(3, 0.5, 0, 1.4, 1.0, 1.6, this.mats.red); // vault box
    this.hint(-9, 0, 0, 7, 'WASD — move · hold SHIFT — sprint');
    this.hint(-1, 0, 0, 5, 'SPACE — jump · press E at red boxes to vault');

    this.vent(24, 0, 12);
    this.vent(27.5, 0, 12);
    this.hint(20, 0, 0, 5, 'Hold C or CTRL — slide under the vents');
    this.checkpointMarker(29, 0, 0, 1);

    // === Section 2 — Rooftop jumps =========================================
    this.building(43, 0, 12, 16, -1);          // B1 (x 37..49)
    this.building(61, 3, 12, 16, -2);          // B2 (x 55..67, z -5..11)
    this.building(79, -2, 12, 18, -3);         // B3 (x 73..85, z -11..7)
    this.acUnit(40, -1, 5);
    this.acUnit(45, -1, -4);
    this.antenna(58, -2, 9, 4);
    this.acUnit(76, -3, -8);
    this.edgeMarker(30.2, 0, -5, 5);
    this.edgeMarker(48.7, -1, -4, 4);
    this.edgeMarker(66.7, -2, 0, 9);
    this.hint(33, 0, 0, 6, 'Sprint before every gap — momentum is distance');
    this.checkpointMarker(81, -3, -2, 2);

    // === Section 3 — Sliding challenge =====================================
    this.building(101, 0, 20, 18, -3);         // C (x 91..111)
    this.vent(96, -3, 14);
    this.vent(100, -3, 14);
    this.vent(104, -3, 14);
    this.acUnit(93, -3, 6);
    this.edgeMarker(85.2, -3, -6, 2);
    this.edgeMarker(110.7, -3, -4, 4);
    this.checkpointMarker(108, -3, 0, 3);

    // === Section 4 — Wall run ==============================================
    // Too far to jump (12 m): a long red wall on the right carries the player.
    this.building(133, 0, 20, 20, -4);         // D (x 123..143)
    this.block(117, -3.75, 4.3, 14, 10.5, 0.6, this.mats.red); // wall-run wall
    this.edgeMarker(110.7, -3, -4, 3);
    this.door(139, -4, 7);
    this.hint(113, -3, 0, 9, 'Leap at the red wall and hold W — the wall run carries you across');
    this.checkpointMarker(128, -4, 0, 4);

    // === Section 5 — Combination ===========================================
    this.block(133, -3.5, 0, 1.4, 1.0, 1.6, this.mats.red); // vault
    this.block(147.5, -4.75, -4.3, 11, 10.5, 0.6, this.mats.red); // wall-run wall
    this.building(158, 0, 14, 18, -5);         // E (x 151..165)
    this.vent(157, -5, 12);
    this.acUnit(154, -5, -6.5);
    this.edgeMarker(143.2, -4, -2, 3);
    this.hint(147, -4, 0, 8, 'Vault · wall run · slide — keep the flow');
    this.checkpointMarker(162, -5, 0, 5);

    // === Section 6 — Final sprint ==========================================
    this.building(174, 0, 6, 10, -5);          // P1
    this.building(186, 0, 6, 10, -5.5);        // P2
    this.building(208, 0, 26, 26, -6);         // G (x 195..221)
    this.edgeMarker(165.2, -5, -3, 3);
    this.edgeMarker(176.7, -5, -3, 3);
    this.edgeMarker(188.7, -5.5, -3, 3);
    this.antenna(200, -6, -10, 6);
    this.acUnit(214, -6, -9);
    this.acUnit(216, -6, 9);
    this.railing(196, 220, -6, 12.4);
    this.finishGate(210, -6);
    this.hint(176, -5, 0, 6, 'Final stretch — don\'t stop!');

    // === Flanking glass towers (set dressing, real colliders) ===============
    this.building(30, -18, 14, 12, 10, 40, 'glass');
    this.building(58, -19, 13, 12, 4, 40, 'glass');
    this.building(90, 20, 14, 12, 6, 40, 'glass');
    this.building(135, -22, 16, 14, 8, 42, 'glass');
    this.building(175, 18, 13, 12, 2, 40, 'glass');
    this.building(225, 0, 18, 16, 5, 44, 'glass');
  }
}
