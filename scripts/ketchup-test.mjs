// Prueba del ketchup (modo DRAWING), los vasitos de escarbadientes / espaditas y la sacudida a pocos fps.
// Uso: node scripts/ketchup-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/ketchup';
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

const tree = () => page.evaluate(() => [...window.__chizito.construction.nodes.values()].map((n) => `${n.data.type}${n.data.params?.variant ? ':' + n.data.params.variant : ''}${n.data.type === 'ketchup' ? '(' + n.data.params.points.length / 3 + ')' : ''}<${n.parent ? n.parent.data.type : '-'}`).join(' '));
const pivotY = () => page.evaluate(() => window.__chizito.pivot.position.y);
await page.evaluate(() => { const c = window.__chizito; c.pivot.quaternion.setFromEuler(new c.THREE.Euler(0.5, -0.2, 0.05)); });

// 1. Palito clavado a 20 fps (antes el chizito salía disparado).
const cup = await findBowl('palito');
await click(...cup); await frames(6);
let pt = await screenOfLocal([0.012, 0.004, 0.008]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await click(...pt);
await page.mouse.move(pt[0] + 20, pt[1] - 20, { steps: 2 });
await page.mouse.down();
await page.evaluate(() => window.__chizito.renderFrames(30, 1 / 20));
await page.mouse.up();
console.log('pivote y a 20 fps (reposo 0.1):', (await pivotY()).toFixed(4));
await page.keyboard.press('Escape');
await shot('01-palito-20fps', 4);

// 2. Escarbadientes y espadita salen de vasitos distintos.
for (const key of ['escarbadientes', 'escarbadientes:espadita']) {
  const b = await findBowl(key);
  await click(...b); await frames(8);
  console.log(key, '→', await page.evaluate(() => window.__chizito.interaction['active'].params.variant));
  await page.keyboard.press('Escape'); await frames(14);
}

// 3. Ketchup sobre el chizito: un trazo en zigzag.
const dish = await findBowl('ketchup');
await click(...dish); await frames(10);
console.log('estado', (await state()).state);
const path = [];
for (let i = 0; i <= 16; i++) path.push([-0.016 + i * 0.002, 0.006 + Math.sin(i * 0.9) * 0.003, 0.008]);
pt = await screenOfLocal(path[0]);
await page.mouse.move(pt[0], pt[1], { steps: 3 }); await frames(6);
await shot('02-sobre-en-la-mano', 2);
await page.mouse.down(); await frames(2);
for (const p of path) { const s = await screenOfLocal(p); await page.mouse.move(s[0], s[1], { steps: 2 }); await frames(1); }
await page.mouse.up(); await frames(2);
await shot('03-ketchup-chizito', 4);

// 4. Ketchup sobre el palito.
const pal = await page.evaluate(() => {
  const c = window.__chizito; const T = c.THREE;
  const node = [...c.construction.nodes.values()].find((n) => n.data.type === 'palito');
  return [0.012, 0.016, 0.02].map((y) => { const v = new T.Vector3(0, y, 0).applyMatrix4(node.object.matrixWorld).project(c.stage.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
});
await page.mouse.move(pal[0][0], pal[0][1], { steps: 2 }); await frames(2);
await page.mouse.down(); await frames(1);
for (const s of pal) { await page.mouse.move(s[0], s[1], { steps: 3 }); await frames(1); }
await page.mouse.up(); await frames(2);
await page.mouse.move(pal[0][0] + 250, pal[0][1] + 150, { steps: 2 });
await shot('04-ketchup-palito', 6);

const t0 = await tree();
console.log('árbol', t0);
await page.keyboard.press('Control+z'); await frames(2);
console.log('deshacer', await tree());
await page.keyboard.press('Control+Shift+z'); await frames(2);
const t1 = await tree();
console.log('rehacer', t1 === t0 ? 'OK' : 'DISTINTO ' + t1);
await page.keyboard.press('Escape'); await frames(10);
console.log('tras Esc', (await state()).state);
await shot('05-final', 6);
await browser.close();
