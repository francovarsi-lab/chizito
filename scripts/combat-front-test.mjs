// Prueba: el frente de combate (±X, por defecto +X) es un dato de la criatura que el cargador respeta.
// Uso: node scripts/combat-front-test.mjs   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
const r = await page.evaluate(() => {
  const c = window.__chizito;
  const out = [];
  const base = JSON.parse(c.persistence.toJSON());
  out.push(`nueva: front ${JSON.stringify(base.creature.front)}`);
  for (const [label, front] of [['−X', { direction: [-1, 0, 0], up: [0, 1, 0] }], ['+Z viejo', { direction: [0, 0, 1], up: [0, 1, 0] }], ['inválido +Y', { direction: [0, 1, 0] }], ['sin frente', undefined], ['−X casi', { direction: [-0.97, 0.1, 0.2] }]]) {
    const f = structuredClone(base);
    if (front) f.creature.front = front; else delete f.creature.front;
    const warns = c.persistence.loadText(JSON.stringify(f));
    const again = JSON.parse(c.persistence.toJSON()).creature.front.direction;
    out.push(`${label} → cargado ${JSON.stringify(c.construction.front.toArray())} · se vuelve a guardar ${JSON.stringify(again)}${warns.length ? ' · aviso: ' + warns.join(' | ') : ''}`);
  }
  // Deshacer/rehacer conserva el frente de cada criatura cargada.
  c.interaction.undo();
  out.push(`deshacer → ${JSON.stringify(c.construction.front.toArray())}`);
  // Reiniciar (R R) vuelve al +X por defecto.
  return out;
});
console.log(r.join('\n'));
await page.keyboard.press('KeyR'); await page.keyboard.press('KeyR');
console.log('reiniciar →', JSON.stringify(await page.evaluate(() => window.__chizito.construction.front.toArray())));
await browser.close();
