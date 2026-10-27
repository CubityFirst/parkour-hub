/**
 * Background city + atmosphere.
 *
 * A dense skyline of instanced white/concrete boxes and blue-glass towers
 * surrounds the play area (rejecting anything near the route so the playable
 * rooftops always read clean). A gradient sky dome, distance fog and a
 * sun-follows-player shadow camera give the scene its bright, hazy
 * Mirror's Edge daylight without any post-processing cost.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const ROUTE_MIN_Z = -235;
const ROUTE_MAX_Z = 40;
const ROUTE_HALF_X = 42;

export interface CityLights {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

interface CityBuilding {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  glass: boolean;
}

/** deterministic PRNG so the skyline is identical every load */
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

export class CityGenerator {
  readonly group = new THREE.Group();
  readonly lights: CityLights;
  private disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    // ---- atmosphere ------------------------------------------------------
    scene.fog = new THREE.Fog(0xddeaf4, 95, 460);

    const skyGeo = new THREE.SphereGeometry(900, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x2e8bd8) },
        mid: { value: new THREE.Color(0x9fd0f0) },
        bottom: { value: new THREE.Color(0xeef6fb) },
      },
      vertexShader: /* glsl */ `
        varying float vH;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vH = normalize(world.xyz).y;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        varying float vH;
        void main() {
          float h = clamp(vH, -0.2, 1.0);
          vec3 c = h > 0.18
            ? mix(mid, top, smoothstep(0.18, 0.85, h))
            : mix(bottom, mid, smoothstep(-0.12, 0.18, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    this.group.add(sky);
    this.disposables.push(skyGeo, skyMat);

    // Soft studio-like environment map: makes glass and metal read nicely.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    this.disposables.push(env.texture);
    pmrem.dispose();

    // ---- lights -------------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xf5f7fa, 1.1);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 170;
    const s = 46;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.00042;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);
    this.lights = { sun, hemi };

    // ---- skyline -------------------------------------------------------------
    const rng = mulberry32(20261019);
    const centerZ = (ROUTE_MIN_Z + ROUTE_MAX_Z) / 2;
    const buildings = this.generateSkyline(rng, centerZ);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xaecde4,
      roughness: 0.18,
      metalness: 0.5,
      envMapIntensity: 1.15,
    });
    this.disposables.push(boxGeo, whiteMat, glassMat);

    const dummy = new THREE.Object3D();
    for (const [glass, mat] of [
      [false, whiteMat],
      [true, glassMat],
    ] as const) {
      const list = buildings.filter((b) => b.glass === glass);
      const im = new THREE.InstancedMesh(boxGeo, mat, Math.max(list.length, 1));
      im.count = list.length;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        dummy.position.set(b.x, 20 - b.h * 0.62 + rng() * 4, b.z);
        dummy.scale.set(b.w, b.h, b.d);
        dummy.rotation.set(0, b.yaw, 0);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      this.group.add(im);
    }

    // Antenna masts with red beacons on top of some towers
    const withMasts = buildings.filter((b) => b.h > 55).slice(0, 30);
    const mastGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 5);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.6, metalness: 0.3 });
    const beaconGeo = new THREE.SphereGeometry(0.42, 6, 5);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff3a26,
      emissive: 0xff2a15,
      emissiveIntensity: 1.4,
    });
    this.disposables.push(mastGeo, mastMat, beaconGeo, beaconMat);
    const masts = new THREE.InstancedMesh(mastGeo, mastMat, Math.max(withMasts.length, 1));
    const beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, Math.max(withMasts.length, 1));
    masts.count = withMasts.length;
    beacons.count = withMasts.length;
    for (let i = 0; i < withMasts.length; i++) {
      const b = withMasts[i];
      const topY = 20 - b.h * 0.62 + b.h / 2;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(b.x, topY + 3.2, b.z);
      dummy.updateMatrix();
      masts.setMatrixAt(i, dummy.matrix);
      dummy.position.set(b.x, topY + 6.9, b.z);
      dummy.updateMatrix();
      beacons.setMatrixAt(i, dummy.matrix);
    }
    masts.instanceMatrix.needsUpdate = true;
    beacons.instanceMatrix.needsUpdate = true;
    this.group.add(masts, beacons);

    // deep ground haze plane far below the rooftops
    const floorGeo = new THREE.PlaneGeometry(2200, 2200);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0xc9d9e6 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -38, centerZ);
    this.group.add(floor);
    this.disposables.push(floorGeo, floorMat);
  }

  private generateSkyline(rng: () => number, centerZ: number): CityBuilding[] {
    const out: CityBuilding[] = [];
    for (let n = 0; n < 190 && out.length < 165; n++) {
      let x = 0;
      let z = 0;
      let ok = false;
      for (let tries = 0; tries < 30; tries++) {
        const radius = 55 + rng() * 330;
        const ang = rng() * Math.PI * 2;
        x = Math.cos(ang) * radius;
        z = centerZ + Math.sin(ang) * radius * 1.2;
        const nearRoute =
          Math.abs(x) < ROUTE_HALF_X && z > ROUTE_MIN_Z - 20 && z < ROUTE_MAX_Z + 20;
        if (!nearRoute) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
      const dist = Math.hypot(x, z - centerZ);
      const w = 7 + rng() * 20;
      const d = 7 + rng() * 20;
      const h = Math.max(12, Math.min(145, 12 + rng() * (dist < 150 ? 48 : 115)));
      // spacing: reject if another building's footprint nearly overlaps
      let tooClose = false;
      for (const p of out) {
        if (
          Math.abs(p.x - x) < (p.w + w) * 0.62 &&
          Math.abs(p.z - z) < (p.d + d) * 0.62
        ) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      out.push({ x, z, w, h, d, yaw: rng() * 0.5 - 0.25, glass: rng() < (dist < 160 ? 0.3 : 0.55) });
    }
    return out;
  }

  /** keep the shadow frustum centred on the player */
  followTarget(pos: { x: number; y: number; z: number }): void {
    const { sun } = this.lights;
    sun.position.set(pos.x + 34, pos.y + 62, pos.z + 26);
    sun.target.position.set(pos.x, pos.y - 6, pos.z - 4);
    sun.target.updateMatrixWorld();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
