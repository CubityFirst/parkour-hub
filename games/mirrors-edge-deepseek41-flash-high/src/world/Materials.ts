import * as THREE from 'three';
import {
  createApartmentTexture,
  createFinishBannerTexture,
  createGlassTexture,
  createOfficeTexture,
  createRoofTexture,
  createStartBannerTexture,
} from './Textures';

/**
 * Shared material library.  Materials (and their textures) are reused across
 * the whole level to keep draw calls and GPU memory down.
 */
export class Materials {
  readonly roofTexture = createRoofTexture();
  readonly glassTexture = createGlassTexture();
  readonly officeTexture = createOfficeTexture();
  readonly apartmentTexture = createApartmentTexture();
  readonly finishBanner = createFinishBannerTexture();
  readonly startBanner = createStartBannerTexture();

  readonly concrete: THREE.MeshStandardMaterial;
  readonly concreteSide: THREE.MeshStandardMaterial;
  readonly white: THREE.MeshStandardMaterial;
  readonly whiteMatte: THREE.MeshStandardMaterial;
  readonly red: THREE.MeshStandardMaterial;
  readonly redDark: THREE.MeshStandardMaterial;
  readonly redGlow: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly rail: THREE.MeshStandardMaterial;
  readonly dark: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly black: THREE.MeshStandardMaterial;
  readonly marker: THREE.MeshBasicMaterial;

  private roofCache = new Map<string, THREE.MeshStandardMaterial>();
  private facadeCache = new Map<string, THREE.MeshStandardMaterial>();
  private buildingCache = new Map<string, THREE.MeshStandardMaterial>();

  constructor() {
    this.concreteSide = new THREE.MeshStandardMaterial({
      color: 0xe4e9ec,
      roughness: 0.82,
      metalness: 0.04,
    });

    this.concrete = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.03,
      map: this.roofTexture,
    });

    this.white = new THREE.MeshStandardMaterial({
      color: 0xf4f6f7,
      roughness: 0.68,
      metalness: 0.05,
    });

    this.whiteMatte = new THREE.MeshStandardMaterial({
      color: 0xdfe5e8,
      roughness: 0.9,
      metalness: 0.0,
    });

    this.red = new THREE.MeshStandardMaterial({
      color: 0xc9201c,
      roughness: 0.48,
      metalness: 0.08,
    });

    this.redDark = new THREE.MeshStandardMaterial({
      color: 0x981512,
      roughness: 0.6,
      metalness: 0.1,
    });

    this.redGlow = new THREE.MeshStandardMaterial({
      color: 0xe12a22,
      roughness: 0.35,
      metalness: 0.05,
      emissive: 0x4a0704,
      emissiveIntensity: 1.0,
    });

    this.metal = new THREE.MeshStandardMaterial({
      color: 0x9aa6ad,
      roughness: 0.36,
      metalness: 0.78,
    });

    this.rail = new THREE.MeshStandardMaterial({
      color: 0xcfd8dd,
      roughness: 0.3,
      metalness: 0.82,
    });

    this.dark = new THREE.MeshStandardMaterial({
      color: 0x30383d,
      roughness: 0.44,
      metalness: 0.62,
    });

    this.black = new THREE.MeshStandardMaterial({
      color: 0x14181a,
      roughness: 0.55,
      metalness: 0.4,
    });

    this.glass = new THREE.MeshStandardMaterial({
      color: 0xa9cfe3,
      roughness: 0.06,
      metalness: 0.72,
      map: this.glassTexture,
      envMapIntensity: 1.35,
    });

    this.marker = new THREE.MeshBasicMaterial({ color: 0xff2b22 });
  }

  /** Roof surface material with a texture repeat matched to the slab size. */
  roof(width: number, depth: number): THREE.MeshStandardMaterial {
    const u = Math.max(1, Math.round(width / 5));
    const v = Math.max(1, Math.round(depth / 5));
    const key = `${u}x${v}`;
    let mat = this.roofCache.get(key);
    if (!mat) {
      const map = this.roofTexture.clone();
      map.needsUpdate = true;
      map.repeat.set(u, v);
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.02,
        map,
      });
      this.roofCache.set(key, mat);
    }
    return mat;
  }

  /** Glass curtain-wall material tiled to the size of the building face. */
  facade(width: number, height: number): THREE.MeshStandardMaterial {
    const u = Math.max(1, Math.round(width / 12));
    const v = Math.max(1, Math.round(height / 14));
    const key = `${u}x${v}`;
    let mat = this.facadeCache.get(key);
    if (!mat) {
      const map = this.glassTexture.clone();
      map.needsUpdate = true;
      map.repeat.set(u, v);
      mat = new THREE.MeshStandardMaterial({
        color: 0xd9ecf7,
        roughness: 0.12,
        metalness: 0.58,
        map,
        envMapIntensity: 1.1,
      });
      this.facadeCache.set(key, mat);
    }
    return mat;
  }

  /** Pale office facade with ribbon windows. */
  office(width: number, height: number): THREE.MeshStandardMaterial {
    const u = Math.max(1, Math.round(width / 10));
    const v = Math.max(1, Math.round(height / 10));
    const key = `o${u}x${v}`;
    let mat = this.buildingCache.get(key);
    if (!mat) {
      const map = this.officeTexture.clone();
      map.needsUpdate = true;
      map.repeat.set(u, v);
      mat = new THREE.MeshStandardMaterial({
        color: 0xf7fafb,
        roughness: 0.5,
        metalness: 0.15,
        map,
      });
      this.buildingCache.set(key, mat);
    }
    return mat;
  }

  /** White residential facade with punched windows. */
  apartment(width: number, height: number): THREE.MeshStandardMaterial {
    const u = Math.max(1, Math.round(width / 12));
    const v = Math.max(1, Math.round(height / 12));
    const key = `a${u}x${v}`;
    let mat = this.buildingCache.get(key);
    if (!mat) {
      const map = this.apartmentTexture.clone();
      map.needsUpdate = true;
      map.repeat.set(u, v);
      mat = new THREE.MeshStandardMaterial({
        color: 0xf4f7f8,
        roughness: 0.62,
        metalness: 0.08,
        map,
      });
      this.buildingCache.set(key, mat);
    }
    return mat;
  }

  dispose(): void {
    const seen = new Set<THREE.Material>();
    const disposeMat = (m: THREE.Material) => {
      if (seen.has(m)) return;
      seen.add(m);
      const anyMat = m as THREE.MeshStandardMaterial;
      anyMat.map?.dispose();
      m.dispose();
    };
    disposeMat(this.concrete);
    disposeMat(this.concreteSide);
    disposeMat(this.white);
    disposeMat(this.whiteMatte);
    disposeMat(this.red);
    disposeMat(this.redDark);
    disposeMat(this.redGlow);
    disposeMat(this.metal);
    disposeMat(this.rail);
    disposeMat(this.dark);
    disposeMat(this.black);
    disposeMat(this.glass);
    disposeMat(this.marker);
    this.roofCache.forEach(disposeMat);
    this.facadeCache.forEach(disposeMat);
    this.buildingCache.forEach(disposeMat);
    this.roofTexture.dispose();
    this.glassTexture.dispose();
    this.officeTexture.dispose();
    this.apartmentTexture.dispose();
    this.finishBanner.dispose();
    this.startBanner.dispose();
  }
}
