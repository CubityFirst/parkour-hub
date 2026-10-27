// Real-input playtest: sprint from spawn and jump the first gap (z 12 → 15.5).
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CANDIDATES.find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.GAME_URL ?? 'http://localhost:5173', { waitUntil: 'networkidle0' });
  await sleep(1200);
  await page.click('[data-a="start"]');
  await sleep(500);

  // sprint forward; scripted sequence: vault the vent (E), slide under the
  // pipe (CTRL), jump the first gap (SPACE) — all fired by position triggers
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.evaluate(() => {
    const g = window.__game;
    const kd = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const ku = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    const steps = [
      { at: 0.7, done: false, fn: () => { kd('KeyE'); setTimeout(() => ku('KeyE'), 80); } },
      { at: 6.2, done: false, fn: () => kd('ControlLeft') },
      { at: 10.9, done: false, fn: () => { kd('Space'); setTimeout(() => { ku('Space'); ku('ControlLeft'); }, 150); } },
    ];
    const poll = () => {
      const z = g.controller.body.pos.z;
      for (const s of steps) if (!s.done && z > s.at) { s.done = true; s.fn(); }
      if (!steps.every((s) => s.done)) requestAnimationFrame(poll);
    };
    poll();
  });
  await sleep(2600);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');

  const s = await page.evaluate(() => {
    const b = window.__game.controller.body;
    return { y: b.pos.y, z: b.pos.z, grounded: b.grounded, cp: window.__game.level.checkpoints.current };
  });
  console.log(`after gap jump: z=${s.z.toFixed(2)} y=${s.y.toFixed(2)} grounded=${s.grounded} cp=${s.cp}`);
  const ok = s.grounded && s.z > 15.5 && Math.abs(s.y) < 0.05 && s.cp === 1;
  console.log(ok ? 'GAP OK' : 'GAP FAIL');
  if (errors.length) console.log('page errors:', errors);
  process.exitCode = ok && !errors.length ? 0 : 1;
} finally {
  await browser.close();
}
