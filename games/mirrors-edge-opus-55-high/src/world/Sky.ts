import * as THREE from 'three';
import type { LevelTheme } from './LevelLayout';

/** Direction the sunlight comes from (normalised). */
export const SUN_DIR = new THREE.Vector3(-0.62, 0.66, -0.3).normalize();
export const HORIZON_COLOR = new THREE.Color(0xd4e4f2);
export const ZENITH_COLOR = new THREE.Color(0x2a6ccc);

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}
`;

const fragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uClouds;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // Gradient: bright hazy horizon fading into deep blue.
  float t = pow(clamp(h, 0.0, 1.0), 0.55);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uHorizon * 1.02, smoothstep(0.0, -0.25, h));

  // Sun disc and glow.
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.95, 0.85) * (pow(s, 900.0) * 18.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);

  // Soft cumulus clouds projected on a flat cloud deck.
  if (h > 0.0 && uClouds > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv);
    float c = smoothstep(0.5, 0.78, n) * smoothstep(0.0, 0.18, h) * uClouds;
    float shade = mix(0.82, 1.08, smoothstep(0.45, 0.9, fbm(uv * 1.7 + 3.0)));
    vec3 cloud = vec3(1.0) * shade + vec3(1.0, 0.97, 0.9) * pow(s, 6.0) * 0.3;
    col = mix(col, cloud, c * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(radius = 1800, clouds = 1) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uZenith: { value: ZENITH_COLOR.clone() },
        uHorizon: { value: HORIZON_COLOR.clone() },
        uSunDir: { value: SUN_DIR.clone() },
        uTime: { value: 0 },
        uClouds: { value: clouds },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  setTheme(theme: LevelTheme, clouds = theme.clouds): void {
    const u = this.material.uniforms;
    u.uZenith.value.setHex(theme.zenith);
    u.uHorizon.value.setHex(theme.horizon);
    u.uSunDir.value.set(...theme.sunDir).normalize();
    u.uClouds.value = clouds;
  }

  update(time: number, cameraPos: THREE.Vector3): void {
    this.material.uniforms.uTime.value = time;
    this.mesh.position.copy(cameraPos);
  }
}

/** Pre-filtered environment map of the sky, used for reflections on glass. */
export function createEnvironment(renderer: THREE.WebGLRenderer, theme: LevelTheme): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = new Sky(50, 0.6);
  sky.setTheme(theme, theme.clouds * 0.6);
  envScene.add(sky.mesh);
  // A pale "ground" so reflections below the horizon look like a hazy city.
  const groundColor = new THREE.Color(theme.horizon).lerp(new THREE.Color(0x9aa4ae), 0.35);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(49, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: groundColor }),
  );
  ground.position.y = -6;
  envScene.add(ground);
  const rt = pmrem.fromScene(envScene, 0.02, 0.1, 100);
  pmrem.dispose();
  sky.mesh.geometry.dispose();
  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
  return rt.texture;
}
