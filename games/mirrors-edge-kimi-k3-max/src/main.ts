import './styles/main.css';
import { Game } from './game/Game';

const gameRoot = document.getElementById('game');
const uiRoot = document.getElementById('ui');
if (!gameRoot || !uiRoot) throw new Error('Missing #game / #ui root elements');

const game = new Game(gameRoot, uiRoot);
game.start();

// handy for debugging in the browser console
(window as unknown as { __game: Game }).__game = game;
