// Prueba de la Fase 4: frente (F), guardar/cargar la criatura por conexiones y tope de 40 piezas.
// Uso: node scripts/phase4-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/phase4';
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
const stick = async (bowlKey, local, keys = [], n = 22, dx = 20, dy = -25) => {
  const b = await findBowl(bowlKey);
  await click(...b); await frames(8);
  for (const k of keys) { await page.keyboard.press(k); await frames(2); }
  const pt = await screenOfLocal(local);
  await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
  await click(...pt);
  await page.mouse.move(pt[0] + dx, pt[1] + dy, { steps: 4 });
  await hold(n);
  await page.keyboard.press('Escape'); await frames(2);
};
// Matrices de mundo de todas las piezas, por id (para comparar después de cargar).
const poses = () => page.evaluate(() => {
  const c = window.__chizito; const out = {};
  // Pose relativa al padre (la del mundo incluye la flotación del chizito, que no es parte de la criatura).
  for (const n of c.construction.nodes.values()) if (n.parent) { n.object.updateMatrix(); out[n.data.id] = [...n.object.matrix.elements]; }
  return out;
});
const maxDiff = (a, b) => { let m = 0; for (const id of Object.keys(a)) { if (!b[id]) return Infinity; for (let i = 0; i < 16; i++) m = Math.max(m, Math.abs(a[id][i] - b[id][i])); } return m; };

// 1. Criatura: palito, papita partida, espadita, palito que atraviesa la papita, ketchup.
await stick('palito', [0.012, 0.004, 0.008]);
await stick('papita', [-0.014, 0.008, 0.004], ['KeyB', 'KeyE']);
await stick('escarbadientes:espadita', [0.019, 0.007, 0.004]);
const papScreen = await page.evaluate(() => {
  const c = window.__chizito; const T = c.THREE;
  const node = [...c.construction.nodes.values()].find((n) => n.data.type === 'papita');
  const v = new T.Vector3(0, 0.03, 0).applyMatrix4(node.object.matrixWorld).project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
});
{
  const b = await findBowl('palito');
  await click(...b); await frames(8);
  await page.mouse.move(papScreen[0], papScreen[1], { steps: 4 }); await frames(6);
  await click(...papScreen); await hold(30); await page.keyboard.press('Escape'); await frames(2);
}
{
  const dish = await findBowl('ketchup');
  await click(...dish); await frames(8);
  const path = []; for (let i = 0; i <= 10; i++) path.push([-0.012 + i * 0.002, 0.004 + Math.sin(i) * 0.002, 0.009]);
  let s = await screenOfLocal(path[0]); await page.mouse.move(s[0], s[1], { steps: 2 }); await frames(2);
  await page.mouse.down(); for (const p of path) { s = await screenOfLocal(p); await page.mouse.move(s[0], s[1], { steps: 2 }); await frames(1); }
  await page.mouse.up(); await page.keyboard.press('Escape'); await frames(4);
}
// 2. Frente: girar la criatura y apretar F.
await page.mouse.move(100, 100);
await page.evaluate(() => { const c = window.__chizito; c.pivot.quaternion.setFromEuler(new c.THREE.Euler(0.2, 0.9, 0.0)); });
await frames(2);
await page.keyboard.press('KeyF'); await frames(12);
await shot('01-frente-marcado', 2);
const front0 = await page.evaluate(() => window.__chizito.construction.front.toArray());
console.log('frente', front0.map((x) => x.toFixed(3)).join(', '));

// 3. Guardar.
const json = await page.evaluate(() => window.__chizito.persistence.toJSON());
fs.writeFileSync(`${out}/criatura.json`, json);
const file = JSON.parse(json);
console.log('archivo: versión', file.version, '· piezas', file.creature.pieceCount, '· registros', file.pieces.length, '· modos', [...new Set(file.pieces.map((p) => p.attach.mode))].join('/'));
console.log('¿guarda matrices sueltas?', json.includes('localMatrix') || json.includes('matrix') ? 'SÍ (mal)' : 'no');
console.log('jerarquía', file.pieces.map((p) => `${p.type}<${p.parentId === 'root' ? 'root' : file.pieces.find((q) => q.id === p.parentId)?.type}`).join(' '));
await frames(30); // que termine el "pop" de la última pieza
const p0 = await poses();

// 4. Reiniciar (R R) y cargar: todo vuelve al mismo lugar.
await page.keyboard.press('KeyR'); await page.keyboard.press('KeyR'); await frames(2);
console.log('tras reiniciar', (await state()).nodes);
await page.evaluate((t) => window.__chizito.persistence.loadText(t), json); await frames(2);
const p1 = await poses();
console.log('cargada en la misma página: dif. máx.', maxDiff(p0, p1).toExponential(2), '(m / adim.)');
console.log('frente igual', JSON.stringify(await page.evaluate(() => window.__chizito.construction.front.toArray().map((x) => +x.toFixed(4)))) === JSON.stringify(front0.map((x) => +x.toFixed(4))));
await page.keyboard.press('Control+z'); await frames(2);
console.log('deshacer la carga →', (await state()).nodes);
await page.keyboard.press('Control+Shift+z'); await frames(2);
await shot('02-cargada', 4);

// 5. En una página nueva (otra sesión): misma criatura, mismas poses.
const page2 = await browser.newPage({ viewport: { width: W, height: H } });
page2.on('pageerror', (e) => console.log('[pageerror2]', e.message));
await page2.goto('http://localhost:5173/?capture');
await page2.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
await page2.evaluate(([t, q]) => { const c = window.__chizito; c.pivot.quaternion.fromArray(q); c.persistence.loadText(t); }, [json, await page.evaluate(() => window.__chizito.pivot.quaternion.toArray())]);
const p2 = await page2.evaluate(() => { const c = window.__chizito; const o = {}; for (const n of c.construction.nodes.values()) if (n.parent) { n.object.updateMatrix(); o[n.data.id] = [...n.object.matrix.elements]; } return o; });
console.log('cargada en otra página: dif. máx.', maxDiff(p0, p2).toExponential(2));
const d2 = await page2.evaluate(() => window.__chizito.renderFrames(4));
fs.writeFileSync(`${out}/03-otra-pagina.png`, Buffer.from(d2.split(',')[1], 'base64'));
await page2.close();

// 6. Tope de 40: un archivo con 45 palitos carga 40 y no deja agarrar más.
const many = JSON.parse(json);
const base = many.pieces.find((p) => p.type === 'palito');
many.pieces = Array.from({ length: 45 }, (_, i) => ({ ...base, id: `palito-x${i}`, parentId: 'root', attach: { ...base.attach, spin: i * 0.3 } }));
many.pieces.push({ ...file.pieces.find((p) => p.type === 'ketchup'), id: 'ketchup-x', parentId: 'root' });
const warn = await page.evaluate((t) => window.__chizito.persistence.loadText(t), JSON.stringify(many));
console.log('45 palitos + ketchup →', await page.evaluate(() => window.__chizito.interaction.pieceCount()), 'piezas · avisos:', warn.join(' | '));
await click(...(await findBowl('palito'))); await frames(4);
console.log('agarrar con 40 →', (await state()).state, '·', await page.evaluate(() => document.getElementById('help').textContent));

// 7. Archivo inválido.
const bad = await page.evaluate(() => { try { window.__chizito.persistence.loadText('{"hola":1}'); return 'cargó (mal)'; } catch (e) { return 'rechazado: ' + e.message; } });
console.log('archivo cualquiera →', bad);
await browser.close();
