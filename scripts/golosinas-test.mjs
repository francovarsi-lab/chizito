// Prueba de los golosinas nuevas: palito de la selva (se desenvuelve al agarrarlo) y chupetín.
// Uso: node scripts/golosinas-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/golosinas';
fs.mkdirSync(out, { recursive: true });
const W = 1280, H = 720;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });

const frames = (n) => page.evaluate((n) => window.__chizito.renderFrames(n), n);
const state = () => page.evaluate(() => {
  const c = window.__chizito;
  const nodes = [...c.construction.nodes.values()].map((n) => `${n.data.type}<${n.parent ? n.parent.data.type : '-'}`);
  return { state: c.interaction.state, nodes: nodes.join(' '), crumbs: c.crumbs['crumbs'].length };
});
const shot = async (name, n = 4) => {
  const data = await frames(n);
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(name, JSON.stringify(await state()));
};
const findBowl = (type) => page.evaluate((type) => {
  const c = window.__chizito;
  for (let y = -0.95; y < 0.9; y += 0.05) for (let x = -0.95; x < 0.96; x += 0.05) {
    if (c.picker.pickBowl(x, y) === type) return [(x * 0.5 + 0.5) * innerWidth, (-y * 0.5 + 0.5) * innerHeight];
  }
  throw new Error('no encontré ' + type);
}, type);
const screenOfLocal = (local) => page.evaluate((local) => {
  const c = window.__chizito; const T = c.THREE;
  const v = new T.Vector3(...local).applyMatrix4(c.pivot.matrixWorld).project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
}, local);
const click = async (x, y) => { await page.mouse.move(x, y, { steps: 3 }); await page.mouse.down(); await page.mouse.up(); };
const hold = async (n, shift = false) => {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down(); await frames(n); await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
};

// Girar un poco para tener una cara frontal amplia.
await page.evaluate(() => { const c = window.__chizito; c.pivot.quaternion.setFromEuler(new c.THREE.Euler(0.5, -0.2, 0.05)); });

await shot('00-escena', 4);
// Palito de la selva: el papel se desenrolla en la mano.
await click(...(await findBowl('palito-selva')));
await page.mouse.move(W * 0.5, H * 0.32, { steps: 3 });
await frames(26); await shot('01-selva-envuelto', 1);
await frames(22); await shot('02-selva-desenrollando', 1);
await frames(40); await shot('03-selva-papel-cayendo', 1);
let pt = await screenOfLocal([0.012, 0.0, 0.0105]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await click(...pt);
await page.mouse.move(pt[0] + 14, pt[1] - 6, { steps: 2 });
await hold(40);
await page.keyboard.press('Escape'); await frames(4);
console.log('selva →', (await state()).nodes);
// Chupetín.
await click(...(await findBowl('chupetin'))); await frames(10);
pt = await screenOfLocal([-0.012, 0.004, 0.0102]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await shot('04-chupetin-en-la-mano', 2);
await click(...pt);
await page.mouse.move(pt[0] - 16, pt[1] - 8, { steps: 2 });
await hold(40);
await page.keyboard.press('Escape'); await page.mouse.move(40, 40); await frames(30);
await shot('05-final', 6);
console.log('final →', (await state()).nodes);
// Guardar / cargar: las golosinas nuevas pasan por el archivo.
const json = await page.evaluate(() => window.__chizito.persistence.toJSON());
await page.evaluate((t) => window.__chizito.persistence.loadText(t), json);
console.log('tras cargar →', (await state()).nodes);
await browser.close();
