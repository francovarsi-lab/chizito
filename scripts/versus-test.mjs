// Pelea contra un amigo (O1), de punta a punta en UN navegador: dos pestañas en una sala `local-…` (BroadcastChannel, sin
// internet). Cada una carga una criatura, aprieta PELEAR y juega; se revisa que avancen juntas, se peguen y no se separen.
// Uso (con el server andando): node scripts/versus-test.mjs [dir de capturas]
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = process.argv[2] ?? '.';
const URL = 'http://localhost:5173/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 480, height: 270 } });
const errs = [], warns = [];
const open = async (q, file) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errs.push(m.text().slice(0, 200)); if (/se separaron/.test(m.text())) warns.push(m.text()); });
  await p.goto(`${URL}?capture&seed=3&sala=local-prueba${q}`);
  await p.waitForFunction(() => document.body.dataset.ready && !!window.__fight, null, { timeout: 900000 });
  await p.evaluate((t) => window.__chizito.persistence.loadText(t), fs.readFileSync(`public/assets/creatures/${file}`, 'utf8'));
  return p;
};
const T0 = Date.now();
const log = (t) => console.error(`[${Math.round((Date.now() - T0) / 1000)} s] ${t}`);
// Sin cara (ketchup) no se puede pelear: las dos criaturas de prueba tienen.
const A = await open('&anfitrion', 'criatura-20261011-1623.json');
const B = await open('', 'E.json');
log('cargadas');
const card = await A.textContent('#cf-room');
// PELEAR en los dos.
for (const p of [A, B]) if (!(await p.evaluate(() => document.querySelector('#cf-btn').disabled))) await p.click('#cf-btn', { force: true });
log(`apretado: ${await A.textContent('#cf-room')} | ${await B.textContent('#cf-room')}`);
await A.waitForFunction(() => window.__fight.isOpen(), null, { timeout: 600000 });
await B.waitForFunction(() => window.__fight.isOpen(), null, { timeout: 600000 });
log('pelea abierta en los dos');
await A.keyboard.down('ArrowRight');
await B.keyboard.down('ArrowLeft');
const st = (p) => p.evaluate(() => { const m = window.__fight.match(); return { frame: m.frame, phase: m.phase, hp: m.f.map((f) => Math.round(f.hp * 10) / 10), x: m.f.map((f) => Math.round(f.x * 1000) / 1000) }; });
// De a 3 cuadros por pestaña: es lo que una puede adelantarse a la otra (retardo de entrada).
// Lo más lejos que llegó cada uno (los golpes empujan para atrás: la posición final sola no alcanza).
let minX1 = Infinity, maxX0 = -Infinity;
for (let i = 0; i < 110; i++) {
  for (const p of [A, B]) {
    if (i > 45 && i % 6 === 0) await p.keyboard.press(i % 12 ? 'KeyQ' : 'KeyW');
    await p.evaluate(() => window.__chizito.renderFrames(3));
  }
  const now = await st(A);
  minX1 = Math.min(minX1, now.x[1]);
  maxX0 = Math.max(maxX0, now.x[0]);
  if (i % 10 === 0) log(`vuelta ${i}: ${JSON.stringify(now)}`);
}
const [a, c] = [await st(A), await st(B)];
for (const [p, n] of [[A, 'anfitrion'], [B, 'invitado']]) {
  const d = await p.evaluate(() => window.__chizito.renderFrames(1));
  if (typeof d === 'string') await p.evaluate((src) => { const img = document.createElement('img'); img.src = src; Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '39', pointerEvents: 'none' }); document.body.append(img); }, d);
  await p.screenshot({ path: `${dir}/versus-${n}.png` });
}
const ok = (v, msg) => { console.log(`${v ? '  ok' : '  FALLA'}: ${msg}`); if (!v) process.exitCode = 1; };
ok(/link/i.test(card ?? ''), `el que invita ve la tarjeta con el link (${(card ?? '').slice(0, 60)})`);
ok(a.frame > 150 && Math.abs(a.frame - c.frame) <= 16, `los dos avanzan juntos (cuadros ${a.frame} / ${c.frame})`);
ok(maxX0 > -0.07 && minX1 < 0.07, `cada uno mueve SU chizito (llegaron a ${maxX0}, ${minX1})`);
ok(a.hp.some((h) => h < 100) || c.hp.some((h) => h < 100), `se pegan (vida ${a.hp} / ${c.hp})`);
ok(warns.length === 0, `no se separaron (${warns.length} avisos)`);
ok(errs.length === 0, `sin errores de página (${errs.slice(0, 3).join(' | ')})`);
await b.close();
