import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { FirstPersonCamera } from '../player/FirstPersonCamera';
import { PlayerBody } from '../player/PlayerBody';
import { PlayerController, type PlayerInput } from '../player/PlayerController';
import { PHYS } from '../player/PlayerPhysics';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { LEVELS } from '../levels';
import { Checkpoints, type CheckpointEvent } from '../world/Checkpoints';
import { CityGenerator } from '../world/CityGenerator';
import { Level } from '../world/Level';
import type { LevelTheme } from '../world/LevelLayout';
import { createMaterials, type MaterialLibrary } from '../world/Materials';
import { createEnvironment, Sky } from '../world/Sky';
import { GameState } from './GameState';
import { Progress } from './Progress';
import { Input } from './Input';
import { PostFX } from './PostFX';
import { loadSettings, saveSettings, type Settings } from './Settings';

const STEP = PHYS.fixedStep;
const SHADOW_EXTENT = 48;

/**
 * Top-level game object: owns the renderer, world, player and UI, and runs
 * the fixed-timestep simulation loop with interpolated rendering.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private vmScene = new THREE.Scene();
  private cam: FirstPersonCamera;
  private sky!: Sky;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private vmSun!: THREE.DirectionalLight;
  private sunDir = new THREE.Vector3(0, 1, 0);
  private envMap: THREE.Texture | null = null;
  private materials!: MaterialLibrary;
  private level!: Level;
  private city!: CityGenerator;
  private checkpoints!: Checkpoints;
  private player!: PlayerController;
  private body!: PlayerBody;
  private post: PostFX | null = null;
  private input: Input;
  private audio = new AudioManager();
  private hud: HUD;
  private menu: Menu;
  private state = new GameState();
  private progress = new Progress(LEVELS.length);
  private settings: Settings = loadSettings();

  private accumulator = 0;
  private lastFrame = 0;
  private time = 0;
  private wantLock = false;
  private noLock = new URLSearchParams(location.search).has('nolock');
  private cpEvents: CheckpointEvent[] = [];
  private wallStepTimer = 0;
  private menuYaw = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.cam = new FirstPersonCamera(window.innerWidth / window.innerHeight);
    this.input = new Input(this.renderer.domElement);
    this.hud = new HUD(document.body);
    this.menu = new Menu(document.body, this.settings, {
      onContinue: () => this.playLevel(this.continueIndex()),
      onPlayLevel: (i) => this.playLevel(i),
      onResume: () => this.resume(),
      onRestartCheckpoint: () => {
        this.respawn(false);
        this.resume();
      },
      onRestartLevel: () => this.startRun(),
      onNextLevel: () => this.playLevel(this.state.levelIndex + 1),
      onMainMenu: () => this.toMainMenu(),
      onSettingsChange: (s) => this.applySettings(s),
      onClick: () => {
        this.audio.init();
        this.audio.uiClick();
      },
    });
    this.menu.show('loading');
  }

  /** Builds the world. Split into steps so the loading bar can update. */
  async init(): Promise<void> {
    const steps: (() => void)[] = [
      () => {
        this.buildLighting();
        this.materials = createMaterials();
        this.body = new PlayerBody();
        this.vmScene.add(this.body.viewModel);
        this.scene.add(this.body.legs);
        this.cam.onFootstep = (speed) => this.audio.footstep(speed);
      },
      () => this.loadLevel(this.continueIndex()),
      () => {
        this.applySettings(this.settings);
        // Compile all shaders up front so the first frames don't hitch.
        this.renderer.compile(this.scene, this.cam.camera);
        this.renderer.compile(this.vmScene, this.cam.camera);
      },
    ];
    for (let i = 0; i < steps.length; i++) {
      steps[i]();
      this.menu.setLoading((i + 1) / steps.length);
      await new Promise((r) => setTimeout(r, 16));
    }

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    window.addEventListener('beforeunload', (e) => {
      // Ctrl+W while sliding would otherwise close the tab mid-run.
      if (this.state.phase === 'playing') {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state.phase === 'playing' && !this.input.locked && !this.noLock) void this.input.lock();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state.phase === 'playing') this.pause();
    });

    this.onResize();
    this.refreshMenus();
    this.menu.show('main');
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));

    (window as unknown as { rooftopFlow: unknown }).rooftopFlow = this;
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private buildLighting(): void {
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.00135);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.scene.environmentIntensity = 0.55;

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0xe6ddd0, 0.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3e2, 2.25);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_EXTENT;
    sc.right = SHADOW_EXTENT;
    sc.top = SHADOW_EXTENT;
    sc.bottom = -SHADOW_EXTENT;
    sc.near = 1;
    sc.far = 320;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun, this.sun.target);

    this.vmScene.add(new THREE.HemisphereLight(0xd6e6ff, 0xb9b2a8, 0.9));
    this.vmSun = new THREE.DirectionalLight(0xfff3e2, 1.4);
    this.vmScene.add(this.vmSun);
  }

  /** Sky, fog, sun and reflections for a level's mood. */
  private applyTheme(t: LevelTheme): void {
    const horizon = new THREE.Color(t.horizon);
    (this.scene.background as THREE.Color).copy(horizon);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(horizon);
    fog.density = t.fogDensity;
    this.sky.setTheme(t);
    this.sunDir.set(...t.sunDir).normalize();
    this.sunBasis.lookAt(new THREE.Vector3(), this.sunDir.clone().negate(), new THREE.Vector3(0, 1, 0));
    this.sunBasisInv.copy(this.sunBasis).invert();
    this.sun.color.setHex(t.sunColor);
    this.sun.intensity = t.sunIntensity;
    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.vmSun.color.setHex(t.sunColor);
    this.vmSun.position.copy(this.sunDir).multiplyScalar(10);
    this.renderer.toneMappingExposure = t.exposure;
    this.envMap?.dispose();
    this.envMap = createEnvironment(this.renderer, t);
    this.scene.environment = this.envMap;
    this.vmScene.environment = this.envMap;
  }

  // ---------------------------------------------------------------------------
  // Levels
  // ---------------------------------------------------------------------------

  /** Level the PLAY / CONTINUE button starts: the first unlocked, unfinished one. */
  private continueIndex(): number {
    for (let i = 0; i <= this.progress.unlocked; i++) {
      if (!this.progress.isCompleted(LEVELS[i].id)) return i;
    }
    return this.progress.unlocked;
  }

  /** Swap the world to another level (geometry, collision, city, lighting). */
  private loadLevel(index: number): void {
    if (this.level) {
      this.scene.remove(this.level.group, this.city.group, this.checkpoints.group);
      this.level.dispose();
      this.city.dispose();
      this.checkpoints.dispose();
    }
    const data = LEVELS[index].build();
    this.state.levelIndex = index;
    this.level = new Level(this.materials, data);
    this.city = new CityGenerator(this.materials, data);
    this.checkpoints = new Checkpoints(data);
    this.scene.add(this.level.group, this.city.group, this.checkpoints.group);
    if (this.player) this.player.setWorld(this.level.collision);
    else this.player = new PlayerController(this.level.collision);
    this.applyTheme(data.theme);
    this.hud.setLevel(LEVELS[index].label, data.name);
    this.resetWorld();
  }

  private playLevel(index: number): void {
    if (index < 0 || index >= LEVELS.length || !this.progress.isUnlocked(index)) return;
    this.audio.init();
    if (index !== this.state.levelIndex) this.loadLevel(index);
    this.startRun();
  }

  private refreshMenus(): void {
    const ci = this.continueIndex();
    this.menu.setLevels(
      LEVELS.map((l, i) => ({
        label: l.label,
        name: l.name,
        tagline: l.tagline,
        best: this.progress.best(l.id),
        unlocked: this.progress.isUnlocked(i),
        completed: this.progress.isCompleted(l.id),
        current: i === ci,
      })),
    );
    const done = LEVELS.filter((l) => this.progress.isCompleted(l.id)).length;
    const label = done === 0 ? 'PLAY TUTORIAL' : `${done === LEVELS.length ? 'REPLAY' : 'CONTINUE'} · ${LEVELS[ci].label}`;
    this.menu.setContinue(label, done > 0 ? `${done} / ${LEVELS.length} LEVELS COMPLETE` : '');
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.audio.setVolume(s.volume);
    const high = s.quality === 'high';
    const ratio = Math.min(window.devicePixelRatio, high ? 1.5 : 1);
    this.renderer.setPixelRatio(ratio);
    const mapSize = high ? 2048 : 1024;
    if (this.sun && this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (high && !this.post) {
      this.post = new PostFX(this.renderer, this.scene, this.vmScene, this.cam.camera);
    } else if (!high && this.post) {
      this.post.dispose();
      this.post = null;
    }
    this.onResize();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
  }

  // ---------------------------------------------------------------------------
  // Flow control
  // ---------------------------------------------------------------------------

  private resetWorld(): void {
    this.checkpoints.reset();
    this.state.resetRun();
    this.respawn(false);
    this.hud.setProgress(0, this.level.data.checkpoints.length);
    this.hud.setHint(null);
  }

  private startRun(): void {
    this.audio.init();
    this.resetWorld();
    this.showStartToast();
    this.beginPlaying();
  }

  private showStartToast(): void {
    this.hud.showToast(LEVELS[this.state.levelIndex].label, this.level.data.startTitle, 2.6);
  }

  /** T key: back to the start of the level with a fresh timer, without leaving play. */
  private restartLevelInPlace(): void {
    this.resetWorld();
    this.hud.flash();
    this.audio.respawn();
    this.showStartToast();
  }

  private resume(): void {
    this.audio.init();
    this.beginPlaying();
  }

  /** Enter play mode once the pointer is locked. */
  private beginPlaying(): void {
    if (this.noLock) {
      this.enterPlaying();
      return;
    }
    this.wantLock = true;
    void this.input.lock().then(() => {
      // Some browsers resolve without a pointerlockchange if already locked.
      if (this.input.locked && this.wantLock) this.enterPlaying();
    });
  }

  private enterPlaying(): void {
    this.wantLock = false;
    this.state.phase = 'playing';
    this.input.enabled = true;
    this.input.clear();
    this.menu.show('none');
    this.hud.show(true);
    this.audio.setMuted(false);
    this.lastFrame = performance.now();
    this.accumulator = 0;
  }

  private pause(): void {
    if (this.state.phase !== 'playing') return;
    this.state.phase = 'paused';
    this.input.enabled = false;
    this.input.clear();
    this.input.unlock();
    this.audio.setMuted(true);
    this.refreshMenus();
    this.menu.setPauseLevel(`${LEVELS[this.state.levelIndex].label} · ${this.level.data.name}`);
    this.menu.show('paused');
  }

  private toMainMenu(): void {
    this.state.phase = 'menu';
    this.input.enabled = false;
    this.input.unlock();
    this.hud.show(false);
    const ci = this.continueIndex();
    if (ci !== this.state.levelIndex) this.loadLevel(ci);
    else this.resetWorld();
    this.refreshMenus();
    this.menu.show('main');
  }

  private onPointerLockChange(): void {
    if (this.input.locked) {
      if (this.wantLock) this.enterPlaying();
    } else if (this.state.phase === 'playing') {
      this.pause();
    }
  }

  private respawn(countAsFall: boolean): void {
    const sp = this.checkpoints.spawnPoint;
    this.player.respawn(sp.pos);
    this.cam.snap(this.player, sp.yaw);
    this.accumulator = 0;
    if (countAsFall) {
      this.state.respawns++;
      this.hud.flash();
      this.audio.respawn();
    }
  }

  private finish(): void {
    this.state.phase = 'finished';
    this.input.enabled = false;
    this.input.unlock();
    const time = this.state.runTime;
    const index = this.state.levelIndex;
    const entry = LEVELS[index];
    const result = this.progress.complete(index, entry.id, time);
    this.audio.finish();
    this.hud.setHint(null);
    this.hud.showToast('FINISH', 'LEVEL COMPLETE', 1.5);
    this.refreshMenus();
    window.setTimeout(() => {
      if (this.state.phase !== 'finished') return;
      this.hud.show(false);
      const next = LEVELS[index + 1];
      this.menu.showFinish({
        levelLabel: entry.label,
        levelName: entry.name,
        time,
        best: this.progress.best(entry.id),
        record: result.record,
        respawns: this.state.respawns,
        unlocked: result.unlockedNext && next ? `${next.label} · ${next.name}` : null,
        hasNext: !!next,
      });
    }, 900);
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  private frame(now: number): void {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    this.time += dt;
    const playing = this.state.phase === 'playing';
    const finished = this.state.phase === 'finished';

    if (playing) {
      const [mx, my] = this.input.takeMouse();
      this.cam.look(mx, this.settings.invertY ? -my : my, this.settings.sensitivity);
      if (this.input.consume('restartLevel')) this.restartLevelInPlace();
      else if (this.input.consume('restart')) this.respawn(true);
      this.simulate(dt);
    } else if (finished) {
      // Let the player coast through the finish line.
      this.simulate(dt);
    } else if (this.state.phase === 'menu') {
      // Slow scenic look-around behind the main menu.
      this.menuYaw += dt * 0.05;
      this.cam.yaw = this.level.data.spawnYaw + 0.35 + Math.sin(this.menuYaw) * 0.45;
      this.cam.pitch = -0.04 + Math.sin(this.menuYaw * 0.7) * 0.03;
    }

    const alpha = this.accumulator / STEP;
    const motion = this.settings.reducedMotion ? 0.25 : 1;
    const moveX = playing ? this.input.moveX : 0;
    this.cam.update(dt, alpha, this.player, moveX, { baseFov: this.settings.fov, motion });
    const camera = this.cam.camera;
    const renderPos = new THREE.Vector3().lerpVectors(this.player.prevPos, this.player.pos, alpha);
    const sprinting = playing && this.input.sprint && this.input.moveZ > 0;
    this.body.update(dt, this.player, camera, renderPos, this.cam.yaw, this.cam.pitch, this.cam.bobPhase, sprinting);

    this.updateSun(renderPos);
    this.sky.update(this.time, camera.position);
    this.level.update(this.time);

    const speed = this.player.horizontalSpeed;
    const speedK = Math.max(0, Math.min(1, (speed - 7) / 6));
    if (playing || finished) {
      this.audio.updateLoops(speed, !this.player.grounded, this.player.state === 'slide', speed);
      this.hud.setTime(this.state.runTime, this.progress.best(LEVELS[this.state.levelIndex].id));
      this.hud.setSpeedFx(speedK * motion);
      this.hud.update(dt);
    }

    if (this.post) this.post.render(dt, playing ? speedK * 0.9 * motion : 0);
    else {
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, camera);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, camera);
      this.renderer.autoClear = true;
    }
  }

  private simulate(dt: number): void {
    const input = this.input;
    const playing = this.state.phase === 'playing';
    this.accumulator += dt;
    let first = true;
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      const pi: PlayerInput = playing
        ? {
            moveX: input.moveX,
            moveZ: input.moveZ,
            sprint: input.sprint,
            jumpHeld: input.jumpHeld,
            jumpPressed: first && input.consume('jump'),
            slideHeld: input.slideHeld,
            slidePressed: first && input.consume('slide'),
            interactPressed: first && input.consume('interact'),
            yaw: this.cam.yaw,
          }
        : { moveX: 0, moveZ: 0, sprint: false, jumpHeld: false, jumpPressed: false, slideHeld: false, slidePressed: false, interactPressed: false, yaw: this.cam.yaw };
      first = false;

      if (playing && !this.state.timerRunning && (pi.moveX !== 0 || pi.moveZ !== 0 || pi.jumpPressed)) this.state.timerRunning = true;
      this.player.tick(STEP, pi);
      if (playing && this.state.timerRunning) this.state.runTime += STEP;

      if (playing) {
        this.checkpoints.update(STEP, this.player.body.aabb(), this.cpEvents);
        if (this.player.pos.y < this.level.data.killY) this.respawn(true);
      }
      this.handlePlayerEvents();
      this.handleCheckpointEvents();
      if (this.state.phase !== 'playing' && playing) break;
    }

    // Wall-run footsteps.
    if (this.player.state === 'wallrun') {
      this.wallStepTimer -= dt;
      if (this.wallStepTimer <= 0) {
        this.wallStepTimer = 0.19;
        this.audio.wallStep();
      }
    }
  }

  private handlePlayerEvents(): void {
    const motion = this.settings.reducedMotion ? 0.25 : 1;
    for (const e of this.player.events) {
      switch (e.type) {
        case 'jump':
          this.audio.jump();
          this.cam.jumpKick(motion);
          break;
        case 'walljump':
          this.audio.jump();
          this.audio.wallStep();
          break;
        case 'land':
          if (e.impact > 2) {
            this.audio.land(e.impact);
            this.cam.landingImpact(e.impact, motion);
          }
          break;
        case 'slideStart':
          this.audio.land(4);
          break;
        case 'vault':
          this.audio.vault();
          break;
        case 'mantle':
          this.audio.mantle();
          break;
        case 'wallrunStart':
          this.wallStepTimer = 0;
          break;
        default:
          break;
      }
    }
    this.player.events.length = 0;
  }

  private handleCheckpointEvents(): void {
    for (const e of this.cpEvents) {
      if (e.type === 'checkpoint') {
        const n = e.checkpoint.index;
        this.hud.showToast(`CHECKPOINT ${n}/${e.total}`, e.checkpoint.title);
        this.hud.setProgress(n, e.total);
        this.audio.checkpoint();
      } else if (e.type === 'finish') {
        this.finish();
      } else if (e.type === 'hint') {
        this.hud.setHint(e.text);
      }
    }
    this.cpEvents.length = 0;
  }

  private sunBasis = new THREE.Matrix4();
  private sunBasisInv = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();

  /** Keep the shadow frustum centred on the player, snapped to shadow texels. */
  private updateSun(center: THREE.Vector3): void {
    const texel = (SHADOW_EXTENT * 2) / this.sun.shadow.mapSize.x;
    const p = this.tmpV.copy(center).applyMatrix4(this.sunBasisInv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(this.sunBasis);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 150);
  }
}
