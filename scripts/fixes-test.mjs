// Prueba de las correcciones: ketchup que se borra, nacho triangular, bowls sin piezas que atraviesan,
// chizito nuevo al recargar y aceitunas que se ensartan en palitos. Uso: node scripts/fixes-test.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/fixes';
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

const tree = () => page.evaluate(() => [...window.__chizito.construction.nodes.values()].map((n) => `${n.data.type}${n.data.mount ? '@cola' : ''}<${n.parent ? n.parent.data.type : '-'}`).join(' '));
const screenOfNode = (type, local) => page.evaluate(([type, local]) => {
  const c = window.__chizito; const T = c.THREE;
  const node = [...c.construction.nodes.values()].find((n) => n.data.type === type);
  const v = new T.Vector3(...local).applyMatrix4(node.object.matrixWorld).project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
}, [type, local]);
const screenOfActive = () => page.evaluate(() => {
  const c = window.__chizito; const T = c.THREE;
  const v = new T.Box3().setFromObject(c.interaction['active'].object).getCenter(new T.Vector3()).project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
});

await shot('00-escena-bowls', 4);

// Nacho en la mano, de cerca.
await click(...(await findBowl('nacho'))); await frames(30);
await page.mouse.move(W * 0.5, H * 0.3, { steps: 3 }); await frames(20);
await shot('01-nacho-en-la-mano', 2);
await page.keyboard.press('Escape'); await frames(14);

// Aceituna: no entra en el chizito; sí en la punta de un palito.
await page.evaluate(() => { const c = window.__chizito; c.pivot.quaternion.setFromEuler(new c.THREE.Euler(0, 0, 0)); c.rig.targetDistance = 0.34; });
await frames(30);
await click(...(await findBowl('palito'))); await frames(6);
let pt = await screenOfLocal([0.006, 0.0102, 0.002]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await click(...pt); await page.mouse.move(pt[0] + 6, pt[1] - 4, { steps: 2 }); await hold(16);
await page.keyboard.press('Escape'); await frames(4);
await click(...(await findBowl('aceituna'))); await frames(8);
pt = await screenOfLocal([-0.012, 0.0102, 0.002]);
await page.mouse.move(pt[0], pt[1], { steps: 3 }); await frames(4);
await click(...pt); await frames(4);
console.log('aceituna sobre el chizito →', (await state()).state, '·', await tree());
pt = await screenOfNode('palito', [0, 0.028, 0]);
await page.mouse.move(pt[0], pt[1], { steps: 3 }); await frames(2);
await click(...pt); await frames(20);
let c2 = await screenOfActive();
await page.mouse.move(c2[0], c2[1], { steps: 3 }); await frames(4);
await shot('02-aceituna-presentada', 2);
await click(c2[0], c2[1]); await frames(16);
console.log('clic en la aceituna →', (await state()).state);
await hold(40);
await page.keyboard.press('Escape'); await page.mouse.move(50, 50); await frames(6);
await shot('03-aceituna-ensartada', 4);
console.log('aceituna →', await tree());

// Ketchup: dibujar, elegir el trazo y Supr; dibujar otro y borrarlo con la goma (Shift).
const draw = async (y) => {
  const path = []; for (let i = 0; i <= 10; i++) path.push([-0.016 + i * 0.0025, y + Math.sin(i) * 0.0015, 0.0098]);
  let s = await screenOfLocal(path[0]); await page.mouse.move(s[0], s[1], { steps: 2 }); await frames(2);
  await page.mouse.down(); for (const p of path) { s = await screenOfLocal(p); await page.mouse.move(s[0], s[1], { steps: 2 }); await frames(1); }
  await page.mouse.up(); await frames(2);
  return path;
};
await click(...(await findBowl('ketchup'))); await frames(8);
const path1 = await draw(0.002);
await page.keyboard.press('Escape'); await frames(10);
await shot('04-ketchup', 4);
console.log('con ketchup →', await tree());
const onStroke = await screenOfLocal([path1[5][0], path1[5][1], path1[5][2] + 0.0012]);
await click(...onStroke); await frames(4);
console.log('clic en el trazo →', (await state()).state, '·', await page.evaluate(() => document.getElementById('help').textContent));
await page.keyboard.press('Delete'); await frames(4);
console.log('Supr →', await tree());
await click(...(await findBowl('ketchup'))); await frames(8);
const path2 = await draw(-0.003);
console.log('otro trazo →', await tree());
await page.keyboard.down('Shift');
let s = await screenOfLocal(path2[0]); await page.mouse.move(s[0], s[1], { steps: 2 }); await frames(2);
await page.mouse.down();
for (const p of path2) { s = await screenOfLocal([p[0], p[1], p[2] + 0.0012]); await page.mouse.move(s[0], s[1], { steps: 2 }); await frames(1); }
await page.mouse.up(); await page.keyboard.up('Shift'); await frames(2);
console.log('goma →', await tree());
await page.keyboard.press('Control+z'); await frames(2);
console.log('deshacer la goma →', await tree());
await page.keyboard.press('Escape'); await frames(6);
await shot('05-final', 4);

// Recargar: siempre un chizito nuevo (el autoguardado sólo vuelve con ?recuperar).
await page.waitForTimeout(800);
// Otra "pestaña" con el mismo autoguardado que dejó esta página.
const saved = await page.evaluate(() => localStorage.getItem('chizito.criatura.v1'));
console.log('autoguardado:', saved ? `${JSON.parse(saved).creature.pieceCount} piezas` : 'nada');
const ctx2 = await browser.newContext({ viewport: { width: 640, height: 360 } });
await ctx2.addInitScript((t) => { if (t && !sessionStorage.getItem('x')) { localStorage.setItem('chizito.criatura.v1', t); sessionStorage.setItem('x', '1'); } }, saved);
const seeds = [];
for (const q of ['', '', 'recuperar']) {
  const p2 = await ctx2.newPage();
  await p2.goto(`http://localhost:5173/?${q}`);
  await p2.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
  const r = await p2.evaluate(() => ({ seed: window.__chizito.construction.root.data.seed, pieces: window.__chizito.construction.nodes.size - 1 }));
  console.log(`abrir /?${q} → semilla ${r.seed}, piezas ${r.pieces}`);
  seeds.push(r.seed);
  await p2.close();
}
await browser.close();
