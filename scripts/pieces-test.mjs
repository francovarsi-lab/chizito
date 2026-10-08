// Prueba de las piezas nuevas: nacho, aceituna, escarbadientes y espadita (variante con V).
// Uso: node scripts/pieces-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/pieces';
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

await page.evaluate(() => { const c = window.__chizito; c.pivot.quaternion.setFromEuler(new c.THREE.Euler(0.5, -0.2, 0.05)); });
await shot('00-escena', 4);

const stick = async (type, local, name, keys = [], n = 24) => {
  const b = await findBowl(type);
  await click(...b); await frames(8);
  for (const k of keys) { await page.keyboard.press(k); await frames(2); }
  const pt = await screenOfLocal(local);
  await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
  await shot(`${name}-mano`, 2);
  await click(...pt);
  await page.mouse.move(pt[0] + 20, pt[1] - 25, { steps: 4 });
  await hold(n);
  await page.mouse.move(pt[0] + 200, pt[1] + 200, { steps: 2 });
  await shot(name, 6);
  await page.keyboard.press('Escape');
};

await stick('nacho', [-0.014, 0.008, 0.004], '01-nacho', ['KeyE', 'KeyE', 'KeyB']);
await stick('aceituna', [0.0, 0.01, 0.006], '02-aceituna');
await stick('escarbadientes', [0.014, 0.004, 0.008], '03-escarbadientes');
await stick('escarbadientes', [0.019, 0.007, 0.004], '04-espadita', ['KeyV']);

const variants = await page.evaluate(() => [...window.__chizito.construction.nodes.values()].map((n) => n.data.params?.variant ?? '').join(','));
console.log('variantes', variants);
await page.keyboard.press('Control+z'); await frames(2);
await page.keyboard.press('Control+Shift+z'); await frames(2);
const after = await page.evaluate(() => [...window.__chizito.construction.nodes.values()].map((n) => n.data.params?.variant ?? '').join(','));
console.log('tras deshacer/rehacer', after, after === variants ? 'OK' : 'DISTINTO');
await shot('05-final', 6);
await browser.close();
