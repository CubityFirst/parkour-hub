import * as THREE from "three";
import { AudioManager } from "../audio/AudioManager";
import { PlayerController } from "../player/PlayerController";
import { Level } from "../world/Level";

type GameMode = "menu" | "running" | "paused" | "finished";

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 900);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  private readonly audio = new AudioManager();
  private readonly canvasHost = document.getElementById("game-canvas") as HTMLDivElement;
  private readonly level: Level;
  private readonly player: PlayerController;
  private mode: GameMode = "menu";
  private reducedMotion = false;
  private elapsed = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private simulationTime = 0;
  private currentCheckpoint = 0;
  private noticeUntil = 0;
  private lastHudUpdate = 0;
  private readonly fixedStep = 1 / 120;
  private readonly backgroundBuildings: THREE.Group[] = [];
  private hud!: HTMLElement;
  private timerElement!: HTMLElement;
  private hintElement!: HTMLElement;
  private actionElement!: HTMLElement;
  private toastElement!: HTMLElement;
  private pauseScreen!: HTMLElement;
  private menuScreen!: HTMLElement;
  private finishScreen!: HTMLElement;

  constructor() {
    if (!this.canvasHost) throw new Error("Missing #game-canvas mount point.");
    this.configureRenderer();
    this.scene.background = new THREE.Color(0xb8def2);
    this.scene.fog = new THREE.Fog(0xb8def2, 130, 620);
    this.camera.position.set(0, 1.6, 42);
    this.canvasHost.appendChild(this.renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(0xe7f7ff, 0x8c9da2, 2.25);
    this.scene.add(hemisphere);
    const sunlight = new THREE.DirectionalLight(0xfff7e9, 3.25);
    sunlight.position.set(-55, 105, 55);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -100;
    sunlight.shadow.camera.right = 100;
    sunlight.shadow.camera.top = 160;
    sunlight.shadow.camera.bottom = -460;
    sunlight.shadow.camera.near = 1;
    sunlight.shadow.camera.far = 360;
    sunlight.shadow.bias = -0.00025;
    sunlight.shadow.normalBias = 0.035;
    sunlight.shadow.radius = 4;
    this.scene.add(sunlight);
    this.scene.add(sunlight.target);

    this.level = new Level(this.scene);
    this.player = new PlayerController(this.camera, this.renderer.domElement, this.level);
    this.player.setAudioCallbacks({
      jump: () => this.audio.jump(),
      land: () => this.audio.land(),
      vault: () => this.audio.vault(),
      step: () => this.audio.step(),
      slide: () => this.audio.slide(),
    });
    this.initializeUI();
    this.addAtmosphere();
    window.addEventListener("resize", this.onResize);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  start(): void {
    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);
    window.setTimeout(() => document.getElementById("loading")?.classList.add("done"), 280);
  }

  private configureRenderer(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private addAtmosphere(): void {
    // A soft sun disk and a few high cloud layers keep the course open and readable.
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(8, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xfff5d9, fog: false }),
    );
    sun.position.set(-115, 126, -245);
    this.scene.add(sun);

    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      fog: false,
    });
    for (let i = 0; i < 18; i++) {
      const cloud = new THREE.Group();
      const pieces = 3 + (i % 4);
      for (let p = 0; p < pieces; p++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(1, 10, 8),
          cloudMaterial,
        );
        puff.scale.set(8 + (p % 2) * 6, 1.6 + (p % 3) * 0.35, 2.3 + (p % 2));
        puff.position.set(p * 5.2 - pieces * 2.5, (p % 2) * 0.45, Math.sin(p * 1.3) * 1.8);
        cloud.add(puff);
      }
      cloud.position.set((i % 6) * 38 - 95, 68 + (i % 3) * 12, 35 - Math.floor(i / 6) * 190);
      cloud.rotation.y = (i % 2) * 0.24;
      this.scene.add(cloud);
      this.backgroundBuildings.push(cloud);
    }
  }

  private initializeUI(): void {
    const get = (id: string): HTMLElement => {
      const element = document.getElementById(id);
      if (!element) throw new Error("Missing UI element #" + id);
      return element;
    };
    this.hud = get("hud");
    this.timerElement = get("timer");
    this.hintElement = get("run-hint");
    this.actionElement = get("action-readout");
    this.toastElement = get("checkpoint-toast");
    this.pauseScreen = get("pause-screen");
    this.menuScreen = get("menu");
    this.finishScreen = get("finish-screen");

    get("start-button").addEventListener("click", () => {
      void this.audio.start();
      this.beginRun();
      void this.renderer.domElement.requestPointerLock();
    });
    get("controls-button").addEventListener("click", () => {
      get("controls-panel").classList.toggle("is-hidden");
    });
    get("resume-button").addEventListener("click", () => {
      this.mode = "running";
      this.pauseScreen.classList.add("is-hidden");
      this.hud.classList.remove("is-hidden");
      void this.renderer.domElement.requestPointerLock();
      void this.audio.start();
    });
    get("restart-button").addEventListener("click", () => {
      this.respawnAtCheckpoint();
      this.mode = "running";
      this.pauseScreen.classList.add("is-hidden");
      this.hud.classList.remove("is-hidden");
      void this.renderer.domElement.requestPointerLock();
    });
    get("finish-restart-button").addEventListener("click", () => {
      this.beginRun();
      void this.renderer.domElement.requestPointerLock();
    });
    const sensitivity = get("sensitivity") as HTMLInputElement;
    this.player.setSensitivity(Number(sensitivity.value) * 0.00215);
    sensitivity.addEventListener("input", () => this.player.setSensitivity(Number(sensitivity.value) * 0.00215));
    const reduceMotion = get("reduced-motion") as HTMLInputElement;
    reduceMotion.addEventListener("change", () => {
      this.reducedMotion = reduceMotion.checked;
    });
  }

  private beginRun(): void {
    this.elapsed = 0;
    this.currentCheckpoint = 0;
    this.player.respawn(0, 0, 42);
    this.mode = "running";
    this.menuScreen.classList.add("is-hidden");
    this.pauseScreen.classList.add("is-hidden");
    this.finishScreen.classList.add("is-hidden");
    this.hud.classList.remove("is-hidden");
    this.setHint("WASD MOVE     SHIFT SPRINT     SPACE JUMP");
    this.updateTimer();
    void this.audio.start();
  }

  private readonly onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private readonly onPointerLockChange = (): void => {
    if (this.mode === "running" && document.pointerLockElement !== this.renderer.domElement) {
      this.mode = "paused";
      this.pauseScreen.classList.remove("is-hidden");
      this.hud.classList.add("is-hidden");
      this.updateText("pause-time", this.formatTime(this.elapsed));
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.mode === "running" && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  };

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.mode === "running") {
      this.elapsed += dt;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= this.fixedStep && steps < 8) {
        this.player.step(this.fixedStep);
        this.accumulator -= this.fixedStep;
        this.simulationTime += this.fixedStep;
        steps++;
      }
      this.accumulator = Math.min(this.accumulator, this.fixedStep * 2);
      this.updateRun(dt);
    }
    this.player.updateCamera(Math.max(dt, 1 / 120), this.reducedMotion);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };

  private updateRun(dt: number): void {
    if (this.player.consumeResetRequest()) this.respawnAtCheckpoint();
    const position = this.player.position;
    if (position.y < -18) {
      this.respawnAtCheckpoint();
      this.showToast("CHECKPOINT RESTORED");
    }
    const checkpoint = this.level.checkpointAt(position.x, position.z);
    if (checkpoint && checkpoint.id > this.currentCheckpoint) {
      this.currentCheckpoint = checkpoint.id;
      this.showToast("CHECKPOINT // " + checkpoint.title);
      this.audio.checkpoint();
    }
    if (position.z <= this.level.finishZ && Math.abs(position.x - this.level.finishX) < 6) {
      this.completeRun();
      return;
    }

    this.audio.setWind(this.player.getHorizontalSpeed(), this.player.currentAction === "SPRINT");
    this.updateHint();
    if (this.simulationTime - this.lastHudUpdate > 0.06) {
      this.lastHudUpdate = this.simulationTime;
      this.updateTimer();
      const action = this.player.currentAction;
      if (action === "RUN" || action === "SPRINT") {
        this.actionElement.classList.remove("visible");
      } else {
        this.actionElement.textContent = action;
        this.actionElement.classList.add("visible");
      }
      if (this.simulationTime > this.noticeUntil) this.toastElement.classList.remove("visible");
    }
    void dt;
  }

  private updateHint(): void {
    const z = this.player.position.z;
    let hint = "WASD MOVE     SHIFT SPRINT     SPACE JUMP";
    if (z > -10) hint = "E VAULT OVER THE RED SERVICE BLOCKS";
    else if (z > -109) hint = "SPRINT TO THE RED EDGE MARKERS, THEN JUMP";
    else if (z > -153) hint = "CTRL / C SLIDE UNDER THE RED SERVICE GATES";
    else if (z > -181) hint = "JUMP BESIDE THE RED WALL  ·  SPACE KICKS AWAY";
    else if (z > -252) hint = "LAND CLEAN, THEN VAULT THE RED ROOF BLOCK";
    else if (z > -292) hint = "E VAULT THE RED BLOCK  ·  KEEP YOUR MOMENTUM";
    else if (z > -359) hint = "LINK YOUR JUMPS TO THE NEXT ROOFTOP";
    else hint = "FINAL SPRINT  ·  CROSS THE RED FINISH GATE";
    if (this.player.isWallRunning) hint = "WALL RUN  ·  PRESS SPACE TO KICK AWAY";
    else if (this.player.isSliding) hint = "SLIDE  ·  HOLD YOUR LINE";
    this.setHint(hint);
  }

  private setHint(value: string): void {
    if (this.hintElement.textContent !== value) this.hintElement.textContent = value;
  }

  private showToast(text: string): void {
    this.toastElement.textContent = text;
    this.toastElement.classList.add("visible");
    this.noticeUntil = this.simulationTime + 2.2;
  }

  private respawnAtCheckpoint(): void {
    const checkpoint = this.level.checkpoints[this.currentCheckpoint];
    this.player.respawn(checkpoint.x, checkpoint.y, checkpoint.z + 1.3);
    this.accumulator = 0;
  }

  private completeRun(): void {
    this.mode = "finished";
    this.hud.classList.add("is-hidden");
    this.finishScreen.classList.remove("is-hidden");
    document.exitPointerLock?.();
    this.audio.setWind(0, false);
    this.audio.finish();
    const time = this.formatTime(this.elapsed);
    this.updateText("finish-time", time);
    const key = "rooftop-flow-best";
    const previous = Number(localStorage.getItem(key));
    const best = !Number.isFinite(previous) || previous <= 0 ? this.elapsed : Math.min(previous, this.elapsed);
    localStorage.setItem(key, String(best));
    this.updateText("best-time", this.formatTime(best));
  }

  private updateTimer(): void {
    this.timerElement.textContent = this.formatTime(this.elapsed);
  }

  private updateText(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds - minutes * 60;
    return minutes + ":" + remaining.toFixed(2).padStart(5, "0");
  }
}

