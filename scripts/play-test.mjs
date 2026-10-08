// Prueba jugable automatizada de la Fase 2: agarrar, apuntar, clavar, girar, atravesar, sacar.
// Uso: node scripts/play-test.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/play';
fs.mkdirSync(out, { recursive: true });
const W = 1280, H = 720;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });

const frames = (n) => page.evaluate((n) => window.__chizito.renderFrames(n), n);
const shot = async (name, n = 4) => {
  const data = await frames(n);
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  const st = await page.evaluate(() => {
    const c = window.__chizito;
    return { state: c.interaction.state, pieces: c.construction.nodes.size };
  });
  console.log(name, JSON.stringify(st));
};
const screenOf = (expr) => page.evaluate((expr) => {
  const c = window.__chizito; const THREE = c.THREE;
  const v = eval(expr).clone().project(c.stage.camera);
  return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
}, expr);

// 1. Agarrar un palito del bowl.
// Busca un punto visible del vaso de palitos (a la derecha del encuadre).
const bowl = await page.evaluate(() => {
  const c = window.__chizito;
  for (let y = -0.95; y < 0.9; y += 0.05) for (let x = 0.95; x > 0; x -= 0.05) {
    if (c.picker.pickBowl(x, y) === 'palito') return [(x * 0.5 + 0.5) * innerWidth, (-y * 0.5 + 0.5) * innerHeight];
  }
  throw new Error('no encontré el bowl de palitos');
});
await page.mouse.move(bowl[0], bowl[1]);
await page.mouse.down(); await page.mouse.up();
await frames(20);
// 2. Cursor en el aire (palito en la mano).
await page.mouse.move(W * 0.7, H * 0.3);
await shot('01-en-la-mano', 30);
// 3. Sobre el chizito: previsualización perpendicular.
const ch = await screenOf("c.pivot.position.clone().add(new THREE.Vector3(0.008, 0.004, 0))");
await page.mouse.move(ch[0], ch[1], { steps: 4 });
await shot('02-preview', 30);
// 4. Fijar el punto y elegir el ángulo.
await page.mouse.down(); await page.mouse.up();
await page.mouse.move(ch[0] + 70, ch[1] - 50, { steps: 6 });
await page.keyboard.press('ArrowRight');
await shot('03-apuntando', 10);
// 5. Mantener apretado: clavar ~1,2 s.
await page.mouse.down();
await frames(72);
await page.mouse.up();
await shot('04-clavado', 6);
// 6. Seguir hundiendo hasta atravesar.
await page.mouse.down();
await frames(110);
await page.mouse.up();
await shot('05-atravesado', 6);
// 7. Girar con clic derecho para ver el otro lado.
await page.mouse.move(W * 0.5, H * 0.5);
await page.mouse.down({ button: 'right' });
await page.mouse.move(W * 0.5 + 260, H * 0.5 + 30, { steps: 8 });
await page.mouse.up({ button: 'right' });
await shot('06-girado', 50);
// 8. Otro palito desde el bowl, clavado en otro punto.
await page.mouse.move(bowl[0], bowl[1]);
await page.mouse.down(); await page.mouse.up();
await frames(10);
const ch2 = await screenOf("c.pivot.position.clone().add(new THREE.Vector3(-0.012, 0.003, 0.004))");
await page.mouse.move(ch2[0], ch2[1], { steps: 4 });
await frames(10);
await page.mouse.down(); await page.mouse.up();
await page.mouse.move(ch2[0] - 40, ch2[1] - 60, { steps: 5 });
await page.mouse.down(); await frames(80); await page.mouse.up();
await shot('07-dos-palitos', 6);
// 9. Shift + mantener: sacarlo del todo (vuelve a la mano).
await page.keyboard.down('Shift');
await page.mouse.down(); await frames(200); await page.mouse.up();
await page.keyboard.up('Shift');
await shot('08-sacado', 10);
await browser.close();
