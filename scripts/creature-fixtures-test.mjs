// Carga cada criatura de prueba en el juego real (como Ctrl+O) y saca una captura.
// Uso: node scripts/creature-fixtures-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] ?? 'docs/creature/capturas';
fs.mkdirSync(out, { recursive: true });
const ids = ['A', 'B', 'C', 'D', 'E', 'veg'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });

let bad = 0;
let knownOld = 0;
for (const id of ids) {
  const res = await page.evaluate(async (id) => {
    const c = window.__chizito;
    const text = await (await fetch(`/assets/creatures/${id}.json`)).text();
    const expected = JSON.parse(text).pieces.length;
    const warnings = c.persistence.loadText(text, false);
    const nodes = [...c.construction.nodes.values()].map((n) => n.data.type);
    return { expected, warnings, count: nodes.length - 1, types: nodes.slice(1).join(',') };
  }, id);
  // El cargador actual del chat 3D todavía usa el frente de combate viejo (±X): ese es el único aviso aceptable.
  const OLD = 'el frente de combate no era ±X: se usa +X';
  const real = res.warnings.filter((w) => w !== OLD);
  if (res.warnings.includes(OLD)) knownOld++;
  const ok = real.length === 0 && res.count === res.expected;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'FALLA'} ${id.padEnd(4)} piezas cargadas ${res.count}/${res.expected} avisos: ${res.warnings.join('; ') || 'ninguno'}`);
  const data = await page.evaluate(() => window.__chizito.renderFrames(6));
  fs.writeFileSync(`${out}/${id}.png`, Buffer.from(data.split(',')[1], 'base64'));
}
console.log(`${knownOld} de ${ids.length} con el aviso conocido del frente de combate viejo (pendiente del chat 3D)`);
if (errors.length) console.log('errores de página:', [...new Set(errors)].slice(0, 5));
await browser.close();
process.exit(bad || errors.length ? 1 : 0);
