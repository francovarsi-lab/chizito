// Sonda de golpes (sin navegador): para cada criatura, con el frente REAL del juego (cara +Z), mide el brazo izquierdo (Q) y el derecho (W):
// arco de carga + golpe, cuadros hasta pegar, daño y velocidad. Los dos lados tienen que dar parecido.
// Uso: node scripts/fight-probe.mjs A B veg criatura-20261011-1623
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { fighterFromSnapshot, broccoliFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  const snap = (id) => { const s = JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8')); s.orientation = { front: [0, 0, 1], up: [1, 0, 0] }; return s; };
  for (const id of process.argv.slice(2)) {
    const P = fighterFromSnapshot(snap(id));
    console.log(`== ${id} ${(P.mass*1000).toFixed(1)} g`, P.limbs.map(l => `${l.role}${l.side}:${l.label} dir=[${l.dir.map(v=>v.toFixed(2))}]`).join(' | '));
    for (const quad of ['LA', 'RA']) {
      for (const gap of [0.045, 0.06]) {
        const m = createMatch([P, broccoliFighter(1)]);
        for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
        m.f[1].x = m.f[0].x + gap; m.f[1].stun = 9999;
        for (let i = 0; i < 20; i++) { stepMatch(m, [{ x: 0 }, { x: 0 }]); m.f[1].x = m.f[0].x + gap; m.f[1].stun = 9999; }
        let res = 'sin extremidad', plan = '', k = -1, t0 = m.frame;
        stepMatch(m, [{ x: 0, quad }, { x: 0 }]);
        for (let i = 0; i < 160; i++) {
          if (k < 0) { k = m.f[0].limbs.findIndex((s) => s.phase === 'windup'); if (k >= 0) { const s = m.f[0].limbs[k], l = P.limbs[k]; plan = `${l.label}${l.rigid ? '(fijo)' : ''} carga ${s.windup.toFixed(2)} fin ${s.target.toFixed(2)} arco ${(s.target - s.windup).toFixed(2)} rad, espera ${s.charge}c`; } }
          for (const e of m.events) { if (e.type === 'hit' && e.by === 0) res = `PEGA a los ${m.frame - t0} c, daño ${e.damage.toFixed(1)}, v ${e.speed.toFixed(2)}`; if (e.type === 'whiff' && e.who === 0) res = `PIFIA a los ${m.frame - t0} c (traba ${e.lock})`; }
          if (res !== 'sin extremidad') break;
          m.f[1].stun = 9999;
          stepMatch(m, [{ x: 0 }, { x: 0 }]);
        }
        console.log(`  ${quad} a ${gap * 100} cm: ${plan} → ${res}`);
      }
    }
  }
} finally { await server.close(); }
