// Pelea contra un amigo (O1), de punta a punta en UN navegador: dos pestañas en una sala `local-…` (BroadcastChannel, sin
// internet). Cada una carga una criatura, aprieta PELEAR y juega; se revisa que avancen juntas, se peguen y no se separen.
// Uso (con el server andando): node scripts/versus-test.mjs [dir de capturas]
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = process.argv[2] ?? '.';
const URL = 'http://localhost:5173/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
const errs = [], warns = [];
const files = fs.readdirSync('public/assets/creatures').filter((f) => f.endsWith('.json'));
const open = async (q, file) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errs.push(m.text().slice(0, 200)); if (/se separaron/.test(m.text())) warns.push(m.text()); });
  await p.goto(`${URL}?capture&seed=3&sala=local-prueba${q}`);
  await p.waitForFunction(() => document.body.dataset.ready && !!window.__fight, null, { timeout: 900000 });
  await p.evaluate((t) => window.__chizito.persistence.loadText(t), fs.readFileSync(`public/assets/creatures/${file}`, 'utf8'));
  return p;
};
const A = await open('&anfitrion', files[0]);
const B = await open('', files[Math.min(1, files.length - 1)]);
const card = await A.textContent('#cf-room');
// PELEAR en los dos (si la criatura no tiene cara, el primer clic sólo avisa).
for (const p of [A, B]) for (let k = 0; k < 2; k++) if (!(await p.evaluate(() => document.querySelector('#cf-btn').disabled))) await p.click('#cf-btn', { force: true });
await A.waitForFunction(() => window.__fight.isOpen(), null, { timeout: 600000 });
await B.waitForFunction(() => window.__fight.isOpen(), null, { timeout: 600000 });
await A.keyboard.down('ArrowRight');
await B.keyboard.down('ArrowLeft');
const st = (p) => p.evaluate(() => { const m = window.__fight.match(); return { frame: m.frame, phase: m.phase, hp: m.f.map((f) => Math.round(f.hp * 10) / 10), x: m.f.map((f) => Math.round(f.x * 1000) / 1000) }; });
for (let i = 0; i < 40; i++) {
  for (const p of [A, B]) {
    if (i > 14 && i % 2 === 0) await p.keyboard.press(i % 4 ? 'KeyQ' : 'KeyW');
    await p.evaluate(() => window.__chizito.renderFrames(8));
  }
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
ok(a.x[0] > -0.07 && a.x[1] < 0.07, `cada uno mueve SU chizito (x ${a.x})`);
ok(a.hp.some((h) => h < 100) || c.hp.some((h) => h < 100), `se pegan (vida ${a.hp} / ${c.hp})`);
ok(warns.length === 0, `no se separaron (${warns.length} avisos)`);
ok(errs.length === 0, `sin errores de página (${errs.slice(0, 3).join(' | ')})`);
await b.close();
