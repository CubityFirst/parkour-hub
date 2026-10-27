import * as THREE from 'three';
import { Input } from '../core/Input';
import { AudioManager } from '../audio/AudioManager';
import { FirstPersonCamera, FrameState } from '../player/FirstPersonCamera';
import { PlayerController } from '../player/PlayerController';
import { CollisionWorld } from '../world/CollisionWorld';
import { buildLevel, LevelData } from '../world/Level';
import { createEnvironment, EnvironmentRig, generateCity } from '../world/CityGenerator';
import { createMaterials, MaterialSet } from '../world/materials';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { GamePhase, loadBestTime, loadSettings, saveBestTime, saveSettings, Settings } from './GameState';

const PHYS_DT = 1 / 120; // fixed-timestep movement, independent of frame rate

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private world = new CollisionWorld();
  private materials: MaterialSet = createMaterials();
  private level: LevelData;
  private env: EnvironmentRig;

  private input: Input;
  private camRig: FirstPersonCamera;
  private controller: PlayerController;
  private audio = new AudioManager();
  private hud: HUD;
  private menu: Menu;
  private settings: Settings = loadSettings();

  private phase: GamePhase = 'menu';
  private timer = 0;
  private timerStarted = false;
  private best = loadBestTime();

  private lastT = performance.now();
  private acc = 0;
  private elapsed = 0;
  private menuTime = 0;

  constructor(gameRoot: HTMLElement, uiRoot: HTMLElement) {
    // ---------- renderer ----------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    gameRoot.appendChild(this.renderer.domElement);

    // ---------- world ----------
    this.env = createEnvironment(this.scene);
    this.level = buildLevel(this.scene, this.world, this.materials);
    generateCity(this.scene, this.materials);

    // ---------- player ----------
    this.camRig = new FirstPersonCamera(this.scene);
    this.input = new Input(this.renderer.domElement);
    this.controller = new PlayerController(this.input, this.world, {
      onFootstep: (i) => this.audio.footstep(i),
      onJump: () => this.audio.jump(),
      onLand: (f) => {
        this.audio.land(f);
        this.camRig.onLand(f);
      },
      onSlideStart: () => this.audio.setSliding(true),
      onSlideEnd: () => this.audio.setSliding(false),
      onVault: () => {
        this.audio.vault();
        this.camRig.onVault();
      },
      onMantle: () => {
        this.audio.vault();
        this.camRig.onVault();
      },
      onWallrunStart: () => this.audio.setWallrunning(true),
      onWallrunEnd: () => this.audio.setWallrunning(false),
      onWallJump: () => this.audio.jump(),
      onFirstInput: () => {
        this.timerStarted = true;
      },
    });
    this.controller.respawn(this.level.spawn.pos);
    this.camRig.resetView(this.level.spawn.yaw);
    this.camRig.setBodyVisible(false);

    // ---------- ui ----------
    this.hud = new HUD(uiRoot);
    this.menu = new Menu(uiRoot, this.settings, {
      onStart: () => {
        this.audio.init();
        this.audio.click();
        this.startRun();
      },
      onResume: () => {
        this.audio.click();
        this.input.requestLock();
      },
      onRestartRun: () => {
        this.audio.click();
        this.startRun();
      },
      onQuitToMenu: () => {
        this.audio.click();
        this.quitToMenu();
      },
      onSettingsChanged: (s) => saveSettings(s),
    });
    this.menu.showMain(this.best);

    // ---------- wiring ----------
    this.input.onLockChange = (locked) => {
      if (locked) {
        if (this.phase === 'paused') {
          this.phase = 'playing';
          this.menu.hideAll();
          this.hud.show();
        }
      } else if (this.phase === 'playing') {
        this.pauseGame();
      }
    };
    this.input.onKeyDown = (code) => {
      if (code === 'KeyR' && this.phase === 'playing') this.respawn();
    };
    this.renderer.domElement.addEventListener('click', () => {
      if (this.phase === 'paused') this.input.requestLock();
    });
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  /* ------------------------------ state changes ------------------------------ */

  private startRun(): void {
    this.level.checkpoints.reset();
    this.controller.respawn(this.level.spawn.pos);
    this.camRig.resetView(this.level.spawn.yaw);
    this.camRig.setBodyVisible(true);
    this.timer = 0;
    this.timerStarted = false;
    this.hud.setTime(0);
    this.hud.show();
    this.menu.hideAll();
    this.phase = 'playing';
    this.input.requestLock();
  }

  private pauseGame(): void {
    this.phase = 'paused';
    this.menu.showPause();
    this.hud.hide();
    this.audio.setWind(0);
    this.audio.setSliding(false);
    this.audio.setWallrunning(false);
  }

  private quitToMenu(): void {
    this.phase = 'menu';
    this.menu.showMain(this.best);
    this.hud.hide();
    this.camRig.setBodyVisible(false);
    this.input.exitLock();
    this.audio.setWind(0);
    this.audio.setSliding(false);
    this.audio.setWallrunning(false);
  }

  private finishRun(): void {
    this.phase = 'finished';
    this.input.exitLock();
    this.hud.hide();
    this.camRig.setBodyVisible(false);
    this.audio.finish();
    this.audio.setWind(0);
    this.audio.setSliding(false);
    this.audio.setWallrunning(false);
    const t = this.timer;
    const isBest = this.best === null || t < this.best;
    if (isBest) {
      this.best = t;
      saveBestTime(t);
    }
    this.menu.showFinish(t, this.best ?? t, isBest);
  }

  private respawn(): void {
    const t = this.level.checkpoints.respawnTarget();
    this.controller.respawn(t.pos);
    this.camRig.resetView(t.yaw);
    this.hud.flash();
    this.audio.respawn();
    this.audio.setSliding(false);
    this.audio.setWallrunning(false);
  }

  /* ------------------------------ per-frame logic ------------------------------ */

  private frameState(): FrameState {
    const c = this.controller;
    const scr = c.parkour.scripted;
    return {
      pos: c.body.pos,
      vel: c.body.vel,
      grounded: c.body.grounded,
      sliding: c.sliding,
      sprinting: c.sprinting,
      strafe: c.strafeInput,
      wallrunSide: c.parkour.wallrun.active ? c.parkour.wallrun.side : 0,
      vaultT: scr?.kind === 'vault' ? scr.t / scr.dur : -1,
      mantleT: scr?.kind === 'mantle' ? scr.t / scr.dur : -1,
    };
  }

  private checkZones(): void {
    const p = this.controller.body.pos;
    if (p.y < this.level.killY) {
      this.respawn();
      return;
    }
    const cp = this.level.checkpoints.check(p);
    if (cp) {
      this.hud.toast('CHECKPOINT');
      this.audio.checkpoint();
    }
    const f = this.level.finish;
    if (
      p.x > f.min.x && p.x < f.max.x &&
      p.y > f.min.y && p.y < f.max.y &&
      p.z > f.min.z && p.z < f.max.z
    ) {
      this.finishRun();
      return;
    }
    // contextual hints (zones first, vault probe near the crosshair second)
    let hint: string | null = null;
    for (const h of this.level.hints) {
      if (
        p.x > h.min.x && p.x < h.max.x &&
        p.y > h.min.y && p.y < h.max.y &&
        p.z > h.min.z && p.z < h.max.z
      ) {
        hint = h.text;
        break;
      }
    }
    this.hud.setHint(hint);
    const yaw = this.camRig.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.hud.setVaultHint(
      !hint && this.controller.body.grounded && this.controller.parkour.canVault(this.controller.body, this.world, fwd),
    );
  }

  private frame = (): void => {
    requestAnimationFrame(this.frame);
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.1) dt = 0.1;
    this.elapsed += dt;

    if (this.phase === 'playing') {
      this.acc += dt;
      while (this.acc >= PHYS_DT) {
        this.controller.fixedUpdate(PHYS_DT, this.camRig.yaw);
        this.acc -= PHYS_DT;
      }
      if (this.timerStarted) this.timer += dt;
      this.hud.setTime(this.timer);
      this.checkZones();

      const v = this.controller.body.vel;
      const hs = Math.hypot(v.x, v.z);
      this.audio.setWind(Math.min(1, hs / 10.5) * (this.controller.body.grounded ? 1 : 0.75));

      const [dx, dy] = this.input.consumeMouse();
      this.camRig.look(dx, dy, this.settings.sensitivity);
      this.camRig.update(dt, this.frameState(), this.settings.cameraMotion === 'reduced' ? 0.35 : 1);
      this.env.update(this.controller.body.pos);
    } else if (this.phase === 'menu') {
      // slow cinematic orbit behind the menu
      this.menuTime += dt;
      const t = this.menuTime * 0.045;
      const cam = this.camRig.camera;
      cam.position.set(Math.sin(t) * 52, 30 + Math.sin(t * 0.7) * 8, 110 + Math.cos(t) * 52);
      cam.lookAt(0, -4, 110);
      if (cam.fov !== 60) {
        cam.fov = 60;
        cam.updateProjectionMatrix();
      }
      this.env.update(cam.position);
    } else {
      this.input.consumeMouse();
    }

    this.level.checkpoints.update(this.elapsed);
    this.renderer.render(this.scene, this.camRig.camera);
    this.input.endFrame();
  };

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camRig.camera.aspect = window.innerWidth / window.innerHeight;
    this.camRig.camera.updateProjectionMatrix();
  }
}
