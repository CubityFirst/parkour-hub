/**
 * Builds the rendered city-level geometry from LevelData prims.
 *
 * Every box is merged into one mesh per material family (shared
 * geometries/materials, minimal draw calls), with procedurally generated
 * canvas textures for roof panels, concrete and glass-window modules — no
 * external assets. The "runner vision" red uses an emissive material whose
 * intensity gently pulses to pull the eye along the route.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LevelData, MatKind, Prim } from './LevelData.ts';

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function roofTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx) => {
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(0, 0, 256, 256);
    // faint panel seams + speckle so white decks are not flat
    ctx.strokeStyle = 'rgba(140,150,160,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 254, 254);
    ctx.strokeStyle = 'rgba(160,170,180,0.22)';
    ctx.beginPath();
    ctx.moveTo(128, 0);
    ctx.lineTo(128, 256);
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.stroke();
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,130,140,0.05)' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  });
}

function concreteTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx) => {
    ctx.fillStyle = '#c7ccd1';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      const g = 175 + Math.random() * 55;
      ctx.fillStyle = `rgba(${g},${g + 3},${g + 6},0.5)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    ctx.strokeStyle = 'rgba(90,98,106,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 252);
  });
}

/**
 * Blue-tinted glass with lit office windows and a rare red signage panel —
 * the "reflective blue skyscraper" look from the reference images.
 */
function glassTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#a8c8de');
    grad.addColorStop(1, '#7ea6c4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    const cols = 16;
    const rows = 16;
    const cw = 512 / cols;
    const ch = 512 / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = Math.random();
        let fill = '#8fb4ce';
        if (r < 0.16) fill = '#f4e9c8'; // lit window
        else if (r < 0.24) fill = '#c9dae8';
        else if (r < 0.3) fill = '#6f93af';
        ctx.fillStyle = fill;
        ctx.fillRect(x * cw + 3, y * ch + 3, cw - 6, ch - 6);
      }
    }
    ctx.strokeStyle = 'rgba(240,246,250,0.85)';
    ctx.lineWidth = 5;
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * ch);
      ctx.lineTo(512, y * ch);
      ctx.stroke();
    }
    // occasional red signage band (like the reference skyline)
    if (Math.random() < 0.5) {
      ctx.fillStyle = '#e04a2f';
      ctx.fillRect(0, 60 + Math.random() * 380, 512, 26);
    }
  });
}

// ---------------------------------------------------------------------------
// UV scaling so textures tile at a fixed metric size on every box face
// ---------------------------------------------------------------------------

/** Box face order: +X, -X, +Y, -Y, +Z, -Z — (horizontal, vertical) extents */
const FACE_AXES: [number, number][] = [
  [2, 1], // +X: z, y
  [2, 1], // -X
  [0, 2], // +Y: x, z
  [0, 2], // -Y
  [0, 1], // +Z: x, y
  [0, 1], // -Z
];

function scaledBox(sx: number, sy: number, sz: number, tile: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const dims = [sx, sy, sz];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const [h, v] = FACE_AXES[f];
    const su = dims[h] / tile;
    const sv = dims[v] / tile;
    for (let i = f * 4; i < f * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

const TILE: Record<MatKind, number> = {
  white: 3.6,
  concrete: 2.1,
  glass: 2.6,
  red: 999,
  redEmissive: 999,
  dark: 999,
};

// ---------------------------------------------------------------------------
// Visuals assembly
// ---------------------------------------------------------------------------

export interface LevelVisuals {
  group: THREE.Group;
  update(elapsed: number): void;
  dispose(): void;
}

export function buildLevelVisuals(data: LevelData): LevelVisuals {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  const textures: Partial<Record<MatKind, THREE.Texture>> = {
    white: roofTexture(),
    concrete: concreteTexture(),
    glass: glassTexture(),
  };
  for (const t of Object.values(textures)) if (t) disposables.push(t);

  const materials: Record<MatKind, THREE.Material> = {
    white: new THREE.MeshStandardMaterial({ map: textures.white, color: 0xffffff, roughness: 0.92, metalness: 0 }),
    concrete: new THREE.MeshStandardMaterial({ map: textures.concrete, color: 0xffffff, roughness: 0.95 }),
    red: new THREE.MeshStandardMaterial({ color: 0xd92b1f, roughness: 0.55, metalness: 0.05 }),
    redEmissive: new THREE.MeshStandardMaterial({
      color: 0xff3a26,
      emissive: 0xff2a15,
      emissiveIntensity: 1.15,
      roughness: 0.4,
    }),
    glass: new THREE.MeshStandardMaterial({
      map: textures.glass,
      color: 0xffffff,
      roughness: 0.16,
      metalness: 0.55,
      envMapIntensity: 0.9,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a4248, roughness: 0.8 }),
  };
  for (const m of Object.values(materials)) disposables.push(m);

  // merge all prims per material
  const buckets = new Map<MatKind, THREE.BufferGeometry[]>();
  const addPrim = (p: Prim): void => {
    const sx = p.max.x - p.min.x;
    const sy = p.max.y - p.min.y;
    const sz = p.max.z - p.min.z;
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    const geo = scaledBox(sx, sy, sz, TILE[p.mat]);
    geo.translate(
      (p.min.x + p.max.x) / 2,
      (p.min.y + p.max.y) / 2,
      (p.min.z + p.max.z) / 2,
    );
    let list = buckets.get(p.mat);
    if (!list) buckets.set(p.mat, (list = []));
    list.push(geo);
  };
  for (const p of data.prims) addPrim(p);
  for (const p of data.pads) addPrim(p);

  const emissiveMat = materials.redEmissive as THREE.MeshStandardMaterial;
  for (const [kind, geos] of buckets) {
    if (geos.length === 0) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    disposables.push(merged);
    const mesh = new THREE.Mesh(merged, materials[kind]);
    const decal = kind === 'redEmissive';
    mesh.castShadow = !decal;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  void emissiveMat;

  // ---- zipline cables ----------------------------------------------------
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.4, metalness: 0.8 });
  disposables.push(cableMat);
  for (const c of data.cables) {
    const a = new THREE.Vector3(c.a.x, c.a.y, c.a.z);
    const b = new THREE.Vector3(c.b.x, c.b.y, c.b.z);
    const dir = b.clone().sub(a);
    void dir;
    const tube = new THREE.TubeGeometry(
      new THREE.LineCurve3(a.clone(), b.clone()),
      2,
      0.032,
      6,
      false,
    );
    disposables.push(tube);
    const line = new THREE.Mesh(tube, cableMat);
    group.add(line);

    // rider trolley: small red carriage that slides along the cable
    const trolleyGeo = new THREE.BoxGeometry(0.16, 0.2, 0.3);
    disposables.push(trolleyGeo);
    const trolley = new THREE.Mesh(trolleyGeo, materials.red);
    trolley.castShadow = true;
    trolley.userData.alongCable = { a, b };
    group.add(trolley);
  }

  // ---- flags on poles (red pennants, reference imagery) ------------------
  const flagPoleMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.6, metalness: 0.4 });
  const flagMat = new THREE.MeshStandardMaterial({
    color: 0xe8402c,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  disposables.push(flagPoleMat, flagMat);
  const poleGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6);
  const flagGeo = new THREE.PlaneGeometry(0.62, 0.4, 4, 2);
  disposables.push(poleGeo, flagGeo);
  const flags: { mesh: THREE.Mesh; phase: number }[] = [];
  for (const f of data.flags) {
    const pole = new THREE.Mesh(poleGeo, flagPoleMat);
    pole.position.set(f.x, f.y + 1.15, f.z);
    pole.castShadow = true;
    group.add(pole);
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(f.x + 0.31, f.y + 2.05, f.z);
    flag.castShadow = true;
    group.add(flag);
    flags.push({ mesh: flag, phase: Math.random() * Math.PI * 2 });
  }

  // ---- update ------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const trolleys: THREE.Mesh[] = [];
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.alongCable) trolleys.push(o as THREE.Mesh);
  });
  let pulseBase = -1;

  function update(elapsed: number): void {
    // runner-vision pulse
    const pulse = 1.0 + Math.sin(elapsed * 3.2) * 0.42;
    if (pulse !== pulseBase) {
      pulseBase = pulse;
      (materials.redEmissive as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
    }
    for (const { mesh, phase } of flags) {
      mesh.rotation.y = Math.sin(elapsed * 3 + phase) * 0.4;
      mesh.rotation.z = Math.sin(elapsed * 5 + phase) * 0.08;
    }
    for (const t of trolleys) {
      const { a, b } = t.userData.alongCable as { a: THREE.Vector3; b: THREE.Vector3 };
      const s = 0.5 + Math.sin(elapsed * 0.24) * 0.5;
      tmp.copy(a).lerp(b, s);
      t.position.copy(tmp);
      t.lookAt(b);
    }
  }

  function dispose(): void {
    for (const d of disposables) d.dispose();
  }

  return { group, update, dispose };
}
