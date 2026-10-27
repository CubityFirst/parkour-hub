import * as THREE from 'three';
import { CheckpointSystem } from './Checkpoints';
import { CollisionWorld } from './CollisionWorld';
import type { Materials } from './Materials';

export interface HintZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  text: string;
  shown: boolean;
}

export interface SectionZone {
  minZ: number;
  maxZ: number;
  label: string;
  shown: boolean;
}

interface PlatformOptions {
  facade?: 'glass' | 'office' | 'apartment' | 'none';
  thickness?: number;
  tag?: 'roof' | 'obstacle';
}

const CITY_BASE = -52;

/**
 * Hand-built rooftop course.  The level progresses along +Z.
 *
 *  01  Warm up         start roof, vault, slide, first gap
 *  02  Rooftop jumps   five rooftops with increasing gaps
 *  03  Vent run        three low ducts that must be slid under
 *  04  Wall run        a 14 m gap crossed on a red wall
 *  05  The line        vault + gap + wall run combo
 *  06  Final sprint    a last chain of gaps and the finish gate
 */
export class Level {
  readonly group = new THREE.Group();
  readonly collision = new CollisionWorld();
  readonly checkpoints: CheckpointSystem;
  readonly start = new THREE.Vector3(0, 0.01, -9);
  readonly startYaw = Math.PI;
  readonly hints: HintZone[] = [];
  readonly sections: SectionZone[] = [];

  finishMinX = -11.8;
  finishMaxX = 11.8;
  finishMinZ = 287.8;
  finishMaxZ = 300;
  finishY = -1.8;
  finishZ = 287.4;

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitPlane = new THREE.PlaneGeometry(1, 1);
  private readonly cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  private readonly fanGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20);
  private readonly flagGeometry = new THREE.BufferGeometry();

  private readonly flagMaterial = new THREE.MeshStandardMaterial({
    color: 0xd31f1a,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });

  private readonly roofs: Array<{
    x0: number;
    x1: number;
    z0: number;
    z1: number;
    y: number;
  }> = [];

  constructor(
    scene: THREE.Scene,
    private readonly materials: Materials,
  ) {
    this.group.name = 'level';
    scene.add(this.group);

    const flagVerts = new Float32Array([
      0, 0, 0,
      0, 0.85, 0,
      1.15, 0.42, 0,
    ]);
    this.flagGeometry.setAttribute('position', new THREE.BufferAttribute(flagVerts, 3));
    this.flagGeometry.computeVertexNormals();

    this.checkpoints = new CheckpointSystem(
      this.group,
      this.start.clone(),
      this.startYaw,
    );

    this.build();
  }

  private build(): void {
    // ---------------------------------------------------------------- section 1
    this.platform(-12, 12, -15, 10, 0, { facade: 'office' });
    this.curbs(-12, 12, -15, 10, 0, ['minX', 'maxX', 'minZ']);
    this.railingZ(-11.75, -14.6, 9.6, 0);
    this.railingZ(11.75, -14.6, 9.6, 0);
    this.railingX(-11.7, 11.7, -14.7, 0);
    this.startSign();

    this.vaultBarrier(-0.5, -2.8, 0, 3.6);
    this.duct(0, 3.6, 0, 7.5, 1.08, 1.5);
    this.edgeStripe(-5.5, 5.5, 9.8, 0);

    // A little life on the start roof.
    this.acUnit(-8.6, -1.0, 0, 0.2);
    this.acUnit(8.6, 1.5, 0, -0.3);
    this.acUnit(8.7, 6.4, 0, 0.45);
    this.acUnit(-8.8, 8.3, 0, -0.2);
    this.pipeVertical(-10.9, 0, 7.4, 2.2);
    this.pipeVertical(10.9, 0, 4.0, 2.2);
    this.doorHut(9.4, -12.4, 0, Math.PI);
    this.antenna(-9.8, -13.6, 0, 6.5);
    this.chevron(0, 6.2, 0, 1);
    this.chevron(0, 7.6, 0, 1);

    // ---------------------------------------------------------------- section 2
    this.platform(-10, 6, 13.5, 26, 0, { facade: 'glass' });
    this.curbs(-10, 6, 13.5, 26, 0, ['minX', 'maxX']);
    this.acUnit(-7.8, 17.5, 0, 0.1);
    this.acUnit(-7.8, 21.5, 0, Math.PI);
    this.pipeHorizontal(-9.4, 15.5, 24.5, 0.7);
    this.edgeStripe(-8, 4, 25.8, 0);
    this.chevron(-2, 23.8, 0, 1);

    this.platform(-4, 12, 31, 42, 0.9, { facade: 'office' });
    this.curbs(-4, 12, 31, 42, 0.9, ['maxX']);
    this.acUnit(9.2, 35.8, 0.9, 0.05);
    this.doorHut(9.8, 39.5, 0.9, Math.PI / 2);
    this.edgeStripe(-2, 10, 41.7, 0.9);
    this.chevron(4, 39.6, 0.9, 1);
    this.pipeVertical(-3.4, 0.9, 33.2, 1.8);

    this.platform(-12, 4, 47.5, 59, 0.2, { facade: 'glass' });
    this.curbs(-12, 4, 47.5, 59, 0.2, ['minX']);
    this.acUnit(-9.5, 51.5, 0.2, 0);
    this.pipeHorizontal(-11.2, 49.2, 57.5, 0.7);
    this.edgeStripe(-10, 2, 58.6, 0.2);
    this.chevron(-5, 56.3, 0.2, 1);

    this.platform(-8, 8, 64, 76, -0.6, { facade: 'office' });
    this.curbs(-8, 8, 64, 76, -0.6, ['minX', 'maxX']);
    this.acUnit(6.2, 67.4, -0.6, 0);
    this.doorHut(5.6, 73.6, -0.6, 0);
    this.antenna(7.3, 74.2, -0.6, 5.2);
    this.edgeStripe(-4, 4, 75.7, -0.6);
    this.chevron(0, 73.2, -0.6, 1);
    this.checkpoints.add(1, -1.5, -0.6, 70.8);

    // ---------------------------------------------------------------- section 3
    this.platform(-10, 10, 80.5, 112, -0.6, { facade: 'glass' });
    this.curbs(-10, 10, 80.5, 112, -0.6, ['minX', 'maxX']);
    this.duct(0, 88.5, -0.6, 20, 1.06, 1.7);
    this.duct(0, 97.5, -0.6, 20, 1.06, 1.7);
    this.duct(0, 106.5, -0.6, 20, 1.06, 1.7);
    this.edgeStripe(-8, 8, 111.6, -0.6);
    this.chevron(0, 84.5, -0.6, 1);
    this.chevron(0, 93.4, -0.6, 1);
    this.chevron(0, 102.4, -0.6, 1);
    this.pipeHorizontal(9.3, 84, 100, 0.4);
    this.acUnit(-8.4, 84.5, -0.6, 0.3);
    this.checkpoints.add(2, 0, -0.6, 109.6);

    // ---------------------------------------------------------------- section 4
    this.platform(-10, 8, 116, 130, -0.6, { facade: 'office' });
    this.curbs(-10, 8, 116, 130, -0.6, ['maxX']);
    this.acUnit(5.2, 119.2, -0.6, 0);
    this.edgeStripe(-9, -1.6, 129.7, -0.6);
    this.chevron(-5.2, 125.4, -0.6, 1);
    this.checkpoints.add(3, -5, -0.6, 125.5);

    // The signature red wall-run panel.  Its face is at x = -9.95, so the
    // player should hug the left edge of the roof and leap into it.
    this.wallRunPanel(-9.95, 127.2, 146.0, -0.6, 6.9, 1);
    this.chevron(-8.6, 120.5, -0.6, 1);
    this.chevron(-8.6, 123.0, -0.6, 1);

    this.platform(-10, 4, 144, 158, -1.2, { facade: 'glass' });
    this.curbs(-10, 4, 144, 158, -1.2, ['maxX']);
    this.acUnit(0.8, 151.6, -1.2, 0.4);
    this.antenna(2.7, 155.8, -1.2, 4.7);
    this.edgeStripe(-8, 2, 157.7, -1.2);
    this.chevron(-4, 155.2, -1.2, 1);

    // ---------------------------------------------------------------- section 5
    this.platform(-8, 6, 163, 178, -1.2, { facade: 'office' });
    this.curbs(-8, 6, 163, 178, -1.2, ['minX', 'maxX']);
    this.duct(0, 167.0, -1.2, 14, 1.06, 1.5);
    this.vaultBarrier(-1.0, 172.2, -1.2, 4.4);
    this.chevron(-1, 169.9, -1.2, 1);
    this.edgeStripe(-6, 4, 177.6, -1.2);
    this.acUnit(4.4, 164.6, -1.2, 0);
    this.doorHut(-6.2, 175.8, -1.2, 0);

    this.platform(-4, 10, 184, 195, -1.4, { facade: 'glass' });
    this.curbs(-4, 10, 184, 195, -1.4, ['minX']);
    this.edgeStripe(8.2, 9.8, 194.7, -1.4);
    this.chevron(7.2, 190.4, -1.4, 1);
    this.chevron(7.2, 192.6, -1.4, 1);
    this.acUnit(-3.2, 192.4, -1.4, 0.2);
    this.pipeVertical(9.5, -1.4, 185.2, 1.6);

    // Second wall-run panel, on the other side this time.
    this.wallRunPanel(10.0, 191.8, 209.4, -1.4, 6.6, -1);

    this.platform(-8, 10, 208, 220, -1.8, { facade: 'office' });
    this.curbs(-8, 10, 208, 220, -1.8, ['minX']);
    this.doorHut(-6.4, 218.0, -1.8, 0);
    this.acUnit(-6.0, 211.5, -1.8, 0.1);
    this.edgeStripe(-6, 8, 219.6, -1.8);
    this.checkpoints.add(4, 0, -1.8, 214.6);

    // ---------------------------------------------------------------- section 6
    this.platform(-10, 6, 225, 236, -1.8, { facade: 'glass' });
    this.curbs(-10, 6, 225, 236, -1.8, ['minX']);
    this.acUnit(-7.9, 228.5, -1.8, 0);
    this.edgeStripe(-8, 4, 235.7, -1.8);
    this.chevron(-2, 232.6, -1.8, 1);
    this.flag(-9.2, -1.8, 234.4);
    this.flag(5.2, -1.8, 234.4);

    this.platform(-6, 10, 242, 252, -1.8, { facade: 'office' });
    this.curbs(-6, 10, 242, 252, -1.8, ['maxX']);
    this.acUnit(7.6, 245.8, -1.8, 0.2);
    this.edgeStripe(-4, 8, 251.7, -1.8);
    this.chevron(2, 249.1, -1.8, 1);

    this.platform(-10, 6, 258.5, 270, -1.8, { facade: 'glass' });
    this.curbs(-10, 6, 258.5, 270, -1.8, ['minX']);
    this.edgeStripe(-8, 4, 269.6, -1.8);
    this.chevron(-2, 266.2, -1.8, 1);
    this.acUnit(-7.8, 262.0, -1.8, 0.4);

    this.platform(-12, 12, 276, 295, -1.8, { facade: 'office' });
    this.curbs(-12, 12, 276, 295, -1.8, ['minX', 'maxX', 'maxZ']);
    this.railingX(-11.7, 11.7, 294.6, -1.8);
    this.edgeStripe(-9, 9, 286.0, -1.8);
    this.finishGate(0, 288.2, -1.8);
    this.flag(-10.4, -1.8, 281.5);
    this.flag(10.4, -1.8, 281.5);
    this.doorHut(-9.6, 291.8, -1.8, 0);
    this.antenna(9.4, 292.2, -1.8, 7.5);
    this.acUnit(7.6, 283.4, -1.8, 0.2);

    // ------------------------------------------------------------ route hints
    this.hint(-12, 12, -12, -7, -1, 4, 'SHIFT to sprint');
    this.hint(-12, 12, -7.5, -4.6, -1, 4, 'E to vault the red barrier');
    this.hint(-12, 12, 1.2, 5.5, -1, 4, 'C to slide under the duct');
    this.hint(-12, 12, 6.5, 9.9, -1, 4, 'SPACE to jump — keep your speed');
    this.hint(-12, 12, 18, 24, -1, 4, 'Sprint into every jump');
    this.hint(-12, 12, 81, 86, -2, 4, 'Slide under the red vents');
    this.hint(-12, 12, 120, 124.5, -2, 5, 'WALL RUN — leap into the red wall');
    this.hint(-12, 12, 164, 169, -2, 5, 'Slide, then vault the barrier');
    this.hint(-12, 12, 188, 193, -2, 5, 'WALL RUN — red wall on your left');
    this.hint(-12, 12, 221, 226, -2, 5, 'FINAL SPRINT — reach the red gate');

    this.sections.push(
      { minZ: -16, maxZ: 10, label: '01 / WARM UP', shown: false },
      { minZ: 13, maxZ: 76, label: '02 / ROOFTOP JUMPS', shown: false },
      { minZ: 80, maxZ: 112, label: '03 / VENT RUN', shown: false },
      { minZ: 116, maxZ: 158, label: '04 / WALL RUN', shown: false },
      { minZ: 163, maxZ: 220, label: '05 / THE LINE', shown: false },
      { minZ: 225, maxZ: 296, label: '06 / FINAL SPRINT', shown: false },
    );

    this.scenery();
  }

  // ------------------------------------------------------------------ helpers

  private box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material | THREE.Material[],
    castShadow = true,
    receiveShadow = true,
    parent: THREE.Object3D = this.group,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.unitBox, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    return mesh;
  }

  private platform(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    top: number,
    options: PlatformOptions = {},
  ): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const thickness = options.thickness ?? 0.8;

    const topMat = this.materials.roof(w, d);
    const sideMat = this.materials.concreteSide;

    // A plain box for the structure plus a single textured top plane keeps the
    // draw call count low (one material per platform instead of a 6-group box).
    const slab = new THREE.Mesh(this.unitBox, sideMat);
    slab.position.set(cx, top - 0.004 - thickness / 2, cz);
    slab.scale.set(w, thickness, d);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.group.add(slab);

    const surface = new THREE.Mesh(this.unitPlane, topMat);
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(cx, top, cz);
    surface.scale.set(w, d, 1);
    surface.receiveShadow = true;
    this.group.add(surface);

    this.collision.addBox(x0, top - thickness, z0, x1, top, z1, {
      tag: options.tag ?? 'roof',
    });

    const facade = options.facade ?? 'none';
    if (facade !== 'none') {
      // Stop the facade just under the roof slab.  Ending it flush with the
      // roof top would put two coplanar faces at y = top and cause z-fighting
      // (the glass grid bleeding through the roof when looking down).
      const bodyTop = top - 0.45;
      const height = bodyTop - CITY_BASE;
      const mat =
        facade === 'glass'
          ? this.materials.facade(Math.max(w, d), height)
          : facade === 'apartment'
            ? this.materials.apartment(Math.max(w, d), height)
            : this.materials.office(Math.max(w, d), height);
      const body = this.box(cx, CITY_BASE + height / 2, cz, w - 0.06, height, d - 0.06, mat);
      body.castShadow = false;
      // A darker mechanical band just under the roof edge.
      this.box(
        cx,
        top - 1.45,
        cz,
        w + 0.12,
        0.5,
        d + 0.12,
        this.materials.whiteMatte,
        false,
        true,
      );
    }

    this.roofs.push({ x0, x1, z0, z1, y: top });
  }

  /** Low 0.26 m edge curb. Players can step onto it, so it never traps them. */
  private curbs(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    edges: Array<'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  ): void {
    const h = 0.26;
    const t = 0.3;
    for (const edge of edges) {
      if (edge === 'minX' || edge === 'maxX') {
        const x = edge === 'minX' ? x0 + t / 2 : x1 - t / 2;
        const mesh = this.box(x, y + h / 2, (z0 + z1) / 2, t, h, z1 - z0, this.materials.whiteMatte);
        mesh.receiveShadow = true;
        this.collision.addBox(x - t / 2, y, z0, x + t / 2, y + h, z1, {
          tag: 'obstacle',
        });
      } else {
        const z = edge === 'minZ' ? z0 + t / 2 : z1 - t / 2;
        this.box((x0 + x1) / 2, y + h / 2, z, x1 - x0, h, t, this.materials.whiteMatte);
        this.collision.addBox(x0, y, z - t / 2, x1, y + h, z + t / 2, {
          tag: 'obstacle',
        });
      }
    }
  }

  private acUnit(x: number, z: number, y: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    this.group.add(group);

    const body = this.box(0, 0.48, 0, 1.5, 0.94, 1.05, this.materials.white, true, true, group);
    body.castShadow = true;

    const fan = new THREE.Mesh(this.fanGeometry, this.materials.metal);
    fan.position.set(0, 0.985, 0);
    fan.castShadow = false;
    group.add(fan);

    const fanHub = new THREE.Mesh(this.fanGeometry, this.materials.dark);
    fanHub.scale.setScalar(0.35);
    fanHub.position.set(0, 1.0, 0);
    fanHub.castShadow = false;
    group.add(fanHub);

    for (let i = 0; i < 3; i++) {
      const blade = this.box(0, 1.01, 0, 0.72, 0.025, 0.1, this.materials.dark, false, false, group);
      blade.rotation.y = (i / 3) * Math.PI * 2 + 0.4;
    }

    // Dark base frame grounds the unit against bright concrete.
    this.box(0, 0.035, 0, 1.62, 0.07, 1.16, this.materials.dark, false, false, group);
    this.box(0, 0.11, 0.56, 1.2, 0.22, 0.05, this.materials.dark, false, false, group);
    this.box(0.55, 0.62, 0.56, 0.05, 0.3, 0.04, this.materials.red, false, false, group);
    this.box(-0.55, 0.62, 0.56, 0.05, 0.3, 0.04, this.materials.red, false, false, group);

    const halfW = 0.75;
    const halfD = 0.52;
    // Approximate rotated footprint with an AABB (units are only decorative).
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const ex = halfW * cos + halfD * sin;
    const ez = halfW * sin + halfD * cos;
    this.collision.addBox(x - ex, y, z - ez, x + ex, y + 0.96, z + ez, {
      tag: 'obstacle',
      vaultable: true,
    });
  }

  private duct(
    x: number,
    z: number,
    floorY: number,
    width: number,
    clearance: number,
    depth: number,
  ): void {
    const bodyH = 0.75;
    const bottom = floorY + clearance;

    this.box(x, bottom + bodyH / 2, z, width, bodyH, depth, this.materials.red);
    // White warning stripe along the leading edge.
    this.box(x, bottom + 0.12, z - depth / 2 - 0.015, width, 0.1, 0.03, this.materials.white);
    this.box(x, bottom + bodyH - 0.1, z - depth / 2 - 0.015, width, 0.05, 0.03, this.materials.whiteMatte);
    // End caps.
    this.box(x - width / 2 - 0.02, bottom + bodyH / 2, z, 0.06, bodyH + 0.12, depth + 0.06, this.materials.redDark);
    this.box(x + width / 2 + 0.02, bottom + bodyH / 2, z, 0.06, bodyH + 0.12, depth + 0.06, this.materials.redDark);

    // Side legs.
    for (const sx of [-1, 1]) {
      this.box(
        x + sx * (width / 2 - 0.16),
        floorY + clearance / 2,
        z,
        0.18,
        clearance,
        depth * 0.7,
        this.materials.redDark,
      );
      this.collision.addBox(
        x + sx * (width / 2 - 0.16) - 0.09,
        floorY,
        z - (depth * 0.7) / 2,
        x + sx * (width / 2 - 0.16) + 0.09,
        floorY + clearance,
        z + (depth * 0.7) / 2,
        { tag: 'obstacle' },
      );
    }

    this.collision.addBox(
      x - width / 2,
      bottom,
      z - depth / 2,
      x + width / 2,
      bottom + bodyH,
      z + depth / 2,
      { tag: 'duct' },
    );
  }

  private vaultBarrier(x: number, z: number, floorY: number, width: number): void {
    const h = 0.98;
    this.box(x, floorY + h / 2, z, width, h, 0.62, this.materials.red);
    this.box(x, floorY + h + 0.025, z, width + 0.04, 0.05, 0.66, this.materials.white);
    this.box(x, floorY + h * 0.46, z - 0.32, width * 0.86, 0.14, 0.02, this.materials.whiteMatte);
    // Small red guide light.
    this.box(x - width / 2 + 0.18, floorY + h * 0.75, z - 0.33, 0.1, 0.1, 0.04, this.materials.redGlow);

    this.collision.addBox(x - width / 2, floorY, z - 0.31, x + width / 2, floorY + h, z + 0.31, {
      tag: 'vault',
      vaultable: true,
    });
  }

  /**
   * A long red wall-run surface. `faceX` is the side the player runs along.
   * `inward` -1 means the wall body extends towards -X.
   */
  private wallRunPanel(
    faceX: number,
    z0: number,
    z1: number,
    baseY: number,
    height: number,
    inward: 1 | -1,
  ): void {
    const thickness = 0.55;
    const centerX = faceX - inward * (thickness / 2);
    const cx = centerX;
    const cz = (z0 + z1) / 2;
    const length = z1 - z0;

    this.box(cx, baseY + height / 2, cz, thickness, height, length, this.materials.red);

    // Structural ribs.
    for (let z = z0 + 1; z < z1; z += 2.6) {
      this.box(faceX - inward * 0.04, baseY + height * 0.5, z, 0.1, height * 0.92, 0.14, this.materials.redDark);
    }

    // White top cap catches the sun and reads as an architectural element.
    this.box(faceX - inward * 0.1, baseY + height + 0.06, cz, thickness + 0.28, 0.12, length, this.materials.white);

    // Diagonal braces on the back side.
    for (let z = z0 + 2; z < z1 - 1; z += 5.2) {
      const brace = this.box(
        faceX - inward * 0.85,
        baseY + height * 0.45,
        z,
        0.16,
        0.16,
        3.2,
        this.materials.redDark,
      );
      brace.rotation.x = 0.55;
    }

    this.collision.addBox(
      Math.min(faceX, faceX - inward * thickness),
      baseY,
      z0,
      Math.max(faceX, faceX - inward * thickness),
      baseY + height,
      z1,
      { tag: 'wallrun', wallRunnable: true },
    );
  }

  private pipeVertical(x: number, floorY: number, z: number, height: number): void {
    const pipe = new THREE.Mesh(this.cylinder, this.materials.red);
    pipe.scale.set(0.11, height, 0.11);
    pipe.position.set(x, floorY + height / 2, z);
    pipe.castShadow = true;
    this.group.add(pipe);
    const cap = new THREE.Mesh(this.cylinder, this.materials.redDark);
    cap.scale.set(0.16, 0.15, 0.16);
    cap.position.set(x, floorY + height, z);
    this.group.add(cap);
    this.collision.addBox(x - 0.13, floorY, z - 0.13, x + 0.13, floorY + height, z + 0.13, {
      tag: 'obstacle',
    });
  }

  /** Horizontal pipe running along the Z axis. */
  private pipeHorizontal(x: number, z0: number, z1: number, height: number): void {
    const pipe = new THREE.Mesh(this.cylinder, this.materials.red);
    pipe.scale.set(0.1, z1 - z0, 0.1);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, height, (z0 + z1) / 2);
    pipe.castShadow = true;
    this.group.add(pipe);
    for (let z = z0; z <= z1; z += 3.5) {
      this.box(x, height - 0.26, z, 0.06, 0.42, 0.06, this.materials.metal, false, false);
    }
  }

  private chevron(x: number, z: number, floorY: number, direction: 1 | -1): void {
    const mat = this.materials.marker;
    for (const side of [-1, 1]) {
      const bar = this.box(x + side * 0.38, floorY + 0.016, z, 0.14, 0.028, 1.0, mat, false, false);
      bar.rotation.y = side * 0.52 * direction;
      bar.position.x = x + side * 0.36;
    }
  }

  /** Light metal railing running along Z at a fixed X. */
  private railingZ(x: number, z0: number, z1: number, floorY: number): void {
    const height = 1.08;
    const length = z1 - z0;
    for (let z = z0 + 0.4; z <= z1; z += 2.3) {
      this.box(x, floorY + height / 2, z, 0.055, height, 0.055, this.materials.rail, false, false);
    }
    this.box(x, floorY + height, (z0 + z1) / 2, 0.07, 0.07, length, this.materials.rail, false, false);
    this.box(x, floorY + height * 0.55, (z0 + z1) / 2, 0.05, 0.05, length, this.materials.rail, false, false);
    this.collision.addBox(x - 0.05, floorY, z0, x + 0.05, floorY + height, z1, { tag: 'railing' });
  }

  /** Light metal railing running along X at a fixed Z. */
  private railingX(x0: number, x1: number, z: number, floorY: number): void {
    const height = 1.08;
    const length = x1 - x0;
    for (let x = x0 + 0.4; x <= x1; x += 2.3) {
      this.box(x, floorY + height / 2, z, 0.055, height, 0.055, this.materials.rail, false, false);
    }
    this.box((x0 + x1) / 2, floorY + height, z, length, 0.07, 0.07, this.materials.rail, false, false);
    this.box((x0 + x1) / 2, floorY + height * 0.55, z, length, 0.05, 0.05, this.materials.rail, false, false);
    this.collision.addBox(x0, floorY, z - 0.05, x1, floorY + height, z + 0.05, { tag: 'railing' });
  }

  private edgeStripe(x0: number, x1: number, z: number, floorY: number): void {
    this.box((x0 + x1) / 2, floorY + 0.015, z, x1 - x0, 0.026, 0.22, this.materials.marker, false, false);
  }

  private doorHut(x: number, z: number, floorY: number, yaw: number): void {
    const group = new THREE.Group();
    group.position.set(x, floorY, z);
    group.rotation.y = yaw;
    this.group.add(group);

    this.box(0, 1.45, 0, 4.2, 2.9, 3.4, this.materials.white, true, true, group);
    this.box(0, 2.98, 0, 4.4, 0.16, 3.6, this.materials.concreteSide, true, true, group);
    // Red door.
    this.box(0, 1.0, -1.72, 1.3, 2.0, 0.08, this.materials.red, false, true, group);
    this.box(0.5, 1.0, -1.78, 0.07, 0.28, 0.06, this.materials.metal, false, false, group);
    // Vent slit.
    this.box(-1.4, 2.2, -1.72, 0.7, 0.24, 0.05, this.materials.dark, false, false, group);

    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const ex = 2.1 * cos + 1.7 * sin;
    const ez = 2.1 * sin + 1.7 * cos;
    this.collision.addBox(x - ex, floorY, z - ez, x + ex, floorY + 2.9, z + ez, { tag: 'obstacle' });
  }

  private antenna(x: number, z: number, floorY: number, height: number): void {
    const mast = new THREE.Mesh(this.cylinder, this.materials.metal);
    mast.scale.set(0.06, height, 0.06);
    mast.position.set(x, floorY + height / 2, z);
    mast.castShadow = true;
    this.group.add(mast);
    for (let i = 0; i < 4; i++) {
      const y = floorY + 1.2 + i * (height / 5);
      this.box(x, y, z, 0.9 - i * 0.13, 0.04, 0.04, this.materials.metal, false, false);
    }
    const light = this.box(x, floorY + height, z, 0.13, 0.13, 0.13, this.materials.marker, false, false);
    light.rotation.y = Math.PI / 4;
  }

  private flag(x: number, floorY: number, z: number): void {
    const pole = new THREE.Mesh(this.cylinder, this.materials.metal);
    pole.scale.set(0.035, 3.1, 0.035);
    pole.position.set(x, floorY + 1.55, z);
    this.group.add(pole);
    const flag = new THREE.Mesh(this.flagGeometry, this.flagMaterial);
    flag.position.set(x, floorY + 2.35, z);
    flag.castShadow = true;
    this.group.add(flag);
  }

  private finishGate(x: number, z: number, floorY: number): void {
    const pillarH = 5.4;
    for (const side of [-1, 1]) {
      this.box(x + side * 5.6, floorY + pillarH / 2, z, 0.55, pillarH, 0.55, this.materials.red);
      this.box(x + side * 5.6, floorY + 0.08, z, 1.5, 0.16, 1.5, this.materials.redDark);
      this.collision.addBox(
        x + side * 5.6 - 0.28,
        floorY,
        z - 0.28,
        x + side * 5.6 + 0.28,
        floorY + pillarH,
        z + 0.28,
        { tag: 'obstacle' },
      );
    }
    this.box(x, floorY + pillarH, z, 11.7, 0.5, 0.65, this.materials.red);
    this.box(x, floorY + pillarH - 0.28, z, 11.9, 0.1, 0.7, this.materials.white);

    const bannerMat = new THREE.MeshBasicMaterial({
      map: this.materials.finishBanner,
      side: THREE.DoubleSide,
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.4), bannerMat);
    banner.position.set(x, floorY + 3.85, z - 0.02);
    banner.rotation.y = Math.PI;
    this.group.add(banner);

    // Finish line on the roof.
    this.box(x, floorY + 0.018, z, 11.0, 0.03, 0.55, this.materials.marker, false, false);
    this.box(x, floorY + 0.02, z + 0.75, 11.0, 0.025, 0.16, this.materials.marker, false, false);

    for (const side of [-1, 1]) {
      this.flag(x + side * 5.6, floorY + pillarH, z);
    }
  }

  private startSign(): void {
    const mat = new THREE.MeshBasicMaterial({ map: this.materials.startBanner, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), mat);
    plane.position.set(-8.0, 3.4, -6.4);
    plane.rotation.y = Math.PI;
    this.group.add(plane);

    for (const side of [-1, 1]) {
      this.box(-8.0 + side * 2.5, 2.1, -6.4, 0.09, 4.2, 0.09, this.materials.metal, false, false);
    }
    this.box(-8.0, 4.15, -6.4, 5.4, 0.12, 0.12, this.materials.metal, false, false);
  }

  private hint(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    minY: number,
    maxY: number,
    text: string,
  ): void {
    this.hints.push({ minX, maxX, minZ, maxZ, minY, maxY, text, shown: false });
  }

  /** Decorative (non-colliding) distant props that frame the course. */
  private scenery(): void {
    // Red lattice tower visible from the start and section 2.
    const towerX = 20;
    const towerZ = 33;
    const towerBase = -30;
    const towerHeight = 74;
    for (const dx of [-1.5, 1.5]) {
      for (const dz of [-1.5, 1.5]) {
        const leg = this.box(
          towerX + dx,
          towerBase + towerHeight / 2,
          towerZ + dz,
          0.35,
          towerHeight,
          0.35,
          this.materials.redDark,
          false,
          false,
        );
        leg.castShadow = false;
      }
    }
    for (let y = towerBase + 6; y < towerBase + towerHeight; y += 6) {
      this.box(towerX, y, towerZ - 1.5, 3.2, 0.18, 0.18, this.materials.red, false, false);
      this.box(towerX, y, towerZ + 1.5, 3.2, 0.18, 0.18, this.materials.red, false, false);
      this.box(towerX - 1.5, y, towerZ, 0.18, 0.18, 3.2, this.materials.red, false, false);
      this.box(towerX + 1.5, y, towerZ, 0.18, 0.18, 3.2, this.materials.red, false, false);
    }
    this.box(towerX, towerBase + towerHeight + 0.4, towerZ, 1.0, 0.8, 1.0, this.materials.marker, false, false);

    // Broad glass tower with a skybridge silhouette on the far side.
    this.box(42, -6, 150, 16, 92, 16, this.materials.facade(16, 92), false, false);
    this.box(70, -14, 150, 14, 76, 14, this.materials.facade(14, 76), false, false);
    this.box(56, 12, 150, 14, 0.8, 3.0, this.materials.whiteMatte, false, false);

    // A couple of red rooftop cranes add scale.
    this.crane(30, 96, 4, 30);
    this.crane(-34, 238, -2, 40);
  }

  private crane(x: number, z: number, baseY: number, height: number): void {
    const mast = this.box(x, baseY + height / 2, z, 0.7, height, 0.7, this.materials.red, false, false);
    mast.castShadow = false;
    this.box(x + 7, baseY + height, z, 16, 0.5, 0.6, this.materials.red, false, false);
    this.box(x + 14, baseY + height - 1.7, z, 0.1, 3.4, 0.1, this.materials.redDark, false, false);
    this.box(x - 6, baseY + height + 0.6, z, 4.5, 0.9, 2.4, this.materials.whiteMatte, false, false);
  }

  // -------------------------------------------------------------------- update

  update(dt: number, elapsed: number): void {
    this.checkpoints.update(dt, elapsed);
  }
}
