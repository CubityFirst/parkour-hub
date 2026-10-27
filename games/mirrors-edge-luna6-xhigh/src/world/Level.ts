import * as THREE from "three";

export interface Platform {
  x: number;
  z: number;
  width: number;
  depth: number;
  top: number;
}

export interface SolidBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  kind?: "solid" | "vault" | "wallrun";
  id?: string;
}

export interface Checkpoint {
  id: number;
  x: number;
  z: number;
  y: number;
  title: string;
}

export interface WallRunSurface {
  box: SolidBox;
  axis: "x" | "z";
}

export class Level {
  readonly platforms: Platform[] = [];
  readonly solids: SolidBox[] = [];
  readonly checkpoints: Checkpoint[] = [
    { id: 0, x: 0, z: 42, y: 0, title: "START" },
    { id: 1, x: 0, z: -41, y: 0.35, title: "ROOFTOP TRANSFER" },
    { id: 2, x: 0, z: -132, y: 0.25, title: "SERVICE ROOF" },
    { id: 3, x: 0, z: -229, y: 0.25, title: "EAST TOWER" },
    { id: 4, x: 0, z: -319, y: 0.25, title: "FINAL RUN" },
  ];
  readonly finishZ = -397;
  readonly finishX = 0;
  private readonly sharedBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f5f3,
    roughness: 0.88,
    metalness: 0.02,
  });
  private readonly roofEdgeMaterial = new THREE.MeshStandardMaterial({
    color: 0xaebcc3,
    roughness: 0.84,
  });
  private readonly concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0xd5dfe2,
    roughness: 0.82,
  });
  private readonly glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x7ca9c1,
    roughness: 0.32,
    metalness: 0.45,
  });
  private readonly redMaterial = new THREE.MeshStandardMaterial({
    color: 0xf32832,
    roughness: 0.48,
    metalness: 0.04,
    emissive: 0x4c080c,
  });
  private readonly signalMaterial = new THREE.MeshStandardMaterial({
    color: 0xff343c,
    roughness: 0.35,
    emissive: 0x9c1018,
    emissiveIntensity: 0.7,
  });
  private readonly darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x394b58,
    roughness: 0.62,
  });  

  constructor(private readonly scene: THREE.Scene) {
    this.buildCourse();
    this.buildSkyline();
    this.buildSunDetails();
  }

  private addPlatform(x: number, z: number, width: number, depth: number, top: number, detail = true): Platform {
    const platform = { x, z, width, depth, top };
    this.platforms.push(platform);
    const thickness = 0.5;
    const slab = new THREE.Mesh(this.sharedBox, this.roofMaterial);
    slab.scale.set(width, thickness, depth);
    slab.position.set(x, top - thickness / 2, z);
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.scene.add(slab);
    const inset = new THREE.Mesh(this.sharedBox, this.roofEdgeMaterial);
    inset.scale.set(width + 0.04, 0.08, depth + 0.04);
    inset.position.set(x, top - 0.06, z);
    this.scene.add(inset);
    const surface = new THREE.Mesh(this.sharedBox, this.roofMaterial);
    surface.scale.set(width, 0.04, depth);
    surface.position.set(x, top + 0.005, z);
    surface.receiveShadow = true;
    this.scene.add(surface);

    if (detail) {
      const seamMaterial = new THREE.MeshStandardMaterial({ color: 0xdce4e5, roughness: 0.94 });
      const lineCount = Math.min(8, Math.floor(depth / 10));
      for (let i = 1; i <= lineCount; i++) {
        const line = new THREE.Mesh(this.sharedBox, seamMaterial);
        line.scale.set(width - 0.8, 0.012, 0.035);
        line.position.set(x, top + 0.03, z - depth / 2 + (depth * i) / (lineCount + 1));
        this.scene.add(line);
      }
      for (const side of [-1, 1]) {
        const trim = new THREE.Mesh(this.sharedBox, this.concreteMaterial);
        trim.scale.set(0.24, 0.18, depth);
        trim.position.set(x + side * (width / 2 - 0.12), top + 0.04, z);
        this.scene.add(trim);
      }
    }
    return platform;
  }

  private addSolid(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    kind: SolidBox["kind"] = "solid",
    id?: string,
  ): SolidBox {
    const mesh = new THREE.Mesh(this.sharedBox, material);
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const box: SolidBox = {
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y - height / 2,
      maxY: y + height / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      kind,
      id,
    };
    this.solids.push(box);
    return box;
  }

  private addDecorativeBox(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
  ): void {
    const mesh = new THREE.Mesh(this.sharedBox, material);
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addRouteArrow(z: number, x = 0, scale = 1): void {
    const shape = new THREE.Shape();
    shape.moveTo(-0.75 * scale, 0);
    shape.lineTo(0.75 * scale, 0);
    shape.lineTo(0, 1.65 * scale);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const arrow = new THREE.Mesh(geo, this.signalMaterial);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(x, 0.07, z);
    arrow.material.side = THREE.DoubleSide;
    this.scene.add(arrow);
    const stripe = new THREE.Mesh(this.sharedBox, this.redMaterial);
    stripe.scale.set(0.1 * scale, 0.025, 0.62 * scale);
    stripe.position.set(x, 0.075, z + 0.35 * scale);
    this.scene.add(stripe);
  }

  private addCheckpoint(checkpoint: Checkpoint): void {
    const beacon = new THREE.Group();
    const stem = new THREE.Mesh(this.sharedBox, this.signalMaterial);
    stem.scale.set(0.13, 2.4, 0.13);
    stem.position.y = 1.2;
    beacon.add(stem);
    const bar = new THREE.Mesh(this.sharedBox, this.signalMaterial);
    bar.scale.set(1.6, 0.12, 0.12);
    bar.position.y = 2.38;
    beacon.add(bar);
    const foot = new THREE.Mesh(this.sharedBox, this.darkMaterial);
    foot.scale.set(0.7, 0.12, 0.7);
    foot.position.y = 0.08;
    beacon.add(foot);
    beacon.position.set(checkpoint.x + 5.4, checkpoint.y, checkpoint.z);
    this.scene.add(beacon);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.035, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xff5158, emissive: 0x86161c, emissiveIntensity: 0.75 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(checkpoint.x, checkpoint.y + 0.08, checkpoint.z);
    this.scene.add(ring);
  }

  private addVent(x: number, z: number, width: number, height: number, depth: number, vaultable = false): void {
    this.addSolid(x, height / 2, z, width, height, depth, this.concreteMaterial, vaultable ? "vault" : "solid", vaultable ? "vault" : undefined);
    const cap = new THREE.Mesh(this.sharedBox, this.darkMaterial);
    cap.scale.set(width + 0.08, 0.09, depth + 0.08);
    cap.position.set(x, height + 0.04, z);
    this.scene.add(cap);
    for (let i = 0; i < 4; i++) {
      const louver = new THREE.Mesh(this.sharedBox, this.roofEdgeMaterial);
      louver.scale.set(width * 0.74, 0.025, 0.03);
      louver.position.set(x, height * 0.32 + i * 0.13, z + depth / 2 + 0.018);
      this.scene.add(louver);
    }
    if (vaultable) {
      const plate = new THREE.Mesh(this.sharedBox, this.signalMaterial);
      plate.scale.set(0.52, 0.045, 0.08);
      plate.position.set(x, height + 0.095, z - depth / 2 - 0.01);
      this.scene.add(plate);
    }
  }

  private addSlideGate(z: number): void {
    const postMaterial = this.darkMaterial;
    this.addSolid(-5.3, 1.3, z, 0.35, 2.6, 0.4, postMaterial);
    this.addSolid(5.3, 1.3, z, 0.35, 2.6, 0.4, postMaterial);
    this.addSolid(0, 1.55, z, 10.65, 0.38, 0.42, this.redMaterial);
    const warning = new THREE.Mesh(this.sharedBox, this.signalMaterial);
    warning.scale.set(0.9, 0.09, 0.08);
    warning.position.set(0, 1.31, z - 0.26);
    this.scene.add(warning);
  }

  private buildCourse(): void {
    // Tutorial roof, two small vaults, and the first clearly marked rooftop transfer.
    this.addPlatform(0, 20, 16, 60, 0);
    this.addVent(0, 28, 1.25, 0.82, 1.6, true);
    this.addVent(0, 4, 1.45, 0.92, 1.5, true);
    this.addDecorativeBox(-6.3, 0.6, 20, 0.18, 1.2, 4, this.signalMaterial);
    this.addRouteArrow(0);
    this.addRouteArrow(-6, 0, 0.8);
    this.addRouteArrow(-9, 0, 0.8);

    // Long jumps between office roofs.
    this.addPlatform(0, -32, 13, 34, 0.35);
    this.addRouteArrow(-16);
    this.addRouteArrow(-19, 0, 0.85);
    this.addDecorativeBox(-5.4, 0.62, -41, 0.18, 1.25, 3.2, this.signalMaterial);
    this.addPlatform(0, -65, 13, 28, 0.6);
    this.addRouteArrow(-51);
    this.addPlatform(0, -95, 13, 28, 0.3);
    this.addRouteArrow(-81);
    this.addPlatform(0, -132, 18, 46, 0.25);
    this.addRouteArrow(-111);

    // Low service equipment and mandatory slide gates.
    this.addSlideGate(-119);
    this.addVent(-3.2, -128, 2.1, 1.08, 2.3);
    this.addVent(2.9, -139, 2.15, 1.02, 2.5);
    this.addSlideGate(-147);
    this.addRouteArrow(-151, 0, 0.9);

    // Long wall-run transfer: the clean red panel faces the approach lane.
    const wall = this.addSolid(4.55, 2.25, -164, 0.65, 4.5, 27, this.glassMaterial, "wallrun", "east-wall");
    const redPanel = new THREE.Mesh(this.sharedBox, this.signalMaterial);
    redPanel.scale.set(0.045, 3.5, 18);
    redPanel.position.set(4.205, 2.15, -164);
    this.scene.add(redPanel);
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(this.sharedBox, this.redMaterial);
      stripe.scale.set(0.05, 0.08, 1.1);
      stripe.position.set(4.18, 0.45 + i * 0.55, -155 - i * 3.1);
      this.scene.add(stripe);
    }
    void wall;
    const p6 = this.addPlatform(0, -190, 18, 36, 0.35);
    this.addRouteArrow(-174);
    this.addRouteArrow(-178, 0, 0.85);
    this.addDecorativeBox(-7, 0.85, -197, 0.15, 1.7, 4, this.signalMaterial);
    this.addPlatform(0, -228, 16, 28, 0.25);
    this.addRouteArrow(-215);
    void p6;

    // Combination roof: vault a service block, keep momentum, then hop the gap.
    this.addVent(0, -262, 1.7, 1.05, 1.75, true);
    this.addRouteArrow(-271);
    this.addPlatform(0, -271, 18, 38, 0.4);
    this.addRouteArrow(-256);
    this.addVent(0, -279, 1.8, 0.98, 1.65, true);
    this.addPlatform(0, -307, 18, 30, 0.25);
    this.addRouteArrow(-294);
    this.addPlatform(0, -341, 18, 32, 0.45);
    this.addRouteArrow(-327);
    this.addPlatform(0, -380, 20, 42, 0.3);
    this.addRouteArrow(-363);
    this.addRouteArrow(-385, 0, 0.9);

    // A few white rooftop machines, satellite dishes, and red route fins.
    for (const [x, z] of [[-6.7, -21], [6.6, -30], [-6.5, -63], [6.4, -93], [-7.5, -184], [7.6, -224], [-7.6, -305], [7.7, -345]] as number[][]) {
      this.addDecorativeBox(x, 0.42, z, 1.45, 0.8, 1.3, this.concreteMaterial);
      this.addDecorativeBox(x, 0.86, z, 1.18, 0.08, 1.05, this.darkMaterial);
    }

    for (const checkpoint of this.checkpoints.slice(1)) {
      this.addCheckpoint(checkpoint);
    }

    this.buildStartArch();
    this.buildFinishGate();
    this.buildConstructionCrane();
  }

  private buildStartArch(): void {
    const baseZ = 44;
    this.addDecorativeBox(-6.6, 2.2, baseZ, 0.28, 4.4, 0.35, this.signalMaterial);
    this.addDecorativeBox(6.6, 2.2, baseZ, 0.28, 4.4, 0.35, this.signalMaterial);
    this.addDecorativeBox(0, 4.3, baseZ, 13.5, 0.22, 0.38, this.signalMaterial);
    this.addDecorativeBox(0, 3.45, baseZ, 5.4, 0.5, 0.08, this.darkMaterial);
    this.addDecorativeBox(0, 3.45, baseZ - 0.08, 4.8, 0.34, 0.04, this.redMaterial);
  }

  private buildFinishGate(): void {
    const z = this.finishZ;
    for (const x of [-5.3, 5.3]) {
      this.addDecorativeBox(x, 3, z, 0.42, 6, 0.45, this.signalMaterial);
      this.addDecorativeBox(x, 6, z, 1.25, 0.24, 0.48, this.darkMaterial);
    }
    this.addDecorativeBox(0, 5.9, z, 10.2, 0.42, 0.5, this.signalMaterial);
    this.addDecorativeBox(0, 4.85, z, 5.6, 0.55, 0.08, this.darkMaterial);
    this.addDecorativeBox(0, 4.85, z - 0.05, 4.9, 0.35, 0.04, this.redMaterial);
    for (const x of [-2.4, 2.4]) {
      this.addDecorativeBox(x, 1.05, z, 0.08, 2.1, 0.14, this.signalMaterial);
    }
  }

  private buildConstructionCrane(): void {
    // A red crane on a neighboring tower echoes the zipline reference without obstructing play.
    const x = -24;
    const z = -165;
    this.addDecorativeBox(x, 26, z, 0.8, 52, 0.8, this.redMaterial);
    for (let y = 5; y < 50; y += 5) {
      this.addDecorativeBox(x, y, z, 5.6, 0.32, 0.34, this.redMaterial);
    }
    this.addDecorativeBox(x + 12, 48, z, 25, 0.5, 0.7, this.signalMaterial);
    this.addDecorativeBox(x + 21, 43, z, 0.22, 10, 0.24, this.signalMaterial);
  }

  private buildSunDetails(): void {
    const panels = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const panel = new THREE.Mesh(this.sharedBox, this.glassMaterial);
      panel.scale.set(1.4, 0.05, 0.7);
      panel.position.set(-5 + (i % 5) * 1.6, 0.08, -33 - Math.floor(i / 5) * 1);
      panel.rotation.y = -0.15;
      panels.add(panel);
    }
    this.scene.add(panels);
  }

  private buildSkyline(): void {
    const seed = 61421;
    let state = seed;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const colors = [0x91b6c8, 0x6f9ab0, 0xb7d0dc, 0x7898aa];
    const materials = colors.map((color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.3 }),
    );
    const buildings: THREE.InstancedMesh[] = materials.map((material) => {
      const mesh = new THREE.InstancedMesh(this.sharedBox, material, 320);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    });
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0xe4f1f4,
      roughness: 0.3,
      metalness: 0.18,
      emissive: 0x132634,
    });
    const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.07, 0.025), windowMaterial, 1800);
    windows.castShadow = false;
    windows.receiveShadow = false;
    this.scene.add(windows);
    const dummy = new THREE.Object3D();
    let counts = [0, 0, 0, 0];
    let windowCount = 0;
    const laneCenters = [-1, 1];
    for (let sideIndex = 0; sideIndex < laneCenters.length; sideIndex++) {
      const side = sideIndex === 0 ? -1 : 1;
      for (let row = 0; row < 23; row++) {
        const z = 55 - row * 21 + (random() - 0.5) * 12;
        const count = row < 5 ? 3 : 2;
        for (let col = 0; col < count; col++) {
          const width = 8 + random() * 13;
          const depth = 8 + random() * 12;
          const height = 16 + random() * 60;
          const x = side * (24 + col * (13 + random() * 5) + random() * 7);
          const index = Math.floor(random() * buildings.length);
          const mesh = buildings[index];
          const entry = counts[index]++;
          dummy.position.set(x, height / 2 - 2, z);
          dummy.scale.set(width, height, depth);
          dummy.rotation.y = (random() - 0.5) * 0.18;
          dummy.updateMatrix();
          mesh.setMatrixAt(entry, dummy.matrix);
          const floors = Math.min(16, Math.floor(height / 3.4));
          for (let floor = 1; floor < floors; floor++) {
            dummy.position.set(x, 0.3 + floor * 3.2, z + depth / 2 + 0.022);
            dummy.scale.set(width * 0.92, 1, 1);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            if (windowCount < windows.count) windows.setMatrixAt(windowCount++, dummy.matrix);
          }
        }
      }
    }
    for (const mesh of buildings) {
      mesh.count = Math.min(mesh.count, counts[buildings.indexOf(mesh)]);
      mesh.instanceMatrix.needsUpdate = true;
    }
    windows.count = windowCount;
    windows.instanceMatrix.needsUpdate = true;

    // Distant skyline towers are tall, soft blue shapes behind the closer city blocks.
    for (let i = 0; i < 18; i++) {
      const x = (i - 8.5) * 16 + (random() - 0.5) * 10;
      const z = -145 + (random() - 0.5) * 500;
      const h = 42 + random() * 82;
      const tower = new THREE.Mesh(
        this.sharedBox,
        new THREE.MeshStandardMaterial({
          color: i % 3 === 0 ? 0x96b9cb : 0x75a1b7,
          roughness: 0.28,
          metalness: 0.38,
        }),
      );
      tower.scale.set(8 + random() * 10, h, 9 + random() * 9);
      tower.position.set(x, h / 2 - 3, z);
      tower.castShadow = false;
      tower.receiveShadow = true;
      this.scene.add(tower);
    }
  }

  floorAt(x: number, z: number, maxTop = Infinity, radius = 0.22): Platform | undefined {
    let found: Platform | undefined;
    for (const platform of this.platforms) {
      if (
        platform.top <= maxTop + 0.015 &&
        Math.abs(x - platform.x) <= platform.width / 2 + radius &&
        Math.abs(z - platform.z) <= platform.depth / 2 + radius &&
        (!found || platform.top > found.top)
      ) {
        found = platform;
      }
    }
    return found;
  }

  checkpointAt(x: number, z: number): Checkpoint | undefined {
    return this.checkpoints.find((point) => Math.hypot(x - point.x, z - point.z) < 4.2);
  }

  findVaultTarget(x: number, z: number, forwardX: number, forwardZ: number): SolidBox | undefined {
    let nearest: SolidBox | undefined;
    let nearestDistance = Infinity;
    for (const box of this.solids) {
      if (box.kind !== "vault" || box.maxY > 1.35) continue;
      const dx = ((box.minX + box.maxX) / 2) - x;
      const dz = ((box.minZ + box.maxZ) / 2) - z;
      const forward = dx * forwardX + dz * forwardZ;
      const lateral = Math.abs(dx * forwardZ - dz * forwardX);
      const distance = Math.hypot(dx, dz);
      if (forward > 0.12 && forward < 2.5 && lateral < 1.25 && distance < nearestDistance) {
        nearest = box;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  findWallRunSurface(x: number, z: number, velocityX: number, velocityZ: number): { surface: WallRunSurface; normalX: number; normalZ: number } | undefined {
    const speedForward = Math.hypot(velocityX, velocityZ);
    if (speedForward < 4.8) return undefined;
    let best: { surface: WallRunSurface; normalX: number; normalZ: number; score: number } | undefined;
    for (const box of this.solids) {
      if (box.kind !== "wallrun") continue;
      const midZ = (box.minZ + box.maxZ) / 2;
      const widthX = box.maxX - box.minX;
      const depthZ = box.maxZ - box.minZ;
      let normalX = 0;
      let normalZ = 0;
      let distance = 100;
      let axis: "x" | "z" = "x";
      if (depthZ > widthX) {
        if (x < box.minX && x + 0.42 >= box.minX - 0.78) {
          normalX = -1;
          distance = Math.abs(box.minX - (x + 0.42));
        } else if (x > box.maxX && x - 0.42 <= box.maxX + 0.78) {
          normalX = 1;
          distance = Math.abs(x - 0.42 - box.maxX);
        }
        if (z < box.minZ - 0.8 || z > box.maxZ + 0.8) distance = 100;
        axis = "x";
      } else {
        if (z < box.minZ && z + 0.42 >= box.minZ - 0.78) {
          normalZ = -1;
          distance = Math.abs(box.minZ - (z + 0.42));
        } else if (z > box.maxZ && z - 0.42 <= box.maxZ + 0.78) {
          normalZ = 1;
          distance = Math.abs(z - 0.42 - box.maxZ);
        }
        if (x < box.minX - 0.8 || x > box.maxX + 0.8) distance = 100;
        axis = "z";
      }
      if (distance < 0 || distance > 0.82) continue;
      const alongVelocity = axis === "x" ? Math.abs(velocityZ) : Math.abs(velocityX);
      const againstWall = axis === "x" ? Math.abs(velocityX) : Math.abs(velocityZ);
      if (alongVelocity < 4.8 || alongVelocity < againstWall * 1.05) continue;
      const score = distance + Math.abs(z - midZ) * 0.0001;
      if (!best || score < best.score) {
        best = { surface: { box, axis }, normalX, normalZ, score };
      }
    }
    return best;
  }

  get redAccentMaterial(): THREE.Material {
    return this.signalMaterial;
  }
}


