/**
 * Game — renderer, world assembly, phase machine and the main loop.
 *
 * Fixed-timestep simulation (MOVE.fixedDt = 1/120s) decoupled from render
 * rate; one-shot input edges are cleared after the first physics step of a
 * frame so mouse deltas and jump presses are never applied twice.
 */

import * as THREE from 'three';
import { KeyboardMouseInput } from '../core/Input.ts';
import { clamp } from '../core/vec3.ts';
import type { GamePhase, Settings } from './GameState.ts';
import { loadBestTime, loadSettings, saveBestTime, saveSettings } from './GameState.ts';
import { type ControllerEvent, PlayerController } from '../player/PlayerController.ts';
import { FirstPersonCamera } from '../player/FirstPersonCamera.ts';
import { BodyView } from '../player/BodyView.ts';
import { MOVE } from '../player/Movement.ts';
import { CollisionWorld } from '../world/CollisionWorld.ts';
import { buildLevelData } from '../world/LevelData.ts';
import { buildLevelVisuals, type LevelVisuals } from '../world/LevelVisuals.ts';
import { CityGenerator } from '../world/CityGenerator.ts';
import { CheckpointTracker, HintTracker, insideZone } from '../world/Checkpoints.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { HUD } from '../ui/HUD.ts';
import { Menu } from '../ui/Menu.ts';

const OBJECTIVES = [
  'CROSS THE ROOFTOPS — REACH CHECKPOINT 1',
  'REACH CHECKPOINT 2 — BEAT THE VENT RUN',
  'RUN THE RED WALL, THEN CATCH THE ZIPLINE',
  'BRIDGE · VAULT · SLIDE — REACH CHECKPOINT 4',
  'REACH THE RED FINISH GATE',
];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private fp: FirstPersonCamera;
  private input: KeyboardMouseInput;
  private world = new CollisionWorld();
  private visuals: LevelVisuals;
  private city: CityGenerator;
  private body: BodyView;
  private audio = new AudioManager();
  private hud: HUD;
  private menu: Menu;
  private data = buildLevelData();
  private controller!: PlayerController;
  private cpTracker!: CheckpointTracker;
  private hintTracker!: HintTracker;
  private settings: Settings;

  private phase: GamePhase = 'menu';
  private runMs = 0;
  private elapsed = 0;
  private accumulator = 0;
  private lastTime = 0;
  private raf = 0;
  private disposed = false;
  private respawnLock = false;

  constructor(host: HTMLElement) {
    this.settings = loadSettings();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.fp = new FirstPersonCamera(window.innerWidth / window.innerHeight);
    this.scene.add(this.fp.camera);

    for (const p of this.data.prims) {
      if (p.collide === false) continue;
      this.world.addBox({
        minX: p.min.x,
        minY: p.min.y,
        minZ: p.min.z,
        maxX: p.max.x,
        maxY: p.max.y,
        maxZ: p.max.z,
        wallRun: p.wallRun,
        vaultable: p.vaultable,
      });
    }
    this.visuals = buildLevelVisuals(this.data);
    this.scene.add(this.visuals.group);
    this.city = new CityGenerator(this.scene, this.renderer);
    this.scene.add(this.city.group);

    this.body = new BodyView();
    this.fp.camera.add(this.body.group);
    this.resetRun();

    this.hud = new HUD(host);
    this.menu = new Menu(host, this.settings, {
      onStart: () => this.startRun(),
      onResume: () => this.resume(),
      onRestartCheckpoint: () => {
        this.resume();
        this.respawn(true);
      },
      onRestartRun: () => this.startRun(),
      onMainMenu: () => this.toMenu(),
      onSettingsChanged: (s) => this.applySettings(s),
    });

    this.input = new KeyboardMouseInput(this.renderer.domElement);
    this.input.onPauseRequest = () => {
      if (this.phase === 'playing') this.pause();
    };
    this.applySettings(this.settings);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.toMenu();

    // dev handle for console experiments / automated smoke tests
    (window as unknown as { rooftopFlow: Game }).rooftopFlow = this;
  }

  // ---------------------------------------------------------------- lifecycle

  private startRun(): void {
    this.audio.resume();
    this.audio.setEnabled(this.settings.sound);
    this.resetRun();
    this.runMs = 0;
    this.phase = 'playing';
    this.menu.show(null);
    this.hud.setVisible(true);
    this.hud.setObjective(OBJECTIVES[0]);
    this.input.requestPointerLock();
  }

  private resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.menu.show(null);
    this.hud.setVisible(true);
    this.input.requestPointerLock();
  }

  private pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.hud.setVisible(false);
    this.audio.setSlide(false);
    this.audio.setWind(0);
    this.menu.show('pause');
    this.input.exitPointerLock();
  }

  private toMenu(): void {
    this.phase = 'menu';
    this.hud.setVisible(false);
    this.menu.show('main');
    this.input.exitPointerLock();
  }

  private finishRun(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'finished';
    this.input.exitPointerLock();
    this.audio.setWind(0);
    this.audio.setSlide(false);
    this.hud.finishFlash();
    this.audio.event('finish');
    const prevBest = loadBestTime();
    const isRecord = prevBest === null || this.runMs < prevBest;
    const best = isRecord ? this.runMs : prevBest!;
    if (isRecord) saveBestTime(this.runMs);
    this.hud.setVisible(false);
    this.menu.showFinish(this.runMs, best, isRecord);
  }

  private resetRun(): void {
    this.cpTracker = new CheckpointTracker(this.data.checkpoints);
    this.hintTracker = new HintTracker(this.data.hints);
    this.controller = new PlayerController(this.data.spawn, this.world, this.data.cables, (e) =>
      this.onPlayerEvent(e),
    );
    this.fp.snapTo(this.controller);
    this.respawnLock = false;
  }

  private respawn(explicit: boolean): void {
    if (this.respawnLock || this.phase !== 'playing') return;
    this.respawnLock = true;
    const point = this.cpTracker.respawnPoint(this.data.spawn);
    this.controller.respawn(point);
    this.fp.snapTo(this.controller);
    this.audio.event('respawn');
    if (explicit) this.hud.showCheckpointToast('BACK TO CHECKPOINT');
    this.hud.setObjective(
      OBJECTIVES[Math.min(this.cpTracker.activeIndex + 1, OBJECTIVES.length - 1)],
    );
    this.respawnLock = false;
  }

  private onPlayerEvent(e: ControllerEvent): void {
    this.fp.handleEvent(e.type, e.intensity ?? 0);
    if (e.type === 'fell') {
      this.respawn(false);
      return;
    }
    this.audio.event(e.type, e.intensity ?? 1);
  }

  private applySettings(s: Settings): void {
    this.settings = { ...s };
    saveSettings(s);
    this.input.sensitivity = s.sensitivity;
    this.fp.motionScale = s.cameraMotion;
    this.body.motionScale = s.cameraMotion;
    this.audio.setEnabled(s.sound);
  }

  // --------------------------------------------------------------------- loop

  private frame = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;

    if (this.phase === 'playing') {
      this.runMs += dt * 1000;
      this.input.sampleHeldKeys();
      this.accumulator = Math.min(this.accumulator + dt, 0.25);
      const step = MOVE.fixedDt;
      let guard = 0;
      let first = true;
      while (this.accumulator >= step && guard++ < 16) {
        this.controller.update(this.input.state, step);
        if (first) {
          this.input.clearEdges();
          first = false;
        }
        this.accumulator -= step;
        this.checkTriggers();
        if (this.phase !== 'playing') break;
      }
      if (this.phase === 'playing') {
        if (this.input.state.restartPressed) {
          this.input.state.restartPressed = false;
          this.respawn(true);
        }
        this.audio.setWind(clamp((this.controller.speedXZ - 4) / 8, 0, 1));
        this.audio.setSlide(this.controller.sliding);
      }
    } else {
      this.accumulator = 0;
      this.input.clearEdges();
      this.input.state.restartPressed = false;
    }

    this.renderTick(dt);
  };

  private checkTriggers(): void {
    const pos = this.controller.body.pos;
    const cp = this.cpTracker.check(pos);
    if (cp) {
      this.audio.event('checkpoint');
      this.hud.showCheckpointToast(cp.label);
      this.hud.setObjective(OBJECTIVES[Math.min(cp.id, OBJECTIVES.length - 1)]);
    }
    const hint = this.hintTracker.check(pos);
    if (hint) this.hud.showHint({ text: hint.text, sub: hint.sub });
    if (insideZone(this.data.finishZone, pos)) this.finishRun();
  }

  private renderTick(dt: number): void {
    this.visuals.update(this.elapsed);
    if (this.phase === 'menu') {
      // slow cinematic orbit over the start rooftop behind the menu
      this.body.group.visible = false;
      const t = this.elapsed * 0.11;
      this.fp.camera.position.set(Math.sin(t) * 12, 23.4, 15 + Math.cos(t) * 12);
      this.fp.camera.rotation.set(0, 0, 0);
      this.fp.camera.lookAt(0, 20.4, -4);
      this.city.followTarget({ x: 0, y: 20, z: 10 });
    } else {
      this.body.group.visible = true;
      this.fp.update(this.controller, dt);
      this.body.update(this.controller, dt, this.elapsed);
      this.city.followTarget(this.fp.camera.position);
      this.hud.setTimer(this.runMs);
      this.hud.setSpeed(this.controller.speedXZ * 3.6);
    }
    this.hud.update();

    // pass 1: world on layer 0 — pass 2: body on layer 1 with cleared depth,
    // so the player's arms/legs can never clip into level geometry
    const cam = this.fp.camera;
    this.renderer.autoClear = true;
    cam.layers.set(0);
    this.renderer.render(this.scene, cam);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    cam.layers.set(1);
    this.renderer.render(this.scene, cam);
    cam.layers.set(0);
    this.renderer.autoClear = true;
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.fp.resize(window.innerWidth / window.innerHeight);
  };

  private onVisibility = (): void => {
    if (document.hidden && this.phase === 'playing') this.pause();
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.input.dispose();
    this.visuals.dispose();
    this.city.dispose();
    this.body.dispose();
    this.audio.dispose();
    this.hud.dispose();
    this.menu.dispose();
    this.renderer.dispose();
  }
}
