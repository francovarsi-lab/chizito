// Carga un archivo de criatura en el juego real y guarda el snapshot que resuelve el intérprete (para probar sin navegador).
// Uso: node scripts/creature-snapshot.mjs <criatura.json> <salida.snapshot.json>   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('uso: node scripts/creature-snapshot.mjs <criatura.json> <salida.snapshot.json>');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto('http://localhost:5173/?capture&creature');
await page.waitForFunction(() => !!window.__creature, null, { timeout: 300000 });
const snapshot = await page.evaluate((text) => {
  const warnings = window.__chizito.persistence.loadText(text, false);
  window.__creature.refresh(true);
  return { warnings, snapshot: window.__creature.state().snapshot };
}, fs.readFileSync(input, 'utf8'));
fs.writeFileSync(output, JSON.stringify(snapshot.snapshot, null, 2) + '\n');
console.log(`${output}: ${snapshot.snapshot.pieces.length} piezas del snapshot, avisos del cargador: ${snapshot.warnings.join('; ') || 'ninguno'}`);
await browser.close();
