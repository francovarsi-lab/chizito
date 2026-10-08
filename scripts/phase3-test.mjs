// Prueba jugable automatizada de la Fase 3: feedback, papitas, edición, deshacer/rehacer, reinicio.
// Uso: node scripts/phase3-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/phase3';
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

// 1. Palito con migas y sacudida.
const cup = await findBowl('palito');
await click(...cup); await frames(6);
let pt = await screenOfLocal([0.012, 0.004, 0.008]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await click(...pt);
await page.mouse.move(pt[0] + 40, pt[1] - 30, { steps: 4 });
await page.mouse.down(); await frames(8); await shot('01-contacto-sacudida', 1);
await frames(30); await page.mouse.up(); await frames(40);
await shot('02-migas-en-la-mesa', 4);
await page.keyboard.press('Escape');

// 2. Papita de canto.
const bowl = await findBowl('papita');
await click(...bowl); await frames(6);
pt = await screenOfLocal([-0.014, 0.008, 0.004]);
await page.mouse.move(pt[0], pt[1], { steps: 4 }); await frames(6);
await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE');
await shot('03-papita-preview', 6);
await click(...pt);
await page.mouse.move(pt[0] - 30, pt[1] - 40, { steps: 4 });
await hold(20);
await shot('04-papita-clavada', 6);
await page.keyboard.press('Escape');

// 3. Palito que atraviesa la papita (queda como hijo de la papita).
await click(...cup); await frames(6);
const papScreen = await page.evaluate(() => {
  const c = window.__chizito; const T = c.THREE;
  const node = [...c.construction.nodes.values()].find((n) => n.data.type === 'papita');
  const v = new T.Vector3(0, 0.03, 0).applyMatrix4(node.object.matrixWorld).project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
});
await page.mouse.move(papScreen[0], papScreen[1], { steps: 4 }); await frames(6);
await click(...papScreen);
await hold(40);
await shot('05-palito-en-papita', 6);
await page.keyboard.press('Escape');

// 4. Seleccionar el primer palito, quitarlo, deshacer y rehacer.
const firstPalito = await page.evaluate(() => {
  const c = window.__chizito; const T = c.THREE;
  const node = [...c.construction.nodes.values()].find((n) => n.data.type === 'palito' && n.parent.data.type === 'chizito');
  const v = new T.Vector3(0, node.data.depth + 0.012, 0).applyMatrix4(node.object.matrixWorld).project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
});
await click(...firstPalito);
await shot('06-seleccionado', 4);
await page.keyboard.press('Delete');
await shot('07-quitado', 4);
await page.keyboard.press('Control+KeyZ');
await shot('08-deshacer', 4);
await page.keyboard.press('Control+Shift+KeyZ');
await shot('09-rehacer', 4);
await page.keyboard.press('Control+KeyZ');

// 5. Reiniciar (R dos veces) y deshacer el reinicio.
await page.keyboard.press('KeyR'); await page.keyboard.press('KeyR');
await shot('10-reiniciado', 4);
await page.keyboard.press('Control+KeyZ');
await shot('11-reinicio-deshecho', 4);
await browser.close();
