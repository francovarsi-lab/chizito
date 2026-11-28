// Sonda de piernas desparejas (sin navegador): arquetipo A con aceituna en las dos piernas y una clavada más adentro (más corta).
// Las dos tienen que apoyar en la tabla, por corta que sea (pedido del usuario: "la que quedó más cortita quedó flotando").
// Uso: node scripts/legs-probe.mjs
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
let bad = 0;
try {
  const { fighterFromSnapshot, broccoliFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  for (const olive of [true, false]) for (const out of [25, 45, 65]) for (const deeper of [0, 0.004, 0.008, 0.012, 0.016]) {
    const s = JSON.parse(fs.readFileSync('src/creature/fixtures/A.snapshot.json', 'utf8'));
    s.orientation = { front: [0, 0, 1], up: [1, 0, 0] };
    for (const id of ['palito-fxA2', 'palito-fxA4']) {
      const p = s.pieces.find((q) => q.id === id);
      // La pierna abierta `out` grados desde el eje largo (hacia su costado).
      const side = Math.sign(p.shape.b[1]), t = (out * Math.PI) / 180, d = [-Math.cos(t), side * Math.sin(t), 0];
      p.shape.b = add(p.shape.a, d, Math.hypot(...sub(p.shape.b, p.shape.a)));
      // Más adentro: la pieza entera se corre hacia el chizito (la punta de adentro también).
      if (id === 'palito-fxA4') { p.shape.a = add(p.shape.a, d, -deeper); p.shape.b = add(p.shape.b, d, -deeper); const l = s.links.find((q) => q.childId === id); l.embedded += deeper; l.attach.depth += deeper; l.freeTail -= deeper; }
      if (!olive) continue;
      const a = add(p.shape.b, d, -0.0104), oid = `aceituna-${id}`;
      s.pieces.push({ id: oid, type: 'aceituna', seed: 1, kind: 'blob', cosmetic: false, stability: 'stable', shape: { kind: 'capsule', a, b: add(a, d, 0.02), radius: 0.0072 } });
      s.links.push({ ...structuredClone(s.links.find((l) => l.childId === id)), id: `link-${oid}`, parentId: id, childId: oid, mode: 'tail', anchor: p.shape.b, exit: null, crossings: [] });
    }
    const P = fighterFromSnapshot(s);
    const legs = P.limbs.map((l, k) => (l.role === 'leg' ? k : -1)).filter((k) => k >= 0);
    const m = createMatch([P, broccoliFighter(1)]);
    for (let i = 0; i < FIGHT.introFrames + 120; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
    const f = m.f[0];
    const lows = legs.map((k) => { let lo = 9; P.limbs[k].points.forEach((p, j) => { if (!p.inside) lo = Math.min(lo, f.cur[k][2 * j + 1] - p.r); }); return lo; });
    const floor = Math.min(...lows);
    const gapMm = lows.map((y) => ((y - floor) * 1000).toFixed(1));
    const worst = Math.max(...lows) - floor;
    if (worst > 0.0015) bad++;
    console.log(`${olive ? 'con aceituna' : 'sin aceituna'}, abiertas ${out}°, una ${(deeper * 1000).toFixed(0).padStart(2)} mm más adentro: alcance ${legs.map((k) => (P.limbs[k].reach * 1000).toFixed(1)).join(' / ')} mm → sobre el piso ${gapMm.join(' / ')} mm, cuerpo inclinado ${f.tilt.toFixed(2)} ${worst > 0.0015 ? '← FLOTA' : ''}`);
  }
  console.log(bad ? `MAL: ${bad} casos con una pierna flotando` : 'OK: las dos piernas apoyan siempre');
} finally { await server.close(); }
process.exit(bad ? 1 : 0);
