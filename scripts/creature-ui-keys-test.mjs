// Resaltado 3D de extremidades (A y D) y deshacer/rehacer con el TECLADO en la página real.
// Uso: node scripts/creature-ui-keys-test.mjs [outDir]   (con `npm run dev` corriendo)
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
const count = () => page.evaluate(() => window.__panel.state().snapshot.pieces.length);
const tinted = () => page.evaluate(() => window.__panel.highlighter.tinted?.length ?? -1);

// ── Resaltado 3D: la escena (sin panel) y la página completa ──
for (const id of ['A', 'D']) {
  await page.evaluate((id) => window.__panel.loadCreature(id), id);
  const data = await page.evaluate(() => window.__chizito.renderFrames(8));
  fs.writeFileSync(`${out}/resaltado3d-${id}.png`, Buffer.from(data.split(',')[1], 'base64'));
  await page.screenshot({ path: `${out}/resaltado3d-${id}-pagina.png` });
  const n = await page.evaluate(() => window.__panel.state().analysis.limbs.length);
  ok(n > 0 && (await tinted()) >= n, `${id}: ${n} extremidades resaltadas en la escena (${await tinted()} mallas teñidas)`);
}

// ── Teclado: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z en la página ──
await page.evaluate(async () => { await window.__panel.loadCreature('C'); await window.__panel.loadCreature('A'); });
await page.evaluate(() => window.__chizito.renderFrames(2));
const n0 = await count();
await page.keyboard.press('Control+z');
await page.waitForTimeout(700);
const n1 = await count();
ok(n1 !== n0, `Ctrl+Z (teclado) actualiza el panel (${n0} → ${n1})`);
await page.keyboard.press('Control+y');
await page.waitForTimeout(700);
const n2 = await count();
ok(n2 === n0, `Ctrl+Y (teclado) lo restituye (${n2})`);
await page.keyboard.press('Control+z');
await page.waitForTimeout(700);
const n3 = await count();
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(700);
const n4 = await count();
ok(n3 === n1 && n4 === n0, `Ctrl+Shift+Z (teclado) también rehace (${n3} → ${n4})`);
ok(await page.evaluate(() => !!document.getElementById('cs-panel')), 'el panel sigue en pantalla');
console.log(errors.length ? 'errores de página: ' + [...new Set(errors)].slice(0, 5).join(' | ') : 'sin errores de página');
await browser.close();
process.exit(bad ? 1 : 0);
