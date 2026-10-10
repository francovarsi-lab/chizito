import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('crash', () => console.log('[CRASH]'));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[page]', m.type(), m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/?capture&intro');
await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 300000 });
await page.evaluate(() => window.__chizito.renderFrames(10));
await page.evaluate(() => window.__chizito.startGame());
for (let i = 0; i < 14; i++) {
  const t0 = Date.now();
  const r = await page.evaluate(() => { window.__chizito.renderFrames(15); return { mem: performance.memory?.usedJSHeapSize, en: window.__chizito.interaction.enabled, geos: window.__chizito.stage.renderer.info.memory.geometries }; });
  console.log(i, Date.now() - t0, 'ms', JSON.stringify(r));
}
await browser.close();
