import './styles/main.css';
import { Game } from './game/Game';

const container = document.getElementById('game-container');
const uiRoot = document.getElementById('ui-root');

if (!container || !uiRoot) {
  throw new Error('Missing #game-container or #ui-root element.');
}

new Game(container, uiRoot);
