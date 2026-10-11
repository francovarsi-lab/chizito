// Dato curioso del papel del palito de la selva: el cartel sale de frente, se queda para leerlo y se va; sin repetir hasta los 18.
// Uso: node scripts/datos-test.mjs [outDir]   (con `npm run dev` corriendo)
// (El render por software es lento: se llama al cartel directo en vez de esperar el desenrollado completo.)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/datos';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
await page.evaluate(() => { document.body.classList.add('ready'); return document.fonts.ready; });
await page.evaluate(() => window.__chizito.renderFrames(6));
const cls = () => page.evaluate(() => document.getElementById('fact').className);
await page.evaluate(() => window.__chizito.interaction.d.overlay.fact('Las nutrias marinas se agarran de las manos mientras duermen para no separarse.', 640, 420));
await page.waitForTimeout(1100);
await page.screenshot({ path: `${out}/cartel.png` });
console.log('visible:', await cls());
await page.waitForTimeout(4200);
console.log('a los ~5 s sigue (se lee):', await cls());
await page.waitForTimeout(3000);
console.log('a los ~8 s se fue:', JSON.stringify(await cls()));
await browser.close();
