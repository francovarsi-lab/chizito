// Pelea en la mesa real (3D): carga una criatura, abre ⚔ PELEAR, juega y saca capturas. Uso: node scripts/creature-fight-ui-test.mjs [outDir] [criatura] (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'docs/creature/capturas';
const id = process.argv[3] ?? 'A';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'FALLA'} ${m}`); };
await page.goto('http://localhost:5173/?capture&creature');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
await page.waitForFunction(() => !!window.__fight && !!window.__creature, null, { timeout: 120000 });
await page.evaluate((id) => window.__creature.loadCreature(id), id);
await page.waitForTimeout(500);
const shot = async (name, frames = 1) => { await page.evaluate((n) => window.__chizito.renderFrames(n), frames); await page.screenshot({ path: `${out}/pelea3d-${name}.png` }); };
await shot('0-constructor');
await page.evaluate(() => window.__fight.open());
await page.waitForFunction(() => window.__fight.isOpen() && window.__fight.state(), null, { timeout: 60000 });
await page.evaluate(() => window.__fight.advance(80, { move: 0 }));
await shot('1-inicio');
// El cuerpo 3D tiene que caer donde dice la pose 2D (misma mesa, mismos ejes).
const place = await page.evaluate(() => {
  const f = window.__fight; const [r0] = f.rigs(); const s = f.state().f[0];
  const T = window.__chizito.THREE; const b = new T.Box3().setFromObject(r0.construction.root.object);
  return { cx: (b.min.x + b.max.x) / 2, cy: (b.min.y + b.max.y) / 2, x: s.sim.x, miny: b.min.y };
});
console.log('cuerpo 3D', place);
ok(Math.abs(place.cx - place.x) < 0.02, `el cuerpo 3D está en la x de la simulación (${place.cx.toFixed(3)} vs ${place.x.toFixed(3)})`);
ok(place.miny > -0.005 && place.miny < 0.03, `apoyado sobre la mesa (y mínima ${place.miny.toFixed(4)})`);
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.__fight.advance(70, (f) => ({ move: 1, attack: f % 40 > 33 })));
  await shot(`2-golpes-${i}`);
}
const hp = await page.evaluate(() => window.__fight.state().f.map((q) => Math.round(q.hp)));
console.log('vida', hp, 'ganador', await page.evaluate(() => window.__fight.state().winner));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok(await page.evaluate(() => !window.__fight.isOpen()), 'Esc cierra la pelea');
await shot('3-vuelta-constructor');
ok(errors.length === 0, `sin errores de página ${errors.slice(0, 3)}`);
await browser.close();
process.exit(bad ? 1 : 0);
