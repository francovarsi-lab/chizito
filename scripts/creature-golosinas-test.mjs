// Palito de la selva y chupetín con los modelos REALES del juego: el resolver los mide, el intérprete los reconoce.
// Uso: node scripts/creature-golosinas-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] ?? 'docs/creature/capturas';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/?capture&creature');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
await page.waitForFunction(() => !!window.__creature, null, { timeout: 120000 });
let bad = 0;
const ok = (c, msg) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'FALLA'} ${msg}`); };

const base = JSON.parse(fs.readFileSync('public/assets/creatures/A.json', 'utf8'));
const mk = (changes) => {
  const d = JSON.parse(JSON.stringify(base));
  d.pieces = d.pieces.filter((p) => changes[p.id]).map((p) => ({ ...p, ...changes[p.id].set, attach: { ...p.attach, ...(changes[p.id].attach ?? {}) } }));
  d.creature.pieceCount = d.pieces.length;
  return JSON.stringify(d);
};
const run = (text) => page.evaluate((text) => {
  window.__chizito.persistence.loadText(text, false);
  window.__creature.refresh(true);
  const s = window.__creature.state();
  return {
    types: s.snapshot.pieces.map((p) => p.type),
    limbs: s.analysis.limbs.map((l) => ({ id: l.id, tag: l.tag, root: l.rootPieceId, mass: l.mass, strike: l.caps.strike, len: l.length, freeMm: l.freeLength * 1000, pieces: l.pieceIds })),
    deco: s.analysis.decorative.map((d) => [d.pieceId, d.reason]),
    actions: s.analysis.actions.map((a) => a.kind),
    text: document.getElementById('cs-panel').innerText,
    stick: s.snapshot.pieces.filter((p) => p.type === 'chupetin' || p.type === 'palito-selva').map((p) => ({ type: p.type, r: p.shape.radius, len: Math.hypot(...p.shape.b.map((v, i) => v - p.shape.a[i])) })),
    ball: s.snapshot.pieces.filter((p) => p.type === 'chupetin-caramelo').map((p) => ({ r: p.shape.radius, id: p.id })),
    warnings: s.snapshot.warnings,
  };
}, text);

// Palitos de la selva en el lugar de los palitos comunes (los 4 brazos/piernas de A).
const ids = base.pieces.map((p) => p.id);
const common = await run(mk(Object.fromEntries(ids.map((id) => [id, { set: {} }]))));
const selva = await run(mk(Object.fromEntries(ids.map((id) => [id, { set: { type: 'palito-selva' } }]))));
ok(selva.deco.length === 0 && !/desconocid/i.test(selva.text), `selva: sin piezas desconocidas ni avisos (decorativas: ${selva.deco.length})`);
ok(selva.limbs.length === common.limbs.length, `selva: ${selva.limbs.length} extremidades, igual que con palitos comunes (${common.limbs.length})`);
const m = selva.stick[0];
ok(m && m.r > 0.0035 && m.r < 0.0042 && m.len > 0.040 && m.len < 0.047, `selva: medidas reales del modelo: Ø ${(m.r * 2000).toFixed(1)} mm × ${(m.len * 100).toFixed(2)} cm`);
console.log('   masas selva (g):', selva.limbs.map((l) => (l.mass * 1000).toFixed(2)).join(', '));
await page.screenshot({ path: `${out}/panel-selva.png` });

// Chupetín: palito + caramelo en la punta libre = maza.
const chup = await run(mk({ 'palito-fxA3': { set: { type: 'chupetin' }, attach: { depth: 0.016 } }, 'palito-fxA1': { set: { type: 'palito-selva' }, attach: { depth: 0.015 } } }));
ok(chup.ball.length === 1 && chup.types.includes('chupetin-caramelo'), 'chupetín: la bola de caramelo llega como pieza propia');
ok(chup.ball.length === 1 && chup.ball[0].r > 0.0100 && chup.ball[0].r < 0.0115, `chupetín: bola real Ø ${(chup.ball[0]?.r * 2000).toFixed(1)} mm`);
const mz = chup.limbs.find((l) => l.tag === 'maza');
ok(!!mz && mz.root === 'palito-fxA3' && mz.pieces.some((p) => p.endsWith('~caramelo')), 'chupetín: una maza (palito + caramelo)');
ok(chup.deco.every((d) => d[1] !== 'unknown-type') && !/desconocid/i.test(chup.text), 'chupetín: sin aviso de tipo desconocido');
console.log('   chupetín:', JSON.stringify({ limbs: chup.limbs.map((l) => [l.id, l.tag, +(l.mass * 1000).toFixed(2), +l.freeMm.toFixed(1), +l.strike.toFixed(2)]), deco: chup.deco, actions: chup.actions, stick: chup.stick }));
await page.screenshot({ path: `${out}/panel-chupetin.png` });
console.log(errors.length ? 'errores de página: ' + [...new Set(errors)].slice(0, 5).join(' | ') : 'sin errores de página');
await browser.close();
process.exit(bad ? 1 : 0);
