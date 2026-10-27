import './styles/main.css';
import { Game } from './game/Game';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const app = document.getElementById('app')!;
if (!webglAvailable()) {
  const msg = document.createElement('div');
  msg.className = 'unsupported';
  msg.textContent = 'ROOFTOP FLOW needs a browser with WebGL 2 enabled (recent Chrome, Edge or Firefox on desktop).';
  document.body.appendChild(msg);
} else {
  const game = new Game(app);
  game.init().catch((err) => {
    console.error(err);
    const msg = document.createElement('div');
    msg.className = 'unsupported';
    msg.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
    document.body.appendChild(msg);
  });
}
