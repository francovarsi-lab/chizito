// Verifica que el nacho entra por su punta y atraviesa la superficie (sin quedar flotando).
// Uso: node scripts/nacho-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/nacho';
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

await page.evaluate(() => { const c = window.__chizito; c.pivot.quaternion.setFromEuler(new c.THREE.Euler(0.3, -0.25, 0.05)); c.rig.targetDistance = 0.2; });
await frames(30);
const b = await findBowl('nacho');
await click(...b); await frames(8);
const pt = await screenOfLocal([0.004, 0.0102, 0.003]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(8);
await shot('01-nacho-apuntando', 2);
await click(...pt);
await page.mouse.move(pt[0] + 10, pt[1] - 6, { steps: 3 });
await hold(30);
await page.keyboard.press('Escape'); await page.mouse.move(40, 40); await frames(8);
await shot('02-nacho-clavado', 6);
// La punta del nacho tiene que estar adentro del chizito: distancia del punto más bajo de la malla a la
// superficie, medida con un rayo desde afuera a lo largo del eje de inserción.
const r = await page.evaluate(() => {
  const c = window.__chizito; const T = c.THREE;
  const node = [...c.construction.nodes.values()].find((n) => n.data.type === 'nacho');
  node.object.updateMatrixWorld(true);
  const tip = new T.Vector3(0, 0, 0).applyMatrix4(node.object.matrixWorld);
  const dir = new T.Vector3().fromArray(node.data.direction).transformDirection(c.pivot.matrixWorld).normalize();
  const entry = new T.Vector3().fromArray(node.data.entryPoint).applyMatrix4(c.pivot.matrixWorld);
  // Vértice más bajo de la malla en el marco de la pieza: tiene que estar en el origen (la punta real).
  const inv = node.object.matrixWorld.clone().invert(); const v = new T.Vector3(); let low = null;
  node.object.traverse((o) => { if (!o.isMesh) return; const m = inv.clone().multiply(o.matrixWorld); const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); if (!low || v.y < low.y) low = v.clone(); } });
  return { depthMm: (node.data.depth * 1000).toFixed(2), tipBelowEntryMm: (tip.clone().sub(entry).dot(dir) * 1000).toFixed(2),
    lowestVertexMm: low.toArray().map((x) => (x * 1000).toFixed(2)).join(', ') };
});
console.log('nacho:', JSON.stringify(r));
await browser.close();
