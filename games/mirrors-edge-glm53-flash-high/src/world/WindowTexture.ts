import * as THREE from 'three';

/**
 * Procedural window-grid texture for building sides, drawn on a canvas.
 */
export function makeWindowTexture(cols = 10, rows = 22): THREE.CanvasTexture {
  const cell = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const g = canvas.getContext('2d')!;

  g.fillStyle = '#dde2e7';
  g.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = Math.random();
      let color = '#93a7b8';               // regular glass
      if (r < 0.12) color = '#b8d3e6';     // bright reflection
      else if (r < 0.2) color = '#7c8fa0'; // shaded
      g.fillStyle = color;
      g.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 7);
    }
    // subtle floor line
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, y * cell, canvas.width, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
