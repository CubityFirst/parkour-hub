import './styles/main.css';
import { Game } from './game/Game.ts';

const host = document.getElementById('app');
if (!host) throw new Error('#app root element missing');

const game = new Game(host);

// full-page error surface so a crash is visible instead of a black screen
window.addEventListener('error', (e) => {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = `Something broke: ${e.message}`;
  document.body.appendChild(el);
  console.error(e.error ?? e.message);
});
void game;
