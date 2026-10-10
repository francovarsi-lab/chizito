// Prueba: la guarda en cruz de la espadita es el tope de inserción (sólo entra la hoja).
// Uso: node scripts/espadita-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/espadita';
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

await page.evaluate(() => { const c = window.__chizito; c.pivot.quaternion.setFromEuler(new c.THREE.Euler(0, -0.5, Math.PI / 2)); c.rig.targetDistance = 0.22; });
await frames(30);
await click(...(await findBowl('escarbadientes:espadita'))); await frames(8);
const pt = await screenOfLocal([0.004, 0.003, 0.0102]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await click(...pt);
await page.mouse.move(pt[0] + 8, pt[1] - 5, { steps: 2 });
await hold(120); // muchísimo más de lo necesario
await page.keyboard.press('Escape'); await page.mouse.move(40, 40); await frames(6);
await shot('01-espadita-hasta-la-guarda', 6);
const r = await page.evaluate(() => {
  const n = [...window.__chizito.construction.nodes.values()].find((x) => x.data.params?.variant === 'espadita');
  return { depthMm: +(n.data.depth * 1000).toFixed(2) };
});
console.log('espadita: profundidad', r.depthMm, 'mm (guarda a 21 mm de la punta; tope 20,2 mm)');
// Con Ctrl + rueda tampoco pasa la guarda.
await click(...(await screenOfLocal([0.004, 0.003, 0.0102]))); await frames(2);
await page.keyboard.down('Control');
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -400); await frames(4); }
await page.keyboard.up('Control'); await frames(30);
console.log('tras Ctrl+rueda', await page.evaluate(() => +([...window.__chizito.construction.nodes.values()].find((x) => x.data.params?.variant === 'espadita').data.depth * 1000).toFixed(2)), 'mm');
await browser.close();
