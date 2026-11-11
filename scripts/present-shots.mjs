// Capturas de la presentación de la pelea y de EL BROCOLOCO de cerca.
// Uso (con `npm run dev` corriendo): node scripts/present-shots.mjs <dir> [criatura] [tiempos en s separados por coma]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/presentacion';
const id = process.argv[3] ?? 'criatura-20261011-1623';
const times = (process.argv[4] ?? '0.6,1.6,2.6,3.6,4.6,5.6,6.6').split(',').map(Number);
const url = process.env.URL ?? 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}?capture&seed=3&presentacion`);
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
await page.waitForFunction(() => !!window.__fight, null, { timeout: 120000 });
const text = await (await fetch(`${url}assets/creatures/${id}.json`)).text();
await page.evaluate((t) => window.__chizito.persistence.loadText(t), text);
await page.evaluate(() => document.body.classList.add('ready'));
const shot = async (name, frames, dt) => {
  const d = await page.evaluate(([n, dt]) => window.__chizito.renderFrames(n, dt), [frames, dt]);
  await page.evaluate((src) => {
    let img = document.getElementById('__shot');
    if (!img) { img = document.createElement('img'); img.id = '__shot'; Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '50', pointerEvents: 'none' }); document.body.appendChild(img); }
    img.src = src;
  }, d);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('captura', name);
};
await page.evaluate(() => window.__fight.open());
let t = 0;
for (const at of times) {
  const dt = 1 / 10;
  const n = Math.max(1, Math.round((at - t) / dt));
  await shot(`t${at.toFixed(2)}`, n, dt);
  t = at;
}
await browser.close();
