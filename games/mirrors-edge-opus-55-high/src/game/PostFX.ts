import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Post-processing chain for the "high" quality preset:
 * world -> view model (arms, on top) -> soft bloom -> edge speed blur -> output
 * (tone mapping + sRGB). Rendering goes through a multisampled HDR target so
 * anti-aliasing is preserved.
 */
const SpeedBlurShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float d = length(dir * vec2(uAspect, 1.0));
      float amt = uStrength * smoothstep(0.28, 0.9, d);
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;
      for (int i = 1; i < 8; i++) {
        col += texture2D(tDiffuse, vUv - dir * amt * 0.075 * float(i) / 7.0).rgb;
      }
      col /= 8.0;
      // Slight cool tint toward the edges at speed.
      col = mix(col, col * vec3(0.96, 0.99, 1.04), amt);
      gl_FragColor = vec4(col, base.a);
    }
  `,
};

export class PostFX {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private speedBlur: ShaderPass;
  private vmPass: RenderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, vmScene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.vmPass = new RenderPass(vmScene, camera);
    this.vmPass.clear = false;
    this.vmPass.clearDepth = true;
    this.composer.addPass(this.vmPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.45, 1.25);
    this.composer.addPass(this.bloom);
    this.speedBlur = new ShaderPass(SpeedBlurShader);
    this.composer.addPass(this.speedBlur);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.speedBlur.uniforms.uAspect.value = w / h;
  }

  render(dt: number, speedBlur: number): void {
    this.speedBlur.uniforms.uStrength.value = speedBlur;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
