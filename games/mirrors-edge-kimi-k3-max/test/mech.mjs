// Mechanics test: wall run, vault, slide-under-duct, fall respawn, finish.
// Teleports the player to each challenge via the debug handle and checks state.
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error('No Chrome/Edge binary found');

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
  if (!ok) failed = true;
};

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  await page.click('[data-a="start"]');
  await sleep(600);

  const tp = (x, y, z, vx, vy, vz, grounded = false) =>
    page.evaluate(
      ({ x, y, z, vx, vy, vz, grounded }) => {
        const b = window.__game.controller.body;
        b.pos.set(x, y, z);
        b.vel.set(vx, vy, vz);
        b.grounded = grounded;
      },
      { x, y, z, vx, vy, vz, grounded },
    );
  const state = () =>
    page.evaluate(() => {
      const g = window.__game;
      const b = g.controller.body;
      return {
        phase: g.phase,
        x: b.pos.x,
        y: b.pos.y,
        z: b.pos.z,
        grounded: b.grounded,
        sliding: g.controller.sliding,
        wallrun: g.controller.parkour.wallrun.active,
        wallrunSide: g.controller.parkour.wallrun.side,
        scripted: g.controller.parkour.scripted ? g.controller.parkour.scripted.kind : null,
        checkpoint: g.level.checkpoints.current,
      };
    });

  // ---------- 1. WALL RUN (section 4, wall on the player's left, 10.5 m gap) ----------
  await tp(4.0, -1.4, 97.2, 0, 2.5, 9.5);
  await sleep(350);
  let s = await state();
  check('wallrun attaches', s.wallrun === true && s.wallrunSide === -1, `side=${s.wallrunSide}`);
  await page.screenshot({ path: 'test/shot-6-wallrun.png' });
  await sleep(1900);
  s = await state();
  check(
    'wallrun crosses the gap and lands',
    !s.wallrun && s.grounded && s.z > 106.5 && s.z < 119 && Math.abs(s.y + 1.5) < 0.06,
    `z=${s.z.toFixed(1)} y=${s.y.toFixed(2)} grounded=${s.grounded}`,
  );

  // ---------- 2. VAULT (section 1 vent) ----------
  await tp(0, 0, 0.6, 0, 0, 6, true);
  await sleep(60);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })));
  await sleep(150);
  s = await state();
  const sawVault = s.scripted === 'vault' || s.z > 1.95;
  await sleep(650);
  s = await state();
  check('vault clears the vent', sawVault && s.z > 2.9 && s.grounded, `z=${s.z.toFixed(2)}`);

  // ---------- 3. SLIDE UNDER DUCT (section 3) ----------
  await tp(0, -1, 63.5, 0, 0, 9, true);
  await page.keyboard.down('ControlLeft');
  await sleep(250);
  s = await state();
  check('slide starts at speed', s.sliding === true);
  await sleep(1400);
  s = await state();
  await page.keyboard.up('ControlLeft');
  check('slides under the first duct', s.z > 67.6 && s.grounded, `z=${s.z.toFixed(1)} y=${s.y.toFixed(2)}`);

  // ---------- 4. FALL RESPAWN (slide test activated checkpoint 2 at z=64) ----------
  await tp(0, -30, 40, 0, -5, 0);
  await sleep(400);
  s = await state();
  check(
    'falling respawns at latest checkpoint',
    s.grounded && Math.abs(s.x) < 0.01 && s.y === -1 && s.z === 64 && s.checkpoint === 2,
    `pos=(${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)}) cp=${s.checkpoint}`,
  );

  // ---------- 5. FINISH ----------
  await tp(0, -2, 208.5, 0, 0, 8, true);
  await page.keyboard.down('KeyW'); // friction stops a keyless player
  await sleep(2200);
  await page.keyboard.up('KeyW');
  s = await state();
  const finishVisible = await page.evaluate(
    () => !document.querySelector('.finish-screen')?.classList.contains('hidden'),
  );
  check('finish line completes the level', s.phase === 'finished' && finishVisible, `phase=${s.phase}`);
  await page.screenshot({ path: 'test/shot-5-finish.png' });

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(failed ? 'MECH FAIL' : 'MECH OK');
process.exitCode = failed ? 1 : 0;
