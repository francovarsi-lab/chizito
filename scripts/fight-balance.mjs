// Balance de la pelea (sin navegador): tu criatura (manejada por la IA nivel 2) contra el brócoli nivel 1, al mejor de 3.
// Muestra extremidades, velocidad, golpes y daño medio. Uso: node scripts/fight-balance.mjs <criatura> [<criatura>…]
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { fighterFromSnapshot, broccoliFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { aiInput, newAi } = await server.ssrLoadModule('/src/creature/fight/ai.ts');
  const snap = (id) => JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8'));
  for (const id of process.argv.slice(2)) {
    const P = fighterFromSnapshot(snap(id));
    console.log(`== ${id} masa ${(P.mass*1000).toFixed(1)} g`, P.limbs.map(l => `${l.role}:${l.label} r=${(l.reach*100).toFixed(1)}cm m=${(l.mass*1000).toFixed(2)}g piv=[${l.pivot.map(v=>(v*1000).toFixed(0))}] dir=[${l.dir.map(v=>v.toFixed(2))}]`));
    const m = createMatch([P, broccoliFighter(1)]);
    const f0 = m.f[0];
    console.log('speed', f0.speed.toFixed(3), 'jump', f0.jump.toFixed(2), 'y', f0.y.toFixed(4), 'legs', f0.legs, 'arms', f0.arms);
    const ai0 = newAi(3, 2), ai1 = newAi(7, 1);
    let hits = [0,0], dmg=[0,0];
    for (let fr = 0; fr < 60 * 200 && m.phase !== 'over'; fr++) {
      stepMatch(m, [aiInput(m, ai0, 0), aiInput(m, ai1, 1)]);
      for (const e of m.events) {
        if (e.type === 'hit') { hits[e.by]++; dmg[e.by]+=e.damage; if (hits[e.by] <= 3) console.log(' hit', e.by, e.kind, 'dmg', e.damage.toFixed(1), 'v', e.speed.toFixed(2), e.blocked?'BLOCK':''); }
        if (e.type === 'roundEnd' || e.type === 'matchEnd' || e.type==='ko' || e.type==='dizzy' || e.type==='shieldBreak') console.log(' ', m.frame, JSON.stringify(e));
      }
      if (fr % 600 === 0) console.log(`  t${fr} x ${m.f[0].x.toFixed(3)} ${m.f[1].x.toFixed(3)} y ${m.f[0].y.toFixed(3)} ${m.f[1].y.toFixed(3)} tilt ${m.f[0].tilt.toFixed(2)} ${m.f[1].tilt.toFixed(2)} hp ${m.f[0].hp.toFixed(0)} ${m.f[1].hp.toFixed(0)} phase ${m.phase}`);
    }
    console.log(' golpes', hits, 'daño medio', dmg.map((d,i)=>(d/Math.max(1,hits[i])).toFixed(1)), 'wins', m.wins, 'frame', m.frame);
  }
} finally { await server.close(); }
