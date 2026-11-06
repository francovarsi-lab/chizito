import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
await p.goto('http://localhost:5173/?capture');
await p.waitForFunction(() => document.body.dataset.ready, null, { timeout: 300000 });
const out = await p.evaluate(() => {
  const { stage, THREE } = window.__chizito;
  const info = (o) => { const bb = new THREE.Box3().setFromObject(o); const c = bb.getCenter(new THREE.Vector3()); return `${o.type}:${o.name || '-'} vis=${o.visible} kids=${o.children.length} c=(${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}) s=(${(bb.max.x-bb.min.x).toFixed(2)},${(bb.max.y-bb.min.y).toFixed(2)},${(bb.max.z-bb.min.z).toFixed(2)})`; };
  const lines = [];
  for (const c of stage.scene.children) { lines.push('S ' + info(c)); if (c.name === 'backdrop') for (const k of c.children) lines.push('   B ' + info(k)); }
  return lines.join('\n');
});
console.log(out);
await b.close();
