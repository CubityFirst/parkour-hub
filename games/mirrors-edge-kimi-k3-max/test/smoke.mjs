// Headless smoke test: menu loads → Start Run → player stands on the first
// roof → WASD movement and jumping work. Uses the system Chrome/Edge binary.
// Run with the dev server active:  node test/smoke.mjs
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
const fail = (msg) => {
  console.error('SMOKE FAIL: ' + msg);
  process.exitCode = 1;
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
  await sleep(1500);

  // 1. menu loads
  const hasGame = await page.evaluate(() => Boolean(window.__game));
  const menuVisible = await page.evaluate(
    () => !document.querySelector('.menu-screen')?.classList.contains('hidden'),
  );
  console.log('game object:', hasGame, '| menu visible:', menuVisible);
  if (!hasGame || !menuVisible) fail('menu did not load');
  await page.screenshot({ path: 'test/shot-1-menu.png' });

  // 2. start the run
  await page.click('[data-a="start"]');
  await sleep(800);
  const phase = await page.evaluate(() => window.__game.phase);
  console.log('phase after start:', phase);
  if (phase !== 'playing') fail('phase is not "playing" after Start Run');

  // 3. player stands on the first roof
  await sleep(500);
  const st0 = await page.evaluate(() => {
    const g = window.__game;
    return {
      pos: { x: g.controller.body.pos.x, y: g.controller.body.pos.y, z: g.controller.body.pos.z },
      grounded: g.controller.body.grounded,
    };
  });
  console.log('spawn state:', JSON.stringify(st0));
  if (!st0.grounded || Math.abs(st0.pos.y) > 0.05) fail('player is not grounded on the first roof');
  await page.screenshot({ path: 'test/shot-2-ingame.png' });

  // 4. WASD movement (hold W for ~2 s)
  await page.keyboard.down('KeyW');
  await sleep(2000);
  await page.keyboard.up('KeyW');
  const st1 = await page.evaluate(() => {
    const g = window.__game;
    return { z: g.controller.body.pos.z, grounded: g.controller.body.grounded };
  });
  console.log('after W 2s: z =', st1.z.toFixed(2), 'grounded =', st1.grounded);
  if (st1.z - st0.pos.z < 3) fail('player did not move forward');

  // 5. jump — y must rise then return to the roof
  const jumpPeak = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const g = window.__game;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        let peak = -Infinity;
        const t0 = performance.now();
        const poll = () => {
          peak = Math.max(peak, g.controller.body.pos.y);
          if (performance.now() - t0 > 900) resolve({ peak, endY: g.controller.body.pos.y });
          else requestAnimationFrame(poll);
        };
        poll();
      }),
  );
  console.log('jump peak y =', jumpPeak.peak.toFixed(2), 'end y =', jumpPeak.endY.toFixed(2));
  if (jumpPeak.peak < 0.7) fail('jump did not lift the player');

  // 6. sprint + slide smoke (no asserts, just exercise the code path)
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await sleep(1200);
  await page.keyboard.down('ControlLeft');
  await sleep(600);
  const sliding = await page.evaluate(() => window.__game.controller.sliding);
  console.log('sliding while sprinting:', sliding);
  await page.keyboard.up('ControlLeft');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await page.screenshot({ path: 'test/shot-3-movement.png' });

  if (consoleErrors.length > 0) {
    console.log('console errors:', consoleErrors.slice(0, 5));
    fail('console errors detected');
  }

  if (!process.exitCode) console.log('SMOKE OK');
} finally {
  await browser.close();
}
