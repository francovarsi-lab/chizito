// Prueba del chizito ensartable: chizito + palito + chizito (y otro palito en el chizito nuevo).
// Uso: node scripts/mount-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/mount';
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

const screenOfNode = (type, local, nth = 0) => page.evaluate(([type, local, nth]) => {
  const c = window.__chizito; const T = c.THREE;
  const node = [...c.construction.nodes.values()].filter((n) => n.data.type === type)[nth];
  const v = new T.Vector3(...local).applyMatrix4(node.object.matrixWorld).project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
}, [type, local, nth]);
const screenOfActive = () => page.evaluate(() => {
  const c = window.__chizito; const T = c.THREE;
  const o = c.interaction['active'].object;
  const v = o.getWorldPosition(new T.Vector3()).project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
});

// Zoom un poco hacia atrás para que entre la torre.
await page.evaluate(() => { const r = window.__chizito.rig; r.targetDistance = 0.36; });
await frames(30);

// 1. Palito parado arriba del chizito.
const cup = await findBowl('palito');
await click(...cup); await frames(6);
let pt = await screenOfLocal([0.006, 0.0102, 0.002]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await click(...pt);
await page.mouse.move(pt[0] + 6, pt[1] - 4, { steps: 2 });
await hold(16);
await page.keyboard.press('Escape'); await frames(4);
await shot('01-palito-arriba', 4);

// 2. Chizito del bowl → clic en el palito: se presenta sobre la punta.
const bowl = await findBowl('chizito');
await click(...bowl); await frames(10);
await shot('02-chizito-en-la-mano', 2);
pt = await screenOfNode('palito', [0, 0.028, 0]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(2);
await click(...pt); await frames(20);
const c2 = await screenOfActive();
await page.mouse.move(c2[0] + 8, c2[1] + 4, { steps: 4 }); await frames(4);
await shot('03-presentado-elegir-punto', 4);

// 3. Clic en el chizito nuevo (punto de entrada) → inclinar → mantener = ensartar.
await click(c2[0] + 8, c2[1] + 4); await frames(16);
await page.mouse.move(c2[0] + 30, c2[1] - 10, { steps: 4 }); await frames(10);
await shot('04-apuntando', 4);
await hold(40);
await page.mouse.move(c2[0] + 300, c2[1] + 200, { steps: 2 });
await shot('05-ensartado', 6);
await page.keyboard.press('Escape'); await frames(2);

// 4. Otro palito clavado en el chizito nuevo (la torre sigue).
await click(...cup); await frames(6);
pt = await screenOfNode('chizito', [-0.012, 0.009, 0.003], 1);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await click(...pt);
await page.mouse.move(pt[0] - 20, pt[1] - 10, { steps: 2 });
await hold(16);
await page.keyboard.press('Escape'); await frames(2);
await shot('06-palito-en-el-chizito-nuevo', 6);

const tree = () => page.evaluate(() => [...window.__chizito.construction.nodes.values()].map((n) => `${n.data.type}${n.data.mount ? '@cola' : ''}<${n.parent ? n.parent.data.type : '-'}`).join(' '));
const t0 = await tree();
console.log('árbol', t0);
await page.keyboard.press('Control+z'); await frames(2);
await page.keyboard.press('Control+z'); await frames(2);
console.log('deshacer x2', await tree());
await page.keyboard.press('Control+Shift+z'); await frames(2);
await page.keyboard.press('Control+Shift+z'); await frames(2);
const t1 = await tree();
console.log('rehacer x2', t1, t1 === t0 ? 'OK' : 'DISTINTO');
await shot('07-final', 6);
await browser.close();
