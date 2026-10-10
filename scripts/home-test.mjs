// Prueba: el chizito arranca parado y de frente; F lo devuelve a esa posición.
// Uso: node scripts/home-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/home';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
const shot = async (name, n) => fs.writeFileSync(`${out}/${name}.png`, Buffer.from((await page.evaluate((n) => window.__chizito.renderFrames(n), n)).split(',')[1], 'base64'));
// Eje largo (X local) y frente (+Z local) en el mundo.
const axes = () => page.evaluate(() => {
  const c = window.__chizito; const T = c.THREE;
  const long = new T.Vector3(1, 0, 0).applyQuaternion(c.pivot.quaternion);
  const front = c.construction.front.clone().applyQuaternion(c.pivot.quaternion);
  return `largo ${long.toArray().map((x) => x.toFixed(2))} · frente ${front.toArray().map((x) => x.toFixed(2))}`;
});
await shot('01-inicio-parado', 4);
console.log('al empezar:', await axes());
await page.evaluate(() => { const c = window.__chizito; c.pivot.quaternion.setFromEuler(new c.THREE.Euler(1.1, 2.3, -0.7)); });
await shot('02-girado', 2);
console.log('girado:', await axes());
await page.keyboard.press('KeyF');
await page.evaluate(() => window.__chizito.renderFrames(50));
await shot('03-tras-F', 2);
console.log('tras F:', await axes());
await browser.close();
