// Dato curioso del papel del palito de la selva: aparece de frente, se queda para leerlo y se va; sale uno distinto cada vez.
// Uso: node scripts/datos-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/datos';
fs.mkdirSync(out, { recursive: true });
const W = 1280, H = 720;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
await page.evaluate(() => { document.body.classList.add('ready'); return document.fonts.ready; });
const frames = (n, dt) => page.evaluate(([n, dt]) => window.__chizito.renderFrames(n, dt), [n, dt]);
const findBowl = (type) => page.evaluate((type) => {
  const c = window.__chizito;
  for (let y = -0.95; y < 0.9; y += 0.05) for (let x = -0.95; x < 0.96; x += 0.05) {
    if (c.picker.pickBowl(x, y) === type) return [(x * 0.5 + 0.5) * innerWidth, (-y * 0.5 + 0.5) * innerHeight];
  }
  throw new Error('no encontré ' + type);
}, type);
const cardState = () => page.evaluate(() => { const e = document.getElementById('fact'); return { cls: e.className, text: e.querySelector('.text').textContent, op: getComputedStyle(e).opacity }; });
const facts = [];
for (let i = 0; i < 3; i++) {
  const [bx, by] = await findBowl('palito-selva');
  await page.mouse.move(bx, by, { steps: 3 }); await page.mouse.down(); await page.mouse.up();
  await page.mouse.move(W * 0.5, H * 0.55, { steps: 3 });
  await frames(70, 1 / 30); // se desenrolla (1,1 s) y el papel suelta el cartel
  await page.waitForTimeout(900);
  if (i === 0) await page.screenshot({ path: `${out}/01-cartel.png` });
  const s = await cardState();
  facts.push(s.text);
  console.log('dato', i + 1, JSON.stringify(s));
  if (i === 0) {
    await page.waitForTimeout(3500);
    console.log('a los 4,4 s sigue visible:', JSON.stringify(await cardState()));
    await page.waitForTimeout(3500);
    console.log('a los 8 s:', JSON.stringify(await cardState()));
  }
  await page.keyboard.press('Escape'); await frames(10, 1 / 30);
}
console.log(new Set(facts).size === facts.length ? 'OK: distintos' : 'REPETIDOS');
await browser.close();
