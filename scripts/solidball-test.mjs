// Prueba de la bola sólida del chupetín (choque exacto triángulo-esfera). Uso: node scripts/solidball-test.mjs  (con `npm run dev`)
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });
const res = await page.evaluate(async () => {
  const { findBallHit } = await import('/src/interaction/solidBall.ts');
  const c = window.__chizito; const T = c.THREE;
  const root = new T.Group();
  const mk = (type, x, y = 0) => { const o = c.assets.create(type, 7, 'hero'); o.position.set(x, y, 0); root.add(o); return o; };
  const A = mk('chupetin', 0);
  const q = (active, parent = null) => !!findBallHit({ root, active, pieceObjects: new Set([root, A, active]), parent });
  const out = {};
  const stick = mk('palito', 0.05); // lejos de la bola
  out.palitoLejos = q(stick);
  stick.position.set(0, 0.04, 0); // la punta entra en la bola: palito vertical que la atraviesa
  out.palitoAtraviesaLaBola = q(stick);
  stick.position.set(0.02, 0, 0); stick.position.y = 0.075; // al costado de la bola (a 2 cm)
  out.palitoAlLado = q(stick);
  const B = mk('chupetin', 0.05);
  out.chupetinLejos = q(B);
  B.position.set(0.012, 0.0, 0); // las bolas se superponen
  out.bolasSuperpuestas = q(B);
  B.position.set(0.2, 0, 0); stick.position.set(0.2, 0.2, 0); // se apartan los demás
  out.propioPalitoSinBola = q(A); // sola, sin otros: su bola no cuenta contra sí misma
  return out;
});
console.log(res);
const ok = !res.palitoLejos && res.palitoAtraviesaLaBola && !res.palitoAlLado && !res.chupetinLejos && res.bolasSuperpuestas && !res.propioPalitoSinBola;
console.log(ok ? 'OK' : 'FALLO');
await browser.close();
process.exit(ok ? 0 : 1);
