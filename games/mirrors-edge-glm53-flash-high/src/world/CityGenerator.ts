import * as THREE from 'three';
import { makeWindowTexture } from './WindowTexture';

/**
 * Background city: instanced buildings in a wide ring around the playable
 * route (which stays clear), plus a hazy ground plane far below.
 */
export class CityGenerator {
  private readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.build(scene);
    scene.add(this.group);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  private build(scene: THREE.Scene): void {
    // Hazy ground far below the rooftops.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: 0x8e99a4, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -85;
    this.group.add(ground);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // --- Windowed concrete blocks -------------------------------------
    const winTex = makeWindowTexture(12, 26);
    const winMat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.9 });
    const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), winMat, 130);
    windows.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    let i = 0;
    let guard = 0;
    while (i < 130 && guard++ < 4000) {
      const x = THREE.MathUtils.randFloat(-220, 480);
      const z = THREE.MathUtils.randFloat(-260, 260);
      // Keep the playable corridor clear.
      if (z > -32 && z < 34 && x > -60 && x < 270) continue;
      const w = THREE.MathUtils.randFloat(12, 30);
      const d = THREE.MathUtils.randFloat(12, 30);
      const h = THREE.MathUtils.randFloat(18, 65);
      dummy.position.set(x, -85 + h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      windows.setMatrixAt(i, dummy.matrix);
      windows.setColorAt(i, color.setHSL(0.58, 0.08, THREE.MathUtils.randFloat(0.62, 0.8)));
      i++;
    }
    windows.instanceMatrix.needsUpdate = true;
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    this.group.add(windows);

    // --- White minimalist towers ---------------------------------------
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.95 });
    const whites = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), whiteMat, 55);
    i = 0;
    guard = 0;
    while (i < 55 && guard++ < 3000) {
      const x = THREE.MathUtils.randFloat(-220, 480);
      const z = THREE.MathUtils.randFloat(-260, 260);
      if (z > -32 && z < 34 && x > -60 && x < 270) continue;
      const w = THREE.MathUtils.randFloat(10, 24);
      const d = THREE.MathUtils.randFloat(10, 24);
      const h = THREE.MathUtils.randFloat(25, 75);
      dummy.position.set(x, -85 + h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      whites.setMatrixAt(i, dummy.matrix);
      i++;
    }
    whites.instanceMatrix.needsUpdate = true;
    this.group.add(whites);

    // --- Blue glass skyscrapers ----------------------------------------
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x8fb8d8, roughness: 0.15, metalness: 0.7, envMapIntensity: 1.2
    });
    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glassMat, 60);
    i = 0;
    guard = 0;
    while (i < 60 && guard++ < 3000) {
      // Mix of mid-distance and far skyline towers.
      const far = Math.random() < 0.4;
      const x = far ? THREE.MathUtils.randFloat(-500, 900) : THREE.MathUtils.randFloat(-220, 480);
      const z = far ? THREE.MathUtils.randFloat(-700, 700) : THREE.MathUtils.randFloat(-260, 260);
      if (!far && z > -32 && z < 34 && x > -60 && x < 270) continue;
      const w = THREE.MathUtils.randFloat(14, 34);
      const d = THREE.MathUtils.randFloat(14, 34);
      const h = THREE.MathUtils.randFloat(50, 130);
      dummy.position.set(x, -85 + h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      glass.setMatrixAt(i, dummy.matrix);
      glass.setColorAt(i, color.setHSL(0.57, 0.25, THREE.MathUtils.randFloat(0.55, 0.75)));
      i++;
    }
    glass.instanceMatrix.needsUpdate = true;
    if (glass.instanceColor) glass.instanceColor.needsUpdate = true;
    this.group.add(glass);
  }
}
