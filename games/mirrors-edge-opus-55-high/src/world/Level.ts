import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './CollisionWorld';
import { createCollisionWorld, hiddenBoxes, type BillboardDef, type LevelData, type MaterialKey } from './LevelLayout';
import type { MaterialLibrary } from './Materials';

/**
 * Turns the level layout into render meshes (merged per material to keep
 * draw calls low) and the collision world.
 */
export class Level {
  readonly data: LevelData;
  readonly collision: CollisionWorld;
  readonly group = new THREE.Group();
  private flagTime = { value: 0 };
  private disposables: { dispose(): void }[] = [];

  constructor(
    private materials: MaterialLibrary,
    data: LevelData,
  ) {
    this.data = data;
    this.collision = createCollisionWorld(this.data, new CollisionWorld());
    this.buildBoxes();
    this.buildCylinders();
    this.buildFlags();
    for (const bb of this.data.billboards) this.buildBillboard(bb);
  }

  update(time: number): void {
    this.flagTime.value = time;
  }

  private buildBoxes(): void {
    const groups = new Map<string, THREE.BufferGeometry[]>();
    for (const box of this.data.boxes) {
      if (hiddenBoxes.has(box)) continue;
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const d = box.maxZ - box.minZ;
      const geo = new THREE.BoxGeometry(w, h, d);
      geo.translate((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
      const key = `${box.mat}|${box.shadow ? 1 : 0}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(geo);
    }
    for (const [key, geos] of groups) {
      const [mat, shadow] = key.split('|');
      this.addMerged(geos, mat as MaterialKey, shadow === '1');
    }
  }

  private buildCylinders(): void {
    const groups = new Map<MaterialKey, THREE.BufferGeometry[]>();
    for (const c of this.data.cylinders) {
      const geo = new THREE.CylinderGeometry(c.radius, c.radius, c.length, 14);
      if (c.axis === 'x') geo.rotateZ(Math.PI / 2);
      if (c.axis === 'z') geo.rotateX(Math.PI / 2);
      geo.translate(c.x, c.y, c.z);
      let list = groups.get(c.mat);
      if (!list) groups.set(c.mat, (list = []));
      // Cylinders have no index-compatible layout with boxes, so merge separately.
      list.push(geo);
    }
    for (const [mat, geos] of groups) this.addMerged(geos, mat, true);
  }

  private addMerged(geos: THREE.BufferGeometry[], mat: MaterialKey, shadow: boolean): void {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, this.materials[mat]);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.disposables.push(merged);
  }

  /** Orange cloth flags that wave in the wind (vertex shader animation). */
  private buildFlags(): void {
    if (this.data.flags.length === 0) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf26a1b, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x6a2200, emissiveIntensity: 0.35 });
    const time = this.flagTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float k = clamp(position.x / 1.4, 0.0, 1.0);
          float phase = uTime * 5.0 + position.x * 3.0 + float(gl_InstanceID) * 1.7;
          transformed.z += sin(phase) * 0.22 * k;
          transformed.y += cos(phase * 0.7) * 0.05 * k;`,
        );
    };
    const geo = new THREE.PlaneGeometry(1.4, 0.9, 12, 4);
    geo.translate(0.7, -0.45, 0);
    const mesh = new THREE.InstancedMesh(geo, mat, this.data.flags.length);
    const m = new THREE.Matrix4();
    this.data.flags.forEach((f, i) => {
      m.makeRotationY(f.angle).setPosition(f.x, f.y, f.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  private buildBillboard(def: BillboardDef): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round((1024 * def.height) / def.width);
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#f47a22');
    grad.addColorStop(1, '#e8541a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(canvas.width * (0.75 + i * 0.03), canvas.height * 0.5, canvas.height * (0.2 + i * 0.12), 0, Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(canvas.height * 0.42)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(def.text, canvas.width * 0.06, canvas.height * 0.42);
    ctx.font = `600 ${Math.round(canvas.height * 0.12)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(def.sub, canvas.width * 0.065, canvas.height * 0.78);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(def.width, def.height), mat);
    panel.position.set(def.x, def.y, def.z);
    panel.rotation.y = def.angle;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(def.width + 0.4, def.height + 0.4, 0.3), this.materials.metal);
    frame.position.set(0, 0, -0.18);
    panel.add(frame);
    panel.castShadow = true;
    this.group.add(panel);
    this.disposables.push(tex, mat, panel.geometry, frame.geometry);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
