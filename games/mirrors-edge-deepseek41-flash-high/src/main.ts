import './styles/main.css';
import * as THREE from 'three';
import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas element not found');

const game = new Game(canvas);

/**
 * Small debug surface used by automated smoke tests.  It is harmless in
 * production and very useful when checking the course from different points.
 */
interface RooftopDebug {
  start: () => void;
  teleport: (x: number, y: number, z: number, yaw?: number) => void;
  getState: () => Record<string, unknown>;
  sim: (seconds: number, keys: string[], yaw?: number) => Record<string, unknown>;
  THREE: typeof THREE;
  game: Game;
}

declare global {
  interface Window {
    __rooftop?: RooftopDebug;
  }
}

if (import.meta.env.DEV) {
  // Tuning surface: teleport around the course and run deterministic physics
  // simulations without waiting for frames.  Production builds omit it.
  window.__rooftop = {
    start: () => game.startRun(),
    game,
    teleport: (x, y, z, yaw = Math.PI) => {
      game.player.reset(new THREE.Vector3(x, y, z), yaw);
      game.cameraRig.yaw = yaw;
      game.cameraRig.pitch = 0;
      game.state.timerRunning = true;
    },
    sim: (seconds, keys, yaw) => game.simulate(seconds, keys, yaw),
    THREE,
    getState: () => ({
      phase: game.state.phase,
      elapsed: game.state.elapsed,
      checkpoint: game.state.checkpoint,
      position: {
        x: game.player.position.x,
        y: game.player.position.y,
        z: game.player.position.z,
      },
      speed: game.player.speed,
      grounded: game.player.grounded,
      wallRunning: game.player.wallRunning,
      sliding: game.player.sliding,
      best: game.state.best,
    }),
  };
}
