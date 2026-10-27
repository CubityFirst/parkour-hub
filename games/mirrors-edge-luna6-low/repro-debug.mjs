import { createRequire } from 'node:module';
const require = createRequire('G:/scripts/gacha/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({viewport:{width:1280,height:720}});
page.on('console', m=>console.log('CONSOLE',m.text()));
await page.goto('http://127.0.0.1:8798/luna-low/'); await page.waitForTimeout(1000);
console.log('BEFORE',await page.evaluate(()=>window.__parkourDebug?.()));
await page.getByRole('button',{name:/run the roofs/i}).focus(); await page.keyboard.press('Enter');
for(const t of [50,100,300,500,1000,2000]){await page.waitForTimeout(t); console.log('AFTER',t,await page.evaluate(()=>window.__parkourDebug?.()));}
await browser.close();
