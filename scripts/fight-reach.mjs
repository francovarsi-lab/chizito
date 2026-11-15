// Alcance de cada brazo (sin rival cerca): x máxima de la punta durante la fase de golpe, con el frente real. Los dos lados
// tienen que quedar a menos de 3 mm. Uso: node scripts/fight-reach.mjs arq/boxeador arq/mazo B S4
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { fighterFromSnapshot, broccoliFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
const snap = (id) => { const s = JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8')); s.orientation = { front: [0, 0, 1], up: [1, 0, 0] }; return s; };
for (const id of process.argv.slice(2)) {
  const P = fighterFromSnapshot(snap(id));
  const out = [];
  for (const quad of ['LA', 'RA']) {
    const m = createMatch([P, broccoliFighter(1)]);
    for (let i = 0; i < FIGHT.introFrames + 20; i++) { m.f[1].x = m.f[0].x + 0.3; stepMatch(m, [{ x: 0 }, { x: 0 }]); }
    stepMatch(m, [{ x: 0, quad }, { x: 0 }]);
    let best = 0;
    for (let i = 0; i < 60; i++) {
      m.f[1].x = m.f[0].x + 0.3;
      const k = m.f[0].limbs.findIndex((s) => s.phase === 'strike');
      if (k >= 0) { const a = m.f[0].cur[k]; for (let j = 0; j < a.length; j += 2) best = Math.max(best, (a[j] - m.f[0].x) * m.f[0].facing); }
      stepMatch(m, [{ x: 0 }, { x: 0 }]);
    }
    out.push(`${quad} ${(best * 1000).toFixed(1)} mm`);
  }
  console.log(id, out.join('  '));
}
await server.close();
