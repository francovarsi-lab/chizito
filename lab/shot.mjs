import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(url); await p.waitForFunction(() => document.body.dataset.ready, null, { timeout: 120000 });
await p.screenshot({ path: out }); await b.close();
