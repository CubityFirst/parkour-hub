import * as THREE from 'three';
import { MaterialSet } from './materials';

/** Deterministic PRNG so the skyline is identical every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EnvironmentRig {
  sun: THREE.DirectionalLight;
  /** Keep the shadow camera centered on the action. */
  update(target: THREE.Vector3): void;
}

/** Gradient sky dome, fog, hemisphere + sun lights with soft shadows. */
export function createEnvironment(scene: THREE.Scene): EnvironmentRig {
  scene.fog = new THREE.Fog(0xd8ecff, 150, 720);

  const skyGeo = new THREE.SphereGeometry(900, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f7fe0) },
      horizon: { value: new THREE.Color(0xe2f2ff) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 top;
      uniform vec3 horizon;
      void main() {
        float h = clamp(vDir.y * 1.6 + 0.08, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizon, top, pow(h, 0.75)), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xffffff, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 280;
  const S = 60;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const sunDir = new THREE.Vector3(0.45, 0.95, 0.35).normalize();
  return {
    sun,
    update(target: THREE.Vector3) {
      sun.position.copy(target).addScaledVector(sunDir, 140);
      sun.target.position.copy(target);
    },
  };
}

/**
 * Background city: instanced towers around the route corridor, a far skyline
 * ring washed by fog, a street grid far below, and soft billboard clouds.
 */
export function generateCity(scene: THREE.Scene, mats: MaterialSet): void {
  const rng = mulberry32(20240);
  const cx = 0;
  const cz = 110; // route center

  // streets far below
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -48;
  scene.add(ground);

  // instanced towers, three facade styles
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0); // pivot at base
  const styles: { mat: THREE.Material; items: { m: THREE.Matrix4; tint: THREE.Color }[] }[] = [
    { mat: mats.facadeWhite, items: [] },
    { mat: mats.glass, items: [] },
    { mat: mats.facadeGray, items: [] },
  ];
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const tmpP = new THREE.Vector3();

  for (let gx = -13; gx <= 13; gx++) {
    for (let gz = -13; gz <= 13; gz++) {
      const x = cx + gx * 26 + (rng() - 0.5) * 10;
      const z = cz + gz * 26 + (rng() - 0.5) * 10;
      if (Math.abs(x) < 52 && z > -42 && z < 250) continue; // keep the route corridor clear
      if (Math.hypot(x - cx, z - cz) > 350) continue;
      if (rng() < 0.12) continue; // occasional empty lot
      const r = rng();
      const top = r < 0.5 ? -34 + rng() * 18 : r < 0.82 ? -16 + rng() * 22 : 4 + rng() * 46;
      const w = 11 + rng() * 13;
      const d = 11 + rng() * 13;
      tmpP.set(x, -48, z);
      tmpQ.identity();
      tmpS.set(w, top + 48, d);
      tmpM.compose(tmpP, tmpQ, tmpS);
      const style = rng() < 0.45 ? 0 : rng() < 0.6 ? 1 : 2;
      const tint = new THREE.Color().setHSL(0.58, rng() * 0.08, 0.9 + rng() * 0.1);
      styles[style].items.push({ m: tmpM.clone(), tint });
    }
  }
  for (const s of styles) {
    if (s.items.length === 0) continue;
    const im = new THREE.InstancedMesh(unit, s.mat, s.items.length);
    s.items.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      im.setColorAt(i, it.tint);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
  }

  // far skyline ring (heavily fogged silhouettes)
  const ringMat = new THREE.MeshLambertMaterial({ color: 0xa9c2de });
  const ringCount = 90;
  const ring = new THREE.InstancedMesh(unit, ringMat, ringCount);
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2 + rng() * 0.06;
    const rad = 400 + rng() * 240;
    const h = 60 + rng() * 130;
    const w = 18 + rng() * 26;
    tmpP.set(cx + Math.cos(a) * rad, -48, cz + Math.sin(a) * rad);
    tmpQ.identity();
    tmpS.set(w, h, w);
    tmpM.compose(tmpP, tmpQ, tmpS);
    ring.setMatrixAt(i, tmpM);
  }
  ring.instanceMatrix.needsUpdate = true;
  scene.add(ring);

  // soft billboard clouds
  const cc = document.createElement('canvas');
  cc.width = 128;
  cc.height = 128;
  const cg = cc.getContext('2d')!;
  const grad = cg.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  cg.fillStyle = grad;
  cg.fillRect(0, 0, 128, 128);
  const cloudTex = new THREE.CanvasTexture(cc);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  const cloudMat = new THREE.SpriteMaterial({
    map: cloudTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
    fog: false,
  });
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(cloudMat);
    const a = rng() * Math.PI * 2;
    const rad = 180 + rng() * 480;
    sp.position.set(cx + Math.cos(a) * rad, 70 + rng() * 110, cz + Math.sin(a) * rad);
    const s = 70 + rng() * 110;
    sp.scale.set(s, s * 0.42, 1);
    scene.add(sp);
  }
}
