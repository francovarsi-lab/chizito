// Sonda del chupetín (sin navegador): el chupetín en el brazo izquierdo (Q) o derecho (W), clavado en distintos ángulos
// (hacia la cara, hacia atrás, más arriba / abajo), contra el rival quieto a varias distancias y de los dos lados.
// Pedido del usuario: "el brazo izquierdo con chupetín no pega nada, pifia siempre". Uso: node scripts/chupetin-probe.mjs
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
try {
  const { fighterFromSnapshot, broccoliFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  const bad = [];
  for (const [side, id] of [['L', 'palito-fxA1'], ['R', 'palito-fxA3']]) for (const tz of [-50, -25, 0, 25, 50]) for (const tx of [-30, 0, 30]) {
    const s = JSON.parse(fs.readFileSync('src/creature/fixtures/A.snapshot.json', 'utf8'));
    s.orientation = { front: [0, 0, 1], up: [1, 0, 0] };
    const p = s.pieces.find((q) => q.id === id);
    const sy = Math.sign(p.shape.b[1]);
    const a = (tz * Math.PI) / 180, b = (tx * Math.PI) / 180;
    const d = nrm([Math.sin(b), sy * Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b)]);
    p.type = 'chupetin';
    p.shape.b = add(p.shape.a, d, 0.055);
    const l = s.links.find((q) => q.childId === id);
    s.pieces.push({ id: `${id}~c`, type: 'chupetin-caramelo', kind: 'blob', seed: 1, cosmetic: false, stability: 'stable', shape: { kind: 'capsule', a: p.shape.b, b: p.shape.b, radius: 0.0105 } });
    s.links.push({ ...structuredClone(l), id: `link-${id}~c`, parentId: id, childId: `${id}~c`, mode: 'tail', anchor: p.shape.b, exit: null, crossings: [] });
    const P = fighterFromSnapshot(s);
    const k = P.limbs.findIndex((q) => q.rigid);
    if (k < 0) { console.log(side, tz, tx, 'sin chupetín como brazo', P.limbs.map((q) => q.role + q.side).join(' ')); continue; }
    const res = [];
    for (const gap of [0.04, 0.06, -0.04, -0.06]) {
      const m = createMatch([P, broccoliFighter(1)]);
      for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
      const fix = () => { m.f[1].x = m.f[0].x + gap; m.f[1].stun = 9999; };
      for (let i = 0; i < 40; i++) { fix(); stepMatch(m, [{ x: 0 }, { x: 0 }]); }
      let r = '·';
      for (let i = 0; i < 200 && r === '·'; i++) {
        fix(); stepMatch(m, [{ x: 0, quad: i < 30 ? `${P.limbs[k].side}A` : undefined }, { x: 0 }]);
        for (const e of m.events) { if (e.type === 'hit' && e.by === 0) r = 'P'; if (e.type === 'whiff' && e.who === 0) r = 'x'; }
      }
      res.push(r);
    }
    const line = `${side}${P.limbs[k].side} hacia-cara ${String(tz).padStart(3)}° arriba ${String(tx).padStart(3)}°: ${res.join(' ')}`;
    if (res.filter((r) => r === 'P').length < 3) bad.push(line);
    console.log(line);
  }
  console.log(bad.length ? `MAL (${bad.length}):\n${bad.join('\n')}` : 'OK: el chupetín pega de los dos lados en todos los ángulos');
} finally { await server.close(); }
