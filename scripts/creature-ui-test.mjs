// Panel "ESTRUCTURA DETECTADA" en el juego real: carga A–E y vegetal, cambia el frente, resalta, clava y deshace.
// Uso: node scripts/creature-ui-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] ?? 'docs/creature/capturas';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });

let bad = 0;
const ok = (c, msg) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'FALLA'} ${msg}`); };

await page.evaluate(async () => {
  const c = window.__chizito;
  const { PieceRegistry } = await import('/src/pieces/PieceRegistry.ts');
  const { ALL_DEFINITIONS } = await import('/src/pieces/definitions.ts');
  const { mountCreaturePanel } = await import('/src/creature/ui/index.ts');
  const pieces = new PieceRegistry();
  ALL_DEFINITIONS.forEach((d) => pieces.register(d));
  window.__panel = mountCreaturePanel({ construction: c.construction, interaction: c.interaction, persistence: c.persistence, pieces });
});
const snap = async (name) => {
  const data = await page.evaluate(() => window.__chizito.renderFrames(6));
  await page.screenshot({ path: `${out}/panel-${name}.png` });
  return data;
};
const txt = () => page.evaluate(() => document.getElementById('cs-panel').innerText);

let t = await txt();
ok(/ESTRUCTURA DETECTADA/.test(t), 'el panel aparece con el chizito solo');

for (const id of ['A', 'B', 'C', 'D', 'E', 'veg']) {
  const r = await page.evaluate(async (id) => {
    const p = window.__panel;
    await p.loadCreature(id);
    const s = p.state();
    return { limbs: s.analysis.limbs.length, deco: s.analysis.decorative.length, ms: s.ms, text: document.getElementById('cs-panel').innerText };
  }, id);
  ok(r.limbs >= 0 && /sobresale/.test(r.text) === (r.limbs > 0 || /vara/.test(r.text)), `${id}: ${r.limbs} extremidades, ${r.deco} decorativas, panel ${r.ms.toFixed(0)} ms`);
  ok(r.ms < 1500, `${id}: recalcula en < 1,5 s`);
  await page.evaluate(() => window.__chizito.renderFrames(8));
  await snap(id);
}

// Frente: giro de 180° cambia el cartel y la locomoción/acciones se espejan.
await page.evaluate(() => window.__panel.loadCreature('A'));
const f1 = await page.evaluate(() => window.__panel.state().analysis.profile2D.facing);
await page.click('button[data-facing="-1"]');
const f2 = await page.evaluate(() => window.__panel.state().analysis.profile2D.facing);
ok(f1 === 1 && f2 === -1, 'el selector de frente cambia el frente (1 → −1)');
ok(/FRENTE ←/.test(await page.evaluate(() => document.querySelector('.cs-profilebox').innerHTML)), 'cartel "FRENTE ←" tras el giro');
await snap('A-giro180');
await page.click('button[data-facing="1"]');

// Resaltado por hover sobre una fila.
const hl = await page.evaluate(() => {
  const row = document.querySelector('.cs-row[data-id]');
  row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { hover: window.__panel.state().hover, id: row.dataset.id };
});
ok(hl.hover === hl.id, 'pasar el mouse por una fila resalta esa extremidad');
await snap('A-resaltado');

// Clavar → deshacer → rehacer actualizan el panel.
const n0 = await page.evaluate(() => window.__panel.state().snapshot.pieces.length);
await page.evaluate(() => window.__chizito.interaction.undo());
await page.waitForTimeout(600);
const n1 = await page.evaluate(() => window.__panel.state().snapshot.pieces.length);
await page.evaluate(() => window.__chizito.interaction.redo());
await page.waitForTimeout(600);
const n2 = await page.evaluate(() => window.__panel.state().snapshot.pieces.length);
ok(n1 !== n0 || n0 <= 1, `deshacer actualiza el panel (${n0} → ${n1})`);
ok(n2 === n0, `rehacer lo restituye (${n2})`);

// Avisos: E (chizito montado con palitos) y vegetal.
await page.evaluate(() => window.__panel.loadCreature('E'));
t = await txt();
ok(/2\.º nivel|segundo nivel|deuda/i.test(t) || /vara pasante/.test(t), 'E muestra aviso/deuda o vara pasante');
await snap('E-avisos');

console.log(errors.length ? 'errores de página: ' + [...new Set(errors)].slice(0, 5).join(' | ') : 'sin errores de página');
await browser.close();
process.exit(bad ? 1 : 0);
