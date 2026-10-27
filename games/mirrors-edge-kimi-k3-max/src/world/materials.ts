import * as THREE from 'three';

/** Procedural canvas textures and the shared material set. No external assets. */

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function toTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const dark = Math.random() < 0.5;
    g.fillStyle = dark
      ? `rgba(20,30,40,${(alpha * Math.random()).toFixed(3)})`
      : `rgba(255,255,255,${(alpha * Math.random()).toFixed(3)})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

/** Bright white rooftop concrete with subtle speckle. */
function concreteTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  g.fillStyle = '#f3f5f7';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 2400, 0.06);
  g.strokeStyle = 'rgba(30,40,55,0.07)';
  g.lineWidth = 2;
  g.strokeRect(-1, -1, 258, 258);
  return toTexture(c, true);
}

/** Window-grid facade used by both route buildings and the background city. */
function facadeTexture(base: string, win: string, cols: number, rows: number, litRatio: number): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const cw = 256 / cols;
  const rh = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = Math.random() < litRatio ? '#e4f3ff' : win;
      const pad = Math.max(2, cw * 0.16);
      g.fillRect(x * cw + pad, y * rh + pad * 0.6, cw - pad * 2, rh - pad * 1.4);
    }
  }
  speckle(g, 256, 256, 400, 0.03);
  return toTexture(c, true);
}

/** Streets seen far below the rooftops. */
function streetTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 512);
  g.fillStyle = '#aebccf';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#8ea1b5';
  g.lineWidth = 10;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke();
  }
  speckle(g, 512, 512, 2600, 0.05);
  const t = toTexture(c, true);
  t.repeat.set(24, 24);
  return t;
}

/** FINISH banner stretched between the two finish columns. */
function finishBannerTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 128);
  const s = 16;
  for (let x = 0; x < 512 / s; x++) {
    for (const y of [0, 1, 6, 7]) {
      if ((x + y) % 2 === 0) {
        g.fillStyle = '#12161b';
        g.fillRect(x * s, y * s, s, s);
      }
    }
  }
  g.fillStyle = '#e02a30';
  g.font = '900 62px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FINISH', 256, 66);
  return toTexture(c);
}

export interface MaterialSet {
  roof: THREE.MeshLambertMaterial;
  facadeWhite: THREE.MeshLambertMaterial;
  facadeGray: THREE.MeshLambertMaterial;
  glass: THREE.MeshPhongMaterial;
  red: THREE.MeshLambertMaterial;
  dark: THREE.MeshLambertMaterial;
  metal: THREE.MeshLambertMaterial;
  ground: THREE.MeshLambertMaterial;
  banner: THREE.MeshBasicMaterial;
}

export function createMaterials(): MaterialSet {
  return {
    roof: new THREE.MeshLambertMaterial({ map: concreteTexture() }),
    facadeWhite: new THREE.MeshLambertMaterial({ map: facadeTexture('#edf0f4', '#b7c6d8', 6, 14, 0.05) }),
    facadeGray: new THREE.MeshLambertMaterial({ map: facadeTexture('#c9ced6', '#9dafc2', 6, 12, 0.05) }),
    glass: new THREE.MeshPhongMaterial({
      map: facadeTexture('#84b6e8', '#5d94cb', 5, 12, 0.1),
      shininess: 90,
      specular: new THREE.Color(0xd8ecff),
    }),
    red: new THREE.MeshLambertMaterial({ color: 0xe02a30, emissive: 0x4a0d10 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x4a5058 }),
    metal: new THREE.MeshLambertMaterial({ color: 0xb9c0c8 }),
    ground: new THREE.MeshLambertMaterial({ map: streetTexture() }),
    banner: new THREE.MeshBasicMaterial({ map: finishBannerTexture(), side: THREE.DoubleSide }),
  };
}
