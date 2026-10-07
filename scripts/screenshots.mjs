// Capturas desde la cámara del juego con Playwright (Chromium headless, WebGL por software).
// Uso: npm run dev (en otra terminal) y luego: node scripts/screenshots.mjs [url] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
page.on('console', (m) => console.log('[page]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url + (url.includes('?') ? '&' : '?') + 'capture', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 180000 });
const err = await page.evaluate(() => document.body.dataset.error);
if (err) { console.error('ERROR', err); process.exit(1); }

const views = [
  ['01-inicial', null],
  ['02-girado', [0.9, 0.6, 0.2]],
  ['03-punta', [0.2, 1.5, -0.3]],
];
for (const [name, euler] of views) {
  if (euler) {
    await page.evaluate((e) => {
      const { pivot, THREE } = window.__chizito;
      pivot.quaternion.setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    }, euler);
  }
  const data = await page.evaluate(() => window.__chizito.renderFrames(40));
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('captura', name);
}
await browser.close();
