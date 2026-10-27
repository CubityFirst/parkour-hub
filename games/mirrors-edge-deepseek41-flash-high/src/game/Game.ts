import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { Input } from '../input/Input';
import { FirstPersonCamera } from '../player/FirstPersonCamera';
import { PlayerBody } from '../player/PlayerBody';
import { PlayerController } from '../player/PlayerController';
import { CityGenerator } from '../world/CityGenerator';
import { Environment } from '../world/Environment';
import { Level } from '../world/Level';
import { Materials } from '../world/Materials';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { GamePhase, GameState } from './GameState';

const FIXED_DT = 1 / 120;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly materials: Materials;
  readonly environment: Environment;
  readonly level: Level;
  readonly cameraRig: FirstPersonCamera;
  readonly player: PlayerController;
  readonly playerBody: PlayerBody;
  readonly input: Input;
  readonly audio = new AudioManager();
  readonly hud = new HUD();
  readonly state = new GameState();
  readonly menu: Menu;

  private accumulator = 0;
  private lastTime = 0;
  private menuTime = 0;
  private respawnCooldown = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0xdcecf7);

    this.materials = new Materials();
    this.environment = new Environment(this.scene, this.renderer);
    this.level = new Level(this.scene, this.materials);
    new CityGenerator(this.scene, this.materials).build();

    this.cameraRig = new FirstPersonCamera(window.innerWidth / window.innerHeight);
    this.scene.add(this.cameraRig.camera);
    this.playerBody = new PlayerBody(this.cameraRig.camera);
    this.player = new PlayerController(this.level.collision, this.cameraRig);
    this.input = new Input(canvas);

    this.menu = new Menu({
      onStart: () => this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onQuit: () => this.quitToMenu(),
      onSettingsChange: (settings) => this.applySettings(settings),
    });

    this.applySettings(this.menu.settings);
    this.hud.setBest(this.state.best);
    this.menu.showMain(this.state.best);
    this.player.reset(this.level.start, this.level.startYaw);
    this.cameraRig.setYaw(this.level.startYaw);

    this.input.onLockChange = (locked) => {
      if (!locked && this.state.phase === GamePhase.Playing) {
        this.pause();
      }
    };

    document.addEventListener('pointerlockerror', () => {
      // Not fatal: the click-to-lock fallback on the canvas will retry.
    });

    canvas.addEventListener('click', () => {
      if (this.state.phase === GamePhase.Playing && !this.input.locked) {
        this.input.requestLock();
      }
    });

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.state.phase === GamePhase.Playing) {
        this.pause();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state.phase === GamePhase.Playing) this.pause();
    });

    this.onResize();
    this.lastTime = performance.now();
    requestAnimationFrame(this.tick);
  }

  private applySettings(settings: { sensitivity: number; reduceMotion: boolean }): void {
    this.input.sensitivity = settings.sensitivity;
    this.cameraRig.sensitivity = settings.sensitivity;
    this.cameraRig.reduceMotion = settings.reduceMotion;
  }

  // ------------------------------------------------------------------- flow

  startRun(): void {
    this.audio.unlock();
    this.audio.uiClick();
    this.audio.setPaused(false);

    this.state.phase = GamePhase.Playing;
    this.state.resetRun();
    this.level.checkpoints.reset();
    this.player.reset(this.level.start, this.level.startYaw);
    this.cameraRig.setYaw(this.level.startYaw);
    this.cameraRig.camera.fov = 79;
    this.cameraRig.camera.updateProjectionMatrix();
    this.accumulator = 0;
    this.respawnCooldown = 0;

    this.menu.hideAll();
    this.hud.resetTransient();
    this.hud.show();
    this.playerBody.setVisible(true);
    this.hud.setCheckpoint(0, this.level.checkpoints.count);
    this.hud.setTimer(0);
    this.hud.setBest(this.state.best);
    this.hud.flash();

    this.input.reset();
    this.input.requestLock();
    this.lastTime = performance.now();
  }

  pause(): void {
    if (this.state.phase !== GamePhase.Playing) return;
    this.state.phase = GamePhase.Paused;
    this.input.releaseLock();
    this.menu.showPause(this.state.elapsed, this.state.checkpoint, this.level.checkpoints.count);
    this.hud.hide();
    this.playerBody.setVisible(false);
    this.audio.setPaused(true);
    this.audio.uiClick();
  }

  resume(): void {
    if (this.state.phase !== GamePhase.Paused) return;
    this.audio.unlock();
    this.state.phase = GamePhase.Playing;
    this.menu.hideAll();
    this.hud.show();
    this.playerBody.setVisible(true);
    this.audio.setPaused(false);
    this.audio.uiClick();
    this.input.requestLock();
    this.accumulator = 0;
    this.lastTime = performance.now();
  }

  quitToMenu(): void {
    this.state.phase = GamePhase.Menu;
    this.state.resetRun();
    this.level.checkpoints.reset();
    this.player.reset(this.level.start, this.level.startYaw);
    this.input.releaseLock();
    this.input.reset();
    this.audio.setPaused(true);
    this.audio.uiClick();
    this.hud.hide();
    this.hud.resetTransient();
    this.playerBody.setVisible(false);
    this.hud.setBest(this.state.best);
    this.menu.showMain(this.state.best);
    this.menuTime = 0;
  }

  private complete(): void {
    if (this.state.phase !== GamePhase.Playing) return;
    const result = this.state.completeRun();
    this.state.phase = GamePhase.Finished;
    this.player.velocity.set(0, 0, 0);
    this.input.releaseLock();
    this.hud.hide();
    this.hud.setBest(this.state.best);
    this.playerBody.setVisible(false);
    this.audio.setPaused(true);
    this.audio.finish();
    this.menu.showFinish(
      result.time,
      this.state.best,
      result.isBest,
      this.state.checkpoint,
      this.level.checkpoints.count,
    );
  }

  private respawn(): void {
    if (this.respawnCooldown > 0) return;
    this.respawnCooldown = 0.35;
    const pos = this.level.checkpoints.spawnPosition;
    this.player.reset(pos, this.level.checkpoints.spawnYaw);
    this.cameraRig.yaw = this.level.checkpoints.spawnYaw;
    this.cameraRig.pitch = 0;
    this.hud.flash();
    this.accumulator = 0;
  }

  // ------------------------------------------------------------------- loop

  private tick = (now: number): void => {
    requestAnimationFrame(this.tick);

    const dtRaw = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(dtRaw, 0), 0.05);

    this.respawnCooldown = Math.max(0, this.respawnCooldown - dt);

    if (this.state.phase === GamePhase.Playing) {
      this.updatePlaying(dt);
    } else if (this.state.phase === GamePhase.Menu) {
      this.updateMenuCamera(dt);
    } else if (this.state.phase === GamePhase.Finished) {
      this.updateFinishCamera(dt);
    }

    const camera = this.cameraRig.camera;
    this.environment.update(camera.position);
    this.level.update(dt, now / 1000);
    this.audio.update(this.player.speed, this.player.sliding, this.player.grounded);
    this.hud.update(dt);
    this.renderer.render(this.scene, camera);
  };

  private updatePlaying(dt: number): void {
    // Look first so the physics steps use this frame's yaw.
    const mouse = this.input.consumeMouse();
    if (this.input.locked) this.cameraRig.look(mouse.dx, mouse.dy);

    if (this.input.wasPressed('KeyR')) {
      this.respawn();
    }

    if (!this.state.timerRunning) {
      const moving =
        this.input.anyDown('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space');
      if (moving) this.state.timerRunning = true;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 10) {
      this.player.update(FIXED_DT, this.input, this.cameraRig.yaw);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps > 0) this.input.endFrame();

    const events = this.player.consumeEvents();
    if (events.footstep > 0) {
      this.audio.footstep(this.player.sprinting);
      if (events.footstep > 1) this.audio.footstep(this.player.sprinting);
    }
    if (events.jumped) this.audio.jump();
    if (events.landed > 1.2) this.audio.land(events.landed);
    if (events.wallRunStarted) this.audio.wallRunStart();
    if (events.wallJumped) this.audio.wallJump();
    if (events.vaulted) this.audio.vault();
    if (events.mantled) this.audio.vault();

    this.state.update(dt);

    // Camera follows the simulated position.
    this.cameraRig.update(dt, this.player.position, {
      speed: this.player.speed,
      grounded: this.player.grounded,
      sliding: this.player.sliding,
      wallRunning: this.player.wallRunning,
      wallSide: this.player.wallSide,
      vaulting: this.player.parkour.isVaulting,
      mantling: this.player.parkour.isMantling,
      sprinting: this.player.sprinting,
      strafe: this.player.strafeInput,
      forward: this.player.forwardInput,
    });

    this.playerBody.update(dt, this.player, this.cameraRig.reduceMotion);

    this.hud.setTimer(this.state.elapsed);
    this.hud.setMovement(this.player.speed, this.movementLabel());

    this.checkTriggers();
  }

  private movementLabel(): string {
    if (this.player.wallRunning) return 'WALL RUN';
    if (this.player.parkour.isVaulting) return 'VAULT';
    if (this.player.parkour.isMantling) return 'MANTLE';
    if (this.player.sliding) return 'SLIDE';
    if (!this.player.grounded) return 'AIRBORNE';
    if (this.player.speed > 8.2) return 'SPRINT';
    if (this.player.speed > 1.1) return 'RUN';
    return 'ON FOOT';
  }

  private checkTriggers(): void {
    const p = this.player.position;

    for (const hint of this.level.hints) {
      if (hint.shown) continue;
      if (
        p.x >= hint.minX &&
        p.x <= hint.maxX &&
        p.z >= hint.minZ &&
        p.z <= hint.maxZ &&
        p.y >= hint.minY &&
        p.y <= hint.maxY
      ) {
        hint.shown = true;
        this.hud.showHint(hint.text, 4.4);
      }
    }

    for (const section of this.level.sections) {
      if (section.shown) continue;
      if (p.z >= section.minZ && p.z <= section.maxZ) {
        section.shown = true;
        this.hud.showSection(section.label);
      }
    }

    const checkpoint = this.level.checkpoints.check(p.x, p.y, p.z);
    if (checkpoint) {
      this.level.checkpoints.activate(checkpoint.index);
      this.state.checkpoint = checkpoint.index;
      this.hud.setCheckpoint(checkpoint.index, this.level.checkpoints.count);
      this.hud.showCheckpoint(checkpoint.index);
      this.audio.checkpoint();
    }

    // Falling off the rooftops: return to the last checkpoint.
    if (p.y < -14) {
      this.hud.showHint('Back on the line', 2.0);
      this.respawn();
    }

    if (
      p.x >= this.level.finishMinX &&
      p.x <= this.level.finishMaxX &&
      p.z >= this.level.finishMinZ &&
      p.z <= this.level.finishMaxZ &&
      p.y >= this.level.finishY - 0.5 &&
      p.y <= this.level.finishY + 4.2
    ) {
      this.complete();
    }
  }

  private updateMenuCamera(dt: number): void {
    this.menuTime += dt;
    const cam = this.cameraRig.camera;
    cam.fov = 70;
    cam.updateProjectionMatrix();

    const yaw = Math.PI - 0.02 + Math.sin(this.menuTime * 0.11) * 0.03;
    const pitch = -0.075 + Math.sin(this.menuTime * 0.09) * 0.012;
    cam.position.set(4.4, 3.5, -13.4);
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  private updateFinishCamera(dt: number): void {
    this.menuTime += dt;
    const cam = this.cameraRig.camera;
    // Hold on the finish gate with a very slow settle.
    const yaw = Math.PI + Math.sin(this.menuTime * 0.2) * 0.02;
    cam.rotation.set(-0.02, yaw, 0, 'YXZ');
    this.cameraRig.update(dt, this.player.position, {
      speed: 0,
      grounded: true,
      sliding: false,
      wallRunning: false,
      wallSide: 0,
      vaulting: false,
      mantling: false,
      sprinting: false,
      strafe: 0,
      forward: 0,
    });
    cam.rotation.set(-0.02, yaw, 0, 'YXZ');
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.cameraRig.camera.aspect = width / height;
    this.cameraRig.camera.updateProjectionMatrix();
  }

  /**
   * Deterministic headless simulation used by the development smoke tests.
   * Runs the real controller/physics without waiting for animation frames.
   */
  simulate(seconds: number, keys: string[], yaw = this.cameraRig.yaw): Record<string, unknown> {
    const pressed = new Set(keys);
    const down = new Set(keys);
    const fake = {
      sensitivity: 1,
      locked: false,
      isDown: (code: string) => down.has(code),
      anyDown: (...codes: string[]) => codes.some((code) => down.has(code)),
      wasPressed: (code: string) => {
        if (!pressed.has(code)) return false;
        pressed.delete(code);
        return true;
      },
      consumeMouse: () => ({ dx: 0, dy: 0 }),
      endFrame: () => pressed.clear(),
      reset: () => {
        down.clear();
        pressed.clear();
      },
      requestLock: () => undefined,
      releaseLock: () => undefined,
      dispose: () => undefined,
    } as unknown as Input;

    const phase = this.state.phase;
    this.state.phase = GamePhase.Paused;
    const steps = Math.floor(seconds / FIXED_DT);
    let landed = 0;
    let maxZ = this.player.position.z;
    const trace: Array<Array<number | boolean | string>> = [];
    for (let i = 0; i < steps; i++) {
      this.player.update(FIXED_DT, fake, yaw);
      maxZ = Math.max(maxZ, this.player.position.z);
      const events = this.player.consumeEvents();
      if (events.landed > landed) landed = events.landed;
      if (i % 12 === 0) {
        trace.push([
          Number(this.player.position.x.toFixed(2)),
          Number(this.player.position.y.toFixed(2)),
          Number(this.player.position.z.toFixed(2)),
          Number(this.player.speed.toFixed(1)),
          this.player.grounded,
          this.player.wallRunning,
          this.player.sliding,
        ]);
      }
    }
    this.state.phase = phase;
    this.cameraRig.yaw = yaw;
    this.cameraRig.update(0.016, this.player.position, {
      speed: this.player.speed,
      grounded: this.player.grounded,
      sliding: this.player.sliding,
      wallRunning: this.player.wallRunning,
      wallSide: this.player.wallSide,
      vaulting: this.player.parkour.isVaulting,
      mantling: this.player.parkour.isMantling,
      sprinting: this.player.sprinting,
      strafe: 0,
      forward: 1,
    });

    return {
      x: Number(this.player.position.x.toFixed(3)),
      y: Number(this.player.position.y.toFixed(3)),
      z: Number(this.player.position.z.toFixed(3)),
      vx: Number(this.player.velocity.x.toFixed(3)),
      vy: Number(this.player.velocity.y.toFixed(3)),
      vz: Number(this.player.velocity.z.toFixed(3)),
      maxZ: Number(maxZ.toFixed(3)),
      grounded: this.player.grounded,
      sliding: this.player.sliding,
      wallRunning: this.player.wallRunning,
      landed: Number(landed.toFixed(2)),
      speed: Number(this.player.speed.toFixed(2)),
      checkpoint: this.state.checkpoint,
      trace,
    };
  }
}
