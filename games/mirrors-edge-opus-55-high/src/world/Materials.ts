import * as THREE from 'three';
import type { MaterialKey } from './LevelLayout';

/**
 * Procedural materials. Facade and concrete patterns are computed in the
 * fragment shader from world-space position, so geometry needs no UVs and
 * merged / instanced boxes of any size tile correctly without stretching.
 */

export const Pattern = {
  Plain: 0,
  Concrete: 1,
  Office: 2,
  OfficeOrange: 3,
  Glass: 4,
  Grate: 5,
} as const;
export type Pattern = (typeof Pattern)[keyof typeof Pattern];

const NOISE_GLSL = /* glsl */ `
varying vec3 vFxPos;
varying vec3 vFxNormal;
float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), f.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Anti-aliased box mask for x in [a, b] of a repeating cell (x already fract'ed).
float fxBand(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}
`;

function concreteChunk(): string {
  return /* glsl */ `
    {
      vec2 cp = vFxPos.xz;
      if (abs(nrm.y) < 0.5) cp = vec2(abs(nrm.x) > 0.5 ? vFxPos.z : vFxPos.x, vFxPos.y);
      float n = fxNoise(cp * 0.45) * 0.6 + fxNoise(cp * 2.3) * 0.3 + fxNoise(cp * 11.0) * 0.1;
      vec2 tile = fract(cp / 3.0);
      vec2 fw = fwidth(cp / 3.0) + 1e-4;
      vec2 d = min(tile, 1.0 - tile);
      float seam = min(smoothstep(0.0, fw.x * 1.5 + 0.006, d.x), smoothstep(0.0, fw.y * 1.5 + 0.006, d.y));
      float shade = mix(0.9, 1.02, n) * mix(0.93, 1.0, seam);
      // Grime toward roof edges is too costly to compute per box; fake soft variation instead.
      shade *= mix(0.96, 1.0, fxNoise(cp * 0.08));
      diffuseColor.rgb *= shade;
      fxRough = 0.9;
    }
  `;
}

function facadeChunk(pattern: Pattern): string {
  if (pattern === Pattern.Glass) {
    return /* glsl */ `
      {
        float u = abs(nrm.x) > 0.5 ? vFxPos.z : vFxPos.x;
        vec2 cell = vec2(u / 1.8, vFxPos.y / 3.8);
        vec2 f = fract(cell);
        vec2 fw = fwidth(cell);
        float far = clamp(max(fw.x, fw.y) * 1.5 - 0.15, 0.0, 1.0);
        float pane = fxBand(f.x, 0.035, 0.965, fw.x) * fxBand(f.y, 0.16, 0.97, fw.y);
        float h = fxHash(floor(cell));
        vec3 glass = mix(vec3(0.16, 0.30, 0.46), vec3(0.32, 0.50, 0.68), h * 0.7);
        vec3 spandrel = vec3(0.62, 0.70, 0.78);
        vec3 frame = vec3(0.86, 0.89, 0.92);
        vec3 col = mix(f.y < 0.16 ? spandrel : frame, glass, pane);
        vec3 avg = mix(frame, glass, 0.72);
        diffuseColor.rgb = mix(col, avg, far);
        float isGlass = mix(pane, 0.72, far);
        fxRough = mix(0.55, 0.06, isGlass);
        fxMetal = mix(0.1, 0.85, isGlass);
      }
    `;
  }
  // Office: horizontal window bands separated by white concrete floor slabs.
  const orange = pattern === Pattern.OfficeOrange;
  return /* glsl */ `
    {
      float u = abs(nrm.x) > 0.5 ? vFxPos.z : vFxPos.x;
      vec2 cell = vec2(u / 1.6, vFxPos.y / 3.6);
      vec2 f = fract(cell);
      vec2 fw = fwidth(cell);
      float far = clamp(max(fw.x, fw.y) * 1.5 - 0.15, 0.0, 1.0);
      float win = fxBand(f.x, 0.06, 0.94, fw.x) * fxBand(f.y, 0.36, 0.9, fw.y);
      float h = fxHash(floor(cell));
      vec3 glass = mix(vec3(0.07, 0.11, 0.17), vec3(0.20, 0.29, 0.40), h);
      vec3 wall = vec3(0.93, 0.94, 0.95);
      ${
        orange
          ? `float floorIdx = floor(cell.y);
             if (mod(floorIdx, 4.0) == 1.0 && f.y < 0.3) wall = vec3(0.95, 0.45, 0.12);`
          : ''
      }
      vec3 col = mix(wall, glass, win);
      vec3 avg = mix(wall, glass, 0.45);
      diffuseColor.rgb = mix(col, avg, far);
      float isGlass = mix(win, 0.45, far);
      fxRough = mix(0.82, 0.1, isGlass);
      fxMetal = mix(0.0, 0.7, isGlass);
    }
  `;
}

function grateChunk(): string {
  return /* glsl */ `
    {
      vec2 cp = abs(nrm.y) > 0.5 ? vFxPos.xz : vec2(abs(nrm.x) > 0.5 ? vFxPos.z : vFxPos.x, vFxPos.y);
      vec2 g = fract(cp / 0.16);
      vec2 fw = fwidth(cp / 0.16);
      float hole = fxBand(g.x, 0.18, 0.82, fw.x) * fxBand(g.y, 0.18, 0.82, fw.y);
      hole *= 1.0 - clamp(max(fw.x, fw.y) - 0.4, 0.0, 1.0);
      diffuseColor.rgb *= mix(1.0, 0.18, hole);
      fxRough = 0.6;
      fxMetal = 0.5;
    }
  `;
}

/** Patch a standard material with the world-space pattern for `pattern`. */
export function applyPattern(mat: THREE.MeshStandardMaterial, pattern: Pattern, roofColor = new THREE.Color(0.93, 0.93, 0.92)): void {
  if (pattern === Pattern.Plain) return;
  const isFacade = pattern === Pattern.Office || pattern === Pattern.OfficeOrange || pattern === Pattern.Glass;
  mat.customProgramCacheKey = () => `fx-${pattern}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fxRoofColor = { value: roofColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFxPos;\nvarying vec3 vFxNormal;`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 fxW = vec4(transformed, 1.0);
          vec3 fxN = objectNormal;
          #ifdef USE_INSTANCING
            fxW = instanceMatrix * fxW;
            fxN = mat3(instanceMatrix) * fxN;
          #endif
          fxW = modelMatrix * fxW;
          vFxPos = fxW.xyz;
          vFxNormal = normalize(mat3(modelMatrix) * fxN);
        }`,
      );
    let body: string;
    if (isFacade) {
      body = `
        if (abs(nrm.y) > 0.5) {
          diffuseColor.rgb = fxRoofColor;
          ${concreteChunk()}
        } else ${facadeChunk(pattern)}`;
    } else if (pattern === Pattern.Grate) {
      body = grateChunk();
    } else {
      body = concreteChunk();
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 fxRoofColor;\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float fxRough = -1.0;
        float fxMetal = -1.0;
        vec3 nrm = normalize(vFxNormal);
        ${body}`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        if (fxRough >= 0.0) roughnessFactor = fxRough;
        if (fxMetal >= 0.0) metalnessFactor = fxMetal;`,
      );
  };
}

export type MaterialLibrary = Record<MaterialKey, THREE.MeshStandardMaterial>;

/** Shared materials for the whole game (one instance per surface type). */
export function createMaterials(): MaterialLibrary {
  const std = (color: number, roughness: number, metalness = 0, pattern: Pattern = Pattern.Plain, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    applyPattern(m, pattern);
    return m;
  };
  return {
    office: std(0xffffff, 0.8, 0, Pattern.Office),
    officeOrange: std(0xffffff, 0.8, 0, Pattern.OfficeOrange),
    glass: std(0xffffff, 0.2, 0.5, Pattern.Glass),
    concrete: std(0xe6e6e4, 0.9, 0, Pattern.Concrete),
    white: std(0xf4f4f2, 0.75, 0, Pattern.Concrete),
    red: std(0xe0201c, 0.55, 0.05, Pattern.Plain, { emissive: 0x5a0606, emissiveIntensity: 0.6 }),
    redDark: std(0xa8120f, 0.6, 0.05),
    orange: std(0xf26a1b, 0.6, 0, Pattern.Plain, { emissive: 0x401400, emissiveIntensity: 0.5 }),
    dark: std(0x2b2e33, 0.6, 0.3),
    metal: std(0xc9ced4, 0.45, 0.55),
    grate: std(0x9aa0a6, 0.6, 0.4, Pattern.Grate),
    skylight: std(0x9fc4e0, 0.08, 0.9, Pattern.Plain, { envMapIntensity: 1.3 }),
  };
}
