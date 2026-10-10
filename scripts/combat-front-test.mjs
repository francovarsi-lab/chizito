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
  const cases = [
    ['−Y (defecto)', { direction: [0, -1, 0], up: [1, 0, 0] }],
    ['+Y con arriba −X', { direction: [0, 1, 0], up: [-1, 0, 0] }],
    ['+X', { direction: [1, 0, 0], up: [0, 1, 0] }],
    ['−X sin arriba', { direction: [-1, 0, 0] }],
    ['−Y con arriba inválido (+Y)', { direction: [0, -1, 0], up: [0, 1, 0] }],
    ['+Z viejo', { direction: [0, 0, 1], up: [0, 1, 0] }],
    ['diagonal inválida', { direction: [0.6, 0.6, 0.5] }],
    ['sin frente', undefined],
    ['−X casi', { direction: [-0.97, 0.1, 0.2] }],
  ];
  for (const [label, front] of cases) {
    const f = structuredClone(base);
    if (front) f.creature.front = front; else delete f.creature.front;
    const warns = c.persistence.loadText(JSON.stringify(f));
    const again = JSON.parse(c.persistence.toJSON()).creature.front;
    out.push(`${label} → frente ${JSON.stringify(c.construction.front.toArray())} arriba ${JSON.stringify(c.construction.up.toArray())} · se guarda ${JSON.stringify(again)}${warns.length ? ' · aviso: ' + warns.join(' | ') : ''}`);
  }
  // Tope de trazos: un archivo con 35 trazos carga 30.
  const k = structuredClone(base);
  k.pieces = Array.from({ length: 35 }, (_, i) => ({ id: `k${i}`, type: 'ketchup', parentId: 'root', seed: i + 1,
    attach: { mode: 'paint', entryPoint: [0, 0.01, 0], direction: [0, -1, 0], depth: 0, spin: 0 },
    params: { points: [0, 0.0105, i * 0.0005, 0.002, 0.0105, i * 0.0005], normals: [0, 1, 0, 0, 1, 0] } }));
  const kw = c.persistence.loadText(JSON.stringify(k));
  out.push(`35 trazos → ${c.interaction.strokeCount()} cargados · aviso: ${kw.join(' | ')}`);
  // En el juego, el trazo 31 no arranca.
  const hit = c.picker.pickAnyPiece(0, 0);
  if (hit) c.interaction['beginStroke'](hit);
  out.push(`intentar el trazo 31 → ${c.interaction.strokeCount()} trazos · ${document.getElementById('help').textContent}`);
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
