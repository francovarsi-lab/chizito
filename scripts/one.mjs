// Captura única rápida: node scripts/one.mjs "<query>" out.png
import { chromium } from 'playwright';
import fs from 'node:fs';
const [q = '', out = 'one.png', frames = '30'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 960), height: Number(process.env.H ?? 540) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 300)); });
await page.goto(`http://localhost:5173/?capture&${q}`);
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
const data = await page.evaluate((n) => window.__chizito.renderFrames(n), Number(frames));
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
