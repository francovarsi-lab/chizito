// Tira de cuadros de la animación: un ciclo de cada criatura (camina, salta, se arrastra, rueda) en docs/creature/animacion.svg (+ .png si hay Chromium).
// Uso: node scripts/creature-sim-strip.mjs
import { createServer } from 'vite';
import fs from 'node:fs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const I = await server.ssrLoadModule('/src/creature/index.ts');
const load = (n) => JSON.parse(fs.readFileSync(`src/creature/fixtures/${n}.snapshot.json`, 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const hop = clone(load('A'));
hop.pieces = hop.pieces.filter((p) => p.id !== 'palito-fxA4');
hop.links = hop.links.filter((l) => l.childId !== 'palito-fxA4');
const rows = [
  ['A · camina (2 apoyos)', load('A'), 'cycle'],
  ['vegetal · camina', load('veg'), 'cycle'],
  ['A con un solo pie · salta', hop, 'cycle'],
  ['B · se arrastra', load('B'), 'cycle'],
  ['mi criatura · se arrastra', load('criatura-20261011-1623'), 'cycle'],
  ['D · rueda', load('D'), 'roll'],
];
const CELLS = 6;
const SCALE = 3200; // px por metro
const CW = 270;
const CH = 360;
const f = (x) => x.toFixed(1);
let svg = '';
rows.forEach(([name, snap, kind], ri) => {
  const a = I.interpret(snap);
  const plan = I.makeSimPlan(a);
  const warm = 60;
  const cycleFrames = plan.mode === 'hop' ? plan.airFrames + plan.pauseFrames : Math.max(CELLS, Math.round(plan.stride / plan.speed / I.CREATURE_CONFIG.sim.dt));
  const step = kind === 'roll' ? 30 : Math.max(1, Math.round(cycleFrames / CELLS));
  const run = I.runSim(plan, warm + step * CELLS + 1, () => ({ move: plan.facing }));
  const y0 = ri * CH;
  svg += `<text x="10" y="${y0 + 18}" font-size="15" font-weight="700" fill="#222">${name} — modo ${plan.mode}, ${f(plan.speed * 1000)} mm/s${plan.mode === 'hop' ? `, salto ${f(a.locomotion.jump * 1000)} mm` : ''}</text>`;
  for (let c = 0; c < CELLS; c++) {
    const st = { ...run[warm + c * step], x: 0 };
    const pose = I.poseCreature(a, plan, st);
    const ox = c * CW + CW / 2;
    const floor = y0 + CH - 40;
    const X = (x) => ox + x * SCALE;
    const Y = (y) => floor - y * SCALE;
    svg += `<line x1="${c * CW + 6}" y1="${f(floor)}" x2="${(c + 1) * CW - 6}" y2="${f(floor)}" stroke="#8d6e63" stroke-width="2"/>`;
    const draw = (shapes, fill) =>
      shapes
        .map((s) =>
          s.kind === 'capsule'
            ? `<line x1="${f(X(s.a[0]))}" y1="${f(Y(s.a[1]))}" x2="${f(X(s.b[0]))}" y2="${f(Y(s.b[1]))}" stroke="${fill}" stroke-width="${f(Math.max(2, s.r * 2 * SCALE))}" stroke-linecap="round"/>`
            : `<polygon points="${s.pts.map((p) => `${f(X(p[0]))},${f(Y(p[1]))}`).join(' ')}" fill="${fill}"/>`,
        )
        .join('');
    svg += draw(pose.body, '#f6cb43');
    for (const l of pose.limbs) svg += draw(l.shapes, l.foot ? '#43a047' : '#c98a3a');
    // Punto de contacto: la x del punto más bajo de cada extremidad que toca el piso.
    const lowPoint = (shapes) => {
      let best = null;
      for (const sh of shapes) for (const q of sh.kind === 'capsule' ? [sh.a, sh.b] : sh.pts) if (!best || q[1] < best[1]) best = q;
      return best;
    };
    for (const l of pose.limbs) {
      const q = l.contact ? lowPoint(l.shapes) : null;
      if (q) svg += `<circle cx="${f(X(q[0]))}" cy="${f(floor)}" r="4" fill="#e53935"/>`;
    }
    svg += `<text x="${c * CW + 10}" y="${y0 + CH - 12}" font-size="11" fill="#555">cuadro ${warm + c * step}${st.air ? ' · en el aire' : ''}</text>`;
  }
});
const W = CELLS * CW;
const H = rows.length * CH;
const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif"><rect width="${W}" height="${H}" fill="#fffdf7"/>${svg}</svg>`;
fs.writeFileSync('docs/creature/animacion.svg', out);
console.log('docs/creature/animacion.svg');
await server.close();
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.setContent(`<body style="margin:0">${out}</body>`);
  await p.screenshot({ path: 'docs/creature/animacion.png' });
  await b.close();
  console.log('docs/creature/animacion.png');
} catch (e) {
  console.log('sin PNG:', e.message);
}
