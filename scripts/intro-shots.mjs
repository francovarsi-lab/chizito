// Capturas de la intro: plano general con el título (los 3 estilos), el viaje y la llegada.
// Uso: node scripts/intro-shots.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/intro';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const styles = (process.env.STYLES ?? 'arcade,globo,neon').split(',');
for (const [i, style] of styles.entries()) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:5173/?capture&intro&titulo=${style}`);
  await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
  await page.evaluate(() => { document.body.classList.add('ready'); return document.fonts.ready; });
  await page.evaluate(() => window.__chizito.renderFrames(40));
  await page.waitForTimeout(1800); // que se disuelva el velo
  await page.screenshot({ path: `${out}/0${i + 1}-titulo-${style}.png` });
  console.log('titulo', style);
  if (i === 0) {
    await page.evaluate(() => window.__chizito.startGame());
    await page.waitForTimeout(1000); // que se vaya el título
    // El viaje dura 3,2 s: se avanza en pasos de 1/15 s (el render por software es lento).
    for (const [n, name] of [[16, '04-viaje-1'], [14, '05-viaje-2'], [30, '06-llegada']]) {
      await page.evaluate((n) => window.__chizito.renderFrames(n, 1 / 15), n);
      await page.screenshot({ path: `${out}/${name}.png` });
      console.log(name, await page.evaluate(() => window.__chizito.interaction.enabled));
    }
  }
  await page.close();
}
await browser.close();
