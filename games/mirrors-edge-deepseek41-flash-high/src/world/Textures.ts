import * as THREE from 'three';

/** Small helpers that generate all of the game's textures procedurally. */

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return [canvas, ctx];
}

function finishTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Bright, lightly speckled concrete with fine panel seams. */
export function createRoofTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#f6f8f9';
  ctx.fillRect(0, 0, 512, 512);

  // Large soft tonal blotches, barely visible but stop the surface looking flat.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 40 + Math.random() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(198, 208, 215, ${0.02 + Math.random() * 0.04})`);
    g.addColorStop(1, 'rgba(198, 208, 215, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fine grain.
  for (let i = 0; i < 5200; i++) {
    const v = 170 + Math.floor(Math.random() * 55);
    ctx.fillStyle = `rgba(${v}, ${v + 4}, ${v + 8}, ${0.05 + Math.random() * 0.09})`;
    const s = Math.random() < 0.85 ? 1 : 2;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }

  // Expansion joints: a 4 x 4 panel grid.
  ctx.strokeStyle = 'rgba(158, 170, 180, 0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = i * 128;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  // Narrow highlight on one side of each seam for a subtle embossed feel.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const p = i * 128 + 1.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  return finishTexture(canvas);
}

/** Cool blue glass curtain wall. */
export function createGlassTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#83aac3');
  gradient.addColorStop(0.55, '#6d97b3');
  gradient.addColorStop(1, '#5a849f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const cols = 8;
  const rows = 12;
  const cellW = 512 / cols;
  const cellH = 512 / rows;
  const palette = ['#9ec8de', '#b9dcec', '#7fadc8', '#6491ad', '#cfe8f4', '#87b6ce'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 4;
      const y = r * cellH + 5;
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.globalAlpha = 0.55 + Math.random() * 0.4;
      ctx.fillRect(x, y, cellW - 8, cellH - 10);
      // Darker reflection band across the lower part of the pane.
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#28495f';
      ctx.fillRect(x, y + cellH * 0.45, cellW - 8, cellH * 0.45);
      ctx.globalAlpha = 1;
    }
  }

  // Mullions.
  ctx.strokeStyle = 'rgba(225, 238, 246, 0.9)';
  ctx.lineWidth = 3;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellW, 0);
    ctx.lineTo(c * cellW, 512);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(214, 230, 240, 0.75)';
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellH);
    ctx.lineTo(512, r * cellH);
    ctx.stroke();
  }

  return finishTexture(canvas);
}

/** Pale stone facade with horizontal ribbon windows. */
export function createOfficeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#e9eef1';
  ctx.fillRect(0, 0, 512, 512);

  const rows = 10;
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    // Shadowed window band.
    ctx.fillStyle = 'rgba(70, 96, 114, 0.85)';
    ctx.fillRect(0, y + rowH * 0.24, 512, rowH * 0.4);
    ctx.fillStyle = 'rgba(183, 215, 232, 0.55)';
    ctx.fillRect(0, y + rowH * 0.27, 512, rowH * 0.06);
    // Vertical mullions breaking up the band.
    ctx.fillStyle = 'rgba(238, 243, 246, 0.95)';
    for (let c = 0; c < 16; c++) {
      ctx.fillRect(c * 32, y + rowH * 0.24, 3, rowH * 0.4);
    }
    // Clean concrete band under each window row.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(0, y + rowH * 0.66, 512, 2);
  }

  // Vertical structural seams.
  ctx.strokeStyle = 'rgba(196, 207, 214, 0.6)';
  ctx.lineWidth = 2;
  for (let c = 0; c <= 4; c++) {
    const x = c * 128;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  return finishTexture(canvas);
}

/** White facade with deep punched windows, for nearby background blocks. */
export function createApartmentTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#eef1f2';
  ctx.fillRect(0, 0, 512, 512);
  const cols = 8;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * 64 + 10;
      const y = r * 64 + 10;
      ctx.fillStyle = r % 2 === 0 ? 'rgba(86, 111, 128, 0.9)' : 'rgba(118, 143, 158, 0.8)';
      ctx.fillRect(x, y, 44, 34);
      ctx.fillStyle = 'rgba(186, 216, 232, 0.35)';
      ctx.fillRect(x, y, 44, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillRect(x - 2, y + 36, 48, 3);
    }
  }
  return finishTexture(canvas);
}

/** Red banner with white lettering, used for the finish gate. */
export function createFinishBannerTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 256);
  ctx.fillStyle = '#cf1f1b';
  ctx.fillRect(0, 0, 1024, 256);

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 980, 212);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 118px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', 512, 132);

  const texture = finishTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function createStartBannerTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 256);
  ctx.fillStyle = '#f4f6f7';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#cf1f1b';
  ctx.fillRect(0, 0, 1024, 18);
  ctx.fillStyle = '#171a1c';
  ctx.font = '700 74px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ROOFTOP FLOW', 512, 108);
  ctx.fillStyle = '#6a747a';
  ctx.font = '500 28px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.fillText('CITY ROUTE  /  01', 512, 180);
  const texture = finishTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Soft cloud puff used by the billboard clouds. */
export function createCloudTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 128);
  ctx.clearRect(0, 0, 256, 128);
  for (let i = 0; i < 22; i++) {
    const x = 40 + Math.random() * 176;
    const y = 54 + Math.random() * 30;
    const r = 20 + Math.random() * 38;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const alpha = 0.11 + Math.random() * 0.16;
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
