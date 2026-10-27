import * as THREE from 'three';
import { createCloudTexture } from './Textures';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.62));

    float sunDot = max(dot(dir, uSunDir), 0.0);
    col += uSun * pow(sunDot, 160.0) * 1.4;
    col += uSun * pow(sunDot, 6.0) * 0.09;

    // A soft warm band just above the horizon.
    col = mix(col, vec3(0.95, 0.97, 0.99), smoothstep(0.22, 0.0, abs(dir.y - 0.02)) * 0.12);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Sky, sunlight, shadows, atmosphere and the generated environment map used by
 * glass and metal materials.
 */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly sunDirection = new THREE.Vector3(-0.42, 0.86, -0.5).normalize();
  readonly sky: THREE.Mesh;
  readonly clouds = new THREE.Group();

  private readonly sunOffset = new THREE.Vector3();
  private readonly shadowTarget = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    scene.fog = new THREE.FogExp2(0xd7e9f6, 0.0026);

    const skyGeo = new THREE.SphereGeometry(1500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color(0x2c7cc9) },
        uHorizon: { value: new THREE.Color(0xdcecf7) },
        uSun: { value: new THREE.Color(0xfff3d8) },
        uSunDir: { value: this.sunDirection.clone() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.position.set(0, 0, 130);
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    const hemi = new THREE.HemisphereLight(0xdbeeff, 0xc2ccd2, 1.15);
    scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff3df, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.camera.left = -58;
    this.sun.shadow.camera.right = 58;
    this.sun.shadow.camera.top = 58;
    this.sun.shadow.camera.bottom = -58;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.sunOffset.copy(this.sunDirection).multiplyScalar(110);

    scene.environment = this.createEnvironmentMap();
    scene.environmentIntensity = 0.75;

    this.createClouds();
  }

  private createEnvironmentMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#1f6fbe');
    sky.addColorStop(0.42, '#79b4e2');
    sky.addColorStop(0.52, '#e6f2fa');
    sky.addColorStop(0.62, '#cddde6');
    sky.addColorStop(1, '#8ea3af');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    // Sun bloom on the left half of the panorama.
    const glow = ctx.createRadialGradient(330, 150, 8, 330, 150, 260);
    glow.addColorStop(0, 'rgba(255, 250, 232, 1)');
    glow.addColorStop(0.08, 'rgba(255, 248, 226, 0.85)');
    glow.addColorStop(0.35, 'rgba(255, 244, 220, 0.22)');
    glow.addColorStop(1, 'rgba(255, 244, 220, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1024, 512);

    // Faint cloud shapes in the panorama.
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 1024;
      const y = 190 + Math.random() * 90;
      const r = 30 + Math.random() * 80;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.1 + Math.random() * 0.2})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
    pmrem.dispose();
    return envMap;
  }

  private createClouds(): void {
    const texture = createCloudTexture();
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
      color: 0xffffff,
      fog: false,
    });

    const positions: Array<[number, number, number, number, number]> = [
      [-260, 170, 80, 320, 120],
      [-120, 200, 260, 380, 130],
      [120, 185, 40, 280, 100],
      [320, 210, 210, 420, 150],
      [40, 240, 460, 300, 120],
      [-360, 195, 360, 340, 120],
      [220, 160, -40, 250, 90],
      [-30, 155, -120, 260, 90],
    ];
    for (const [x, y, z, sx, sy] of positions) {
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, y, z);
      sprite.scale.set(sx, sy, 1);
      sprite.renderOrder = -5;
      this.clouds.add(sprite);
    }
    this.scene.add(this.clouds);
  }

  update(playerPosition: THREE.Vector3): void {
    // Snap the shadow frustum to a coarse grid to avoid shimmering.
    const x = Math.round(playerPosition.x / 2) * 2;
    const z = Math.round(playerPosition.z / 2) * 2;
    this.shadowTarget.set(x, playerPosition.y, z);
    this.sun.target.position.copy(this.shadowTarget);
    this.sun.position.copy(this.shadowTarget).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();

    this.sky.position.set(playerPosition.x, 0, playerPosition.z);
  }

  dispose(): void {
    this.sky.geometry.dispose();
    (this.sky.material as THREE.ShaderMaterial).dispose();
    this.scene.environment?.dispose();
    this.scene.fog = null;
  }
}
