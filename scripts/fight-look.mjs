// Capturas de control de la pelea (con el server andando): round 1 con la hinchada, round 2 aéreo y el KO del rival.
// Uso: node scripts/fight-look.mjs <dir>  (~10 min con el 3D por software)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/?capture&seed=3');
await p.waitForFunction(() => document.body.dataset.ready && !!window.__fight, null, { timeout: 600000 });
await p.evaluate((t) => window.__chizito.persistence.loadText(t), fs.readFileSync('public/assets/creatures/criatura-20261011-1623.json', 'utf8'));
await p.evaluate(() => window.__fight.open());
await p.waitForTimeout(1500);
const snap = async (name) => {
  const d = await p.evaluate(() => window.__chizito.renderFrames(1));
  await p.evaluate((src) => { document.querySelector('#_shot')?.remove(); const img = document.createElement('img'); img.id = '_shot'; img.src = src; Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '39', pointerEvents: 'none' }); document.body.append(img); }, d);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log('ok', name);
};
// Round 1 peleando, con la hinchada saltando.
await p.evaluate(() => { window.__fight.advance(140, { x: 1 }); });
await p.evaluate(() => window.__chizito.renderFrames(30));
await snap('r1');
// KO del rival (huevo, nivel 2): cae al piso, suelta las extremidades y pone cara de noqueado.
await p.evaluate(() => window.__fight.restart(2));
await p.evaluate(() => { window.__fight.advance(140, { x: 1 }); });
await p.evaluate(() => { const m = window.__fight.match(); m.f[1].hp = 0.1; m.f[1].bleed = [600]; });
await p.evaluate(() => window.__chizito.renderFrames(320));
await snap('ko-rival');
console.log(errs.slice(0, 4).join('\n') || 'sin errores');
await b.close();
