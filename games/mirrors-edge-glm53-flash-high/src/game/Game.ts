import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CollisionWorld } from '../world/CollisionWorld';
import { Level } from '../world/Level';
import { CityGenerator } from '../world/CityGenerator';
import { PlayerController } from '../player/PlayerController';
import { FirstPersonCamera, MotionSettings } from '../player/FirstPersonCamera';
import { PlayerBody } from '../player/PlayerBody';
import { InputState } from '../player/InputState';
import { AudioManager } from '../audio/AudioManager';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';

export type GameState = 'menu' | 'playing' | 'paused' | 'finished';

const FIXED_STEP = 1 / 120;

/**
 * Top-level orchestrator: renderer, scene, lighting, game state machine,
 * the fixed-timestep loop, and trigger checks (checkpoints / hints / finish).
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cam: FirstPersonCamera;
  private readonly collision = new CollisionWorld();
  private readonly level: Level;
  private readonly city: CityGenerator;
  private readonly player: PlayerController;
  private readonly body: PlayerBody;
  private readonly input = new InputState();
  private readonly audio = new AudioManager();
  private readonly hud: HUD;
  private readonly menu: Menu;
  private readonly sun: THREE.DirectionalLight;
  private readonly sunTarget = new THREE.Object3D();

  private state: GameState = 'menu';
  private readonly clock = new THREE.Clock();
  private accumulator = 0;
  private runTime = 0;
  private runStarted = false;
  private readonly settings: MotionSettings = { sensitivity: 1, reducedMotion: false };

  constructor(container: HTMLElement, uiRoot: HTMLElement) {
    // --- Renderer ---------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // --- Scene / atmosphere -----------------------------------------------
    this.scene.fog = new THREE.Fog(0xd7e8f5, 80, 700);
    this.scene.add(this.makeSky());

    // --- Lighting -----------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0xcfe5ff, 0xdfe3e6, 0.85);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
    this.sun.position.set(60, 100, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75;
    sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun, this.sunTarget);

    // Soft image-based lighting for the glass materials.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    if ('environmentIntensity' in this.scene) {
      (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.35;
    }
    pmrem.dispose();

    // --- World ---------------------------------------------------------------
    this.level = new Level(this.scene, this.collision);
    this.city = new CityGenerator(this.scene);

    // --- Player ----------------------------------------------------------------
    this.cam = new FirstPersonCamera(window.innerWidth / window.innerHeight);
    this.scene.add(this.cam.camera);
    this.body = new PlayerBody(this.cam.camera);
    this.player = new PlayerController(
      this.collision, this.cam, this.input, this.audio,
      () => this.hud.flashRespawn(),
      () => this.body.triggerVault()
    );
    this.player.respawn(this.level.spawn, this.level.spawnYaw);

    // --- UI ---------------------------------------------------------------------
    this.hud = new HUD(uiRoot);
    this.menu = new Menu(uiRoot, {
      onStart: () => this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onMainMenu: () => this.toMainMenu()
    });
    this.settings.sensitivity = this.menu.sensitivity;
    this.settings.reducedMotion = this.menu.reducedMotion;

    // --- Events -------------------------------------------------------------------
    window.addEventListener('resize', () => {
      this.cam.camera.aspect = window.innerWidth / window.innerHeight;
      this.cam.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement != null;
      if (!locked && this.state === 'playing') this.pause();
    });

    this.renderer.setAnimationLoop(() => this.tick());

    this.menu.showMain();
  }

  // ---------------------------------------------------------------------------
  // Sky dome — gradient shader, unaffected by fog.
  // ---------------------------------------------------------------------------

  private makeSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x3f7fd4) },
        bottomColor: { value: new THREE.Color(0xdceaf6) }
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.55)), 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), mat);
    sky.frustumCulled = false;
    return sky;
  }

  // ---------------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------------

  private startRun(): void {
    this.audio.init();
    this.audio.resume();
    this.level.resetRun();
    this.hud.reset();
    this.player.respawn(this.level.spawn, this.level.spawnYaw);
    this.runTime = 0;
    this.runStarted = false;
    this.menu.hideAll();
    this.hud.show();
    this.hud.setTimer(0);
    this.state = 'playing';
    this.renderer.domElement.requestPointerLock();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.menu.showPause();
    this.audio.setWind(0);
    this.audio.setSlide(0);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private resume(): void {
    this.menu.hideAll();
    this.state = 'playing';
    this.audio.resume();
    this.renderer.domElement.requestPointerLock();
  }

  private finishRun(): void {
    this.state = 'finished';
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.setWind(0);
    this.audio.setSlide(0);
    this.audio.finish();

    const prevBest = parseFloat(localStorage.getItem('rf_best') ?? '');
    const isNew = !Number.isFinite(prevBest) || this.runTime < prevBest;
    const best = isNew ? this.runTime : prevBest;
    if (isNew) localStorage.setItem('rf_best', String(best));
    this.menu.showFinish(this.runTime, best, isNew);
    this.hud.hide();
  }

  private toMainMenu(): void {
    this.state = 'menu';
    this.menu.showMain();
    this.hud.hide();
    this.audio.setWind(0);
    this.audio.setSlide(0);
  }

  // ---------------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------------

  private checkTriggers(): void {
    const p = this.player.pos;

    for (const cp of this.level.checkpoints) {
      if (cp.hit) continue;
      const dx = p.x - cp.pos.x;
      const dz = p.z - cp.pos.z;
      if (dx * dx + dz * dz < cp.radius * cp.radius && p.y > cp.yMin && p.y < cp.yMax) {
        cp.hit = true;
        (cp.marker.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
        this.player.checkpoint.copy(cp.pos);
        this.player.respawnYaw = this.level.spawnYaw;
        this.audio.checkpoint();
        this.hud.showToast('CHECKPOINT', `${cp.index} / 6`);
      }
    }

    for (const h of this.level.hints) {
      if (h.used) continue;
      const dx = p.x - h.pos.x;
      const dz = p.z - h.pos.z;
      if (dx * dx + dz * dz < h.radius * h.radius && Math.abs(p.y - h.pos.y) < 6) {
        h.used = true;
        this.hud.showHint(h.text);
      }
    }

    const f = this.level.finish;
    if (p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z < f.z1 && p.y > f.yMin) {
      this.finishRun();
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  private tick(): void {
    const dt = Math.min(0.1, this.clock.getDelta());

    if (this.state === 'playing') {
      // Mouse look
      const [mdx, mdy] = this.input.consumeMouse();
      this.cam.addMouse(mdx, mdy, this.settings.sensitivity);

      // Restart from checkpoint
      if (this.input.onPress('KeyR')) this.player.respawnToCheckpoint();

      // Timer starts on the first movement input.
      if (!this.runStarted &&
        (this.input.isDown('KeyW') || this.input.isDown('KeyA') ||
          this.input.isDown('KeyS') || this.input.isDown('KeyD'))) {
        this.runStarted = true;
      }

      // Fixed-timestep simulation
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < 8) {
        this.player.update(FIXED_STEP, this.settings);
        this.accumulator -= FIXED_STEP;
        steps++;
      }
      if (steps === 8) this.accumulator = 0; // avoid spiral of death

      if (this.runStarted) this.runTime += dt;

      this.checkTriggers();
      this.level.update(dt);

      // Audio atmosphere
      const sp = this.player.hSpeed;
      this.audio.setWind(THREE.MathUtils.clamp(sp / 10.4 - 0.35, 0, 1));
      this.audio.setSlide(this.player.sliding && this.player.grounded ? Math.min(sp / 12, 1) : 0);

      // HUD + camera
      this.hud.setTimer(this.runTime);
      this.hud.update(dt);
      this.cam.update(dt, this.player, this.settings);
      this.body.update(dt, this.player.grounded, this.player.hSpeed, this.cam.getBobPhase());

      // Sun follows the player so shadows stay crisp along the whole route.
      this.sun.position.set(this.player.pos.x + 60, this.player.pos.y + 100, this.player.pos.z + 40);
      this.sunTarget.position.copy(this.player.pos);
      this.sunTarget.updateMatrixWorld();
    } else if (this.state === 'menu') {
      // Slow cinematic orbit over the city behind the main menu.
      const t = this.clock.elapsedTime * 0.07;
      this.cam.camera.position.set(55 + Math.cos(t) * 45, 32 + Math.sin(t * 0.6) * 6, Math.sin(t) * 50);
      this.cam.camera.lookAt(55, 0, 0);
      this.level.update(dt);
    } else {
      // paused / finished — keep the last frame's camera, mild level motion
      this.level.update(dt);
    }

    this.input.endFrame();
    this.renderer.render(this.scene, this.cam.camera);
  }
}
