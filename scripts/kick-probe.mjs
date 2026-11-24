// Sonda de patadas (sin navegador): arquetipo A con una aceituna en una pierna; mide carga, arco y daño de cada pierna con el rival
// a la derecha y a la izquierda. La misma pierna tiene que cargar y recorrer parecido de los dos lados (pedido del usuario).
// Uso: node scripts/kick-probe.mjs
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
try {
  const { fighterFromSnapshot, broccoliFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  const s = JSON.parse(fs.readFileSync('src/creature/fixtures/A.snapshot.json', 'utf8'));
  s.orientation = { front: [0, 0, 1], up: [1, 0, 0] };
  for (const id of ['palito-fxA2']) {
    const p = s.pieces.find((q) => q.id === id), d = nrm(p.shape.b.map((v, i) => v - p.shape.a[i]));
    const a = add(p.shape.b, d, -0.0104), oid = `aceituna-${id}`;
    s.pieces.push({ id: oid, type: 'aceituna', seed: 1, kind: 'blob', cosmetic: false, stability: 'stable', shape: { kind: 'capsule', a, b: add(a, d, 0.02), radius: 0.0072 } });
    s.links.push({ ...structuredClone(s.links.find((l) => l.childId === id)), id: `link-${oid}`, parentId: id, childId: oid, mode: 'tail', anchor: p.shape.b, exit: null, crossings: [] });
  }
  const P = fighterFromSnapshot(s);
  console.log(P.limbs.map((l) => `${l.role}${l.side}:${l.label}:${l.kind}`).join(' | '));
  const bad = [];
  for (const quad of ['LL', 'RL']) {
    const arcs = [];
    for (const gap of [0.035, -0.035]) {
      const m = createMatch([P, broccoliFighter(1)]);
      for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
      const fix = () => { m.f[1].x = m.f[0].x + gap; m.f[1].stun = 9999; };
      for (let i = 0; i < 40; i++) { fix(); stepMatch(m, [{ x: 0 }, { x: 0 }]); }
      let res = 'nada', plan = '', k = -1, t0 = m.frame;
      fix(); stepMatch(m, [{ x: 0, quad }, { x: 0 }]);
      for (let i = 0; i < 160 && res === 'nada'; i++) {
        if (k < 0) { k = m.f[0].limbs.findIndex((q) => q.phase === 'windup'); if (k >= 0) { const q = m.f[0].limbs[k]; arcs.push(q.target - q.windup); plan = `${P.limbs[k].label} carga ${q.windup.toFixed(2)} arco ${(q.target - q.windup).toFixed(2)} espera ${q.charge}c`; } }
        for (const e of m.events) { if (e.type === 'hit' && e.by === 0) res = `PEGA a los ${m.frame - t0} c, daño ${e.damage.toFixed(1)}`; if (e.type === 'whiff' && e.who === 0) res = `PIFIA a los ${m.frame - t0} c`; }
        fix(); stepMatch(m, [{ x: 0 }, { x: 0 }]);
      }
      console.log(`  ${quad} rival ${gap > 0 ? 'derecha' : 'izquierda'}: ${plan} → ${res}`);
    }
    if (arcs.length === 2 && Math.abs(arcs[0] - arcs[1]) > 0.35) bad.push(quad);
  }
  console.log(bad.length ? `MAL: arco distinto según el lado en ${bad}` : 'OK: misma pierna, mismo arco de los dos lados');
} finally { await server.close(); }
