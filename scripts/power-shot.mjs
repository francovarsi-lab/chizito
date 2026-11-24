// Captura de un poder del rival: abre la pelea, espera el combate, le da el poder al rival y avanza `cuadros` antes de dibujar.
// Uso (con `npx vite --port 5173`): node scripts/power-shot.mjs <png> <nivel> <poder> [cuadros]
import { chromium } from 'playwright';
const [out, lvl = '3', kind = 'avalancha', after = '50'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:5173/?capture&seed=3&nivel=${lvl}`);
await p.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
await p.waitForFunction(() => !!window.__fight, null, { timeout: 120000 });
const text = await (await fetch('http://localhost:5173/assets/creatures/criatura-20261011-1623.json')).text();
await p.evaluate((t) => window.__chizito.persistence.loadText(t), text);
await p.evaluate(() => window.__fight.open());
await p.waitForTimeout(1500);
await p.evaluate(([kind, after]) => {
  const F = window.__fight;
  for (let i = 0; i < 2000 && F.match().phase !== 'fight'; i++) F.advance(1, { x: 0 });
  const m = F.match();
  m.f[1].x = m.f[0].x + (kind === 'rearme' ? 0.12 : 0.09);
  if (kind === 'rearme') { m.f[1].hp = 45; m.piles.push({ id: 9999, x: m.f[0].x + 0.05, n: 12, t: 0 }); }
  m.f[1].pw = { kind, phase: 'wind', t: 0, hit: false };
  F.advance(Number(after), { x: 0 });
}, [kind, after]);
const d = await p.evaluate(() => window.__chizito.renderFrames(3));
await p.evaluate((src) => { const img = document.createElement('img'); img.src = src; Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '50', pointerEvents: 'none' }); document.body.appendChild(img); }, d);
await p.waitForTimeout(150);
await p.screenshot({ path: out });
console.log(errs.slice(0, 5).join('\n') || 'sin errores');
await b.close();
