// Pelea en la mesa real (3D) con la criatura armada: abre PELEAR, juega con el teclado real y saca capturas CON el HUD.
// Uso (con `npm run dev` corriendo): node scripts/fight-ui-test.mjs [outDir] [criatura] [url]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'docs/capturas/pelea';
const id = process.argv[3] ?? 'criatura-20261011-1623';
const url = process.argv[4] ?? 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'FALLA'} ${m}`); };
await page.goto(`${url}?capture&seed=3`);
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
await page.waitForFunction(() => !!window.__fight, null, { timeout: 120000 });
ok(await page.evaluate(() => !document.querySelector('.cs-panel')), 'sin ?dev no aparece el panel técnico');
const text = await (await fetch(`${url}assets/creatures/${id}.json`)).text();
await page.evaluate((t) => window.__chizito.persistence.loadText(t), text);
await page.evaluate(() => document.body.classList.add('ready'));
await page.waitForTimeout(500);
// El canvas WebGL no sale en page.screenshot: se pinta la imagen del canvas detrás del HUD y se fotografía todo junto.
const shot = async (name, frames = 1) => {
  const d = await page.evaluate((n) => window.__chizito.renderFrames(n), frames);
  await page.evaluate((src) => {
    let img = document.getElementById('__shot');
    if (!img) { img = document.createElement('img'); img.id = '__shot'; Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '50', pointerEvents: 'none' }); document.body.appendChild(img); }
    img.src = src;
  }, d);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const home = await page.evaluate(() => window.__chizito.pivot.position.toArray());
await shot('0-constructor');
ok(await page.evaluate(() => !document.getElementById('cf-btn').hidden), 'el botón PELEAR está a la vista');
await page.evaluate(() => window.__fight.open());
const info = await page.evaluate(() => window.__fight.model().limbs.map((l) => `${l.role}:${l.label}`));
console.log('extremidades', info);
ok(info.filter((s) => s.startsWith('arm')).length >= 1 && info.filter((s) => s.startsWith('leg')).length >= 1, 'cada palito clavado es brazo o pierna');
await shot('1-round', 40);
await page.evaluate(() => window.__chizito.renderFrames(80));
ok(await page.evaluate(() => window.__fight.match().phase === 'fight'), 'después del cartel arranca la pelea');
const place = await page.evaluate(() => {
  const T = window.__chizito.THREE;
  const b = new T.Box3().setFromObject(window.__chizito.construction.root.object);
  return { miny: b.min.y, x: window.__fight.match().f[0].x, cx: (b.min.x + b.max.x) / 2 };
});
// La arena es una tabla de picar: el piso de la pelea está a GROUND (1,2 cm) sobre el mantel.
ok(place.miny > 0.006 && place.miny < 0.018, `apoyada en la tabla de la arena (y mínima ${place.miny.toFixed(4)})`);
// Teclado de verdad.
const x0 = await page.evaluate(() => window.__fight.match().f[0].x);
await page.keyboard.down('ArrowRight');
await page.evaluate(() => window.__chizito.renderFrames(45));
await page.keyboard.up('ArrowRight');
const x1 = await page.evaluate(() => window.__fight.match().f[0].x);
ok(x1 - x0 > 0.01, `con → camina (x ${x0.toFixed(3)} → ${x1.toFixed(3)})`);
await shot('2-camina');
await page.keyboard.press('KeyZ'); // piña
const phases = new Set();
let maxRot = 0;
// Lo pesado (p. ej. la aceituna) carga antes de pegar (`FIGHT.charge`): se espera hasta 60 cuadros a que salga el golpe.
let since = -1;
for (let i = 0; i < 60 && (since < 0 || i - since < 8); i++) {
  const r = await page.evaluate(() => { window.__chizito.renderFrames(1); const f = window.__fight.match().f[0]; return { ph: f.limbs.map((s) => s.phase), rot: Math.max(...f.limbs.map((s) => 2 * Math.acos(Math.min(1, Math.abs(s.q[3]))))) }; });
  r.ph.forEach((p) => phases.add(p));
  maxRot = Math.max(maxRot, r.rot);
  if (since < 0 && r.ph.includes('strike')) since = i;
  if (since >= 0 && i - since === 2) await shot('3-golpe');
}
ok(phases.has('strike'), `con Z (piña) un brazo golpea (fases ${[...phases]})`);
ok(maxRot > 0.3, `el brazo gira en su punto de clavado (${(maxRot * 57.3).toFixed(0)}°)`);
// Acercarse y pelear un rato (entradas simuladas): tiene que haber golpes de los dos lados.
let hits = 0;
for (let k = 0; k < 10 && hits < 4; k++) {
  await page.evaluate(() => window.__fight.advance(40, (f) => ({ x: 1, punch: f % 30 === 0, kick: f % 30 === 15 })));
  hits = await page.evaluate(() => 100 - window.__fight.match().f[1].hp);
}
await shot('4-pelea', 24);
const hp = await page.evaluate(() => window.__fight.match().f.map((f) => Math.round(f.hp)));
ok(hp[1] < 100, `le saca vida al brócoli (vida ${hp})`);
// Guardia (mantener C) y salto (↑). Antes, esperar a que pase el castigo de algún golpe errado (errar bloquea la guardia un rato).
await page.evaluate(() => window.__fight.advance(90, () => ({ x: -1 })));
await page.keyboard.down('KeyC');
await page.evaluate(() => window.__chizito.renderFrames(14));
ok(await page.evaluate(() => window.__fight.match().f[0].guard > 0.6), 'con C se cubre (los brazos adelante)');
await shot('4b-guardia');
await page.keyboard.up('KeyC');
await page.keyboard.press('ArrowUp');
await page.evaluate(() => window.__chizito.renderFrames(9));
ok(await page.evaluate(() => !window.__fight.match().f[0].grounded), 'con ↑ salta');
await shot('4c-salto');
await page.evaluate(() => window.__chizito.renderFrames(30));
// Pausa.
await page.keyboard.press('Escape');
await page.evaluate(() => window.__chizito.renderFrames(1));
ok(await page.evaluate(() => window.__fight.paused() && document.querySelector('#cfh .menu').classList.contains('on')), 'Esc pausa con menú');
await shot('5-pausa');
await page.keyboard.press('Escape');
ok(await page.evaluate(() => !window.__fight.paused()), 'Esc de nuevo sigue');
// Pelea hasta el final con la IA manejando también al jugador (prueba de punta a punta).
await page.evaluate(async () => {
  const { aiInput, newAi } = await import('/src/creature/fight/ai.ts');
  const mem = newAi(5, 3);
  for (let i = 0; i < 60 * 200 && window.__fight.match().phase !== 'over' && window.__fight.match().phase !== 'ko'; i++) window.__fight.advance(1, () => aiInput(window.__fight.match(), mem, 0));
  window.__mem = mem;
  return {};
});
await shot('5b-ko', 30);
const end = await page.evaluate(async () => {
  const { aiInput } = await import('/src/creature/fight/ai.ts');
  const mem = window.__mem;
  for (let i = 0; i < 60 * 200 && window.__fight.match().phase !== 'over'; i++) window.__fight.advance(1, () => aiInput(window.__fight.match(), mem, 0));
  const m = window.__fight.match();
  return { phase: m.phase, wins: m.wins, winner: m.winner };
});
console.log('final', end);
ok(end.phase === 'over' && end.winner !== null, `la pelea termina con un ganador (${end.wins})`);
await page.evaluate(() => window.__chizito.renderFrames(100));
await shot('6-final');
await page.evaluate(() => window.__fight.close());
await page.evaluate(() => window.__chizito.renderFrames(2));
const back = await page.evaluate(() => window.__chizito.pivot.position.toArray());
ok(back.every((v, i) => Math.abs(v - home[i]) < 0.004), 'al salir la criatura vuelve a su lugar en el constructor');
await shot('7-vuelta');
ok(errors.length === 0, `sin errores de página ${errors.slice(0, 3)}`);
await browser.close();
process.exit(bad ? 1 : 0);
