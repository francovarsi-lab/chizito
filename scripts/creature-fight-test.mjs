// Pelea (módulos puros, sin navegador): reglas de daño, guardia, KO y el rival de brócoli. Uso: node scripts/creature-fight-test.mjs
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FALLA:', m)); };
try {
  const { interpret } = await server.ssrLoadModule('/src/creature/interpret.ts');
  const { createFight, stepFight } = await server.ssrLoadModule('/src/creature/fight/rules.ts');
  const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  const { aiInput, newAi } = await server.ssrLoadModule('/src/creature/fight/ai.ts');
  const snap = (id) => JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8'));
  const { broccoliAnalysis } = await server.ssrLoadModule('/src/creature/fight/broccoliAnalysis.ts');
  const { makeSimPlan, createSimState, poseCreature } = await server.ssrLoadModule('/src/creature/sim/index.ts');
  const veg = broccoliAnalysis(interpret(snap('veg'), { facing: -1 })).an;
  // El brócoli (geometría del boceto): mide ≈ 8 cm, apoya en el piso y camina sin atravesarlo, para los dos lados.
  for (const pf of [-1, 1]) {
    const bro = broccoliAnalysis(interpret(snap('veg'), { facing: pf })).an;
    const h = bro.profile2D.bounds.max[1] - bro.profile2D.bounds.min[1];
    ok(h > 0.07 && h < 0.09, `brócoli (facing ${pf}) mide ${(h * 100).toFixed(1)} cm`);
    const plan = makeSimPlan(bro);
    let st = createSimState(plan);
    let low = Infinity;
    for (let f = 0; f < 240; f++) {
      const { stepSim } = await server.ssrLoadModule('/src/creature/sim/step.ts');
      st = stepSim(st, { move: plan.facing }, plan);
      low = Math.min(low, poseCreature(bro, plan, st).lowest);
    }
    ok(low > -1e-6 && low < 1e-3, `brócoli (facing ${pf}) camina apoyado en el piso (punto más bajo ${low.toExponential(1)})`);
    ok(bro.actions.some((a) => a.input === 'forward+attack'), `brócoli (facing ${pf}) conserva su estocada`);
  }
  ok(veg.actions.length > 0, `el brócoli tiene golpes (${veg.actions.map((a) => a.kind)})`);
  for (const id of ['A', 'B', 'E', 'S2', 'S4']) {
    const player = interpret(snap(id), { facing: 1 });
    // Jugador "bot": avanza y pega siempre; el rival juega con su IA.
    let s = createFight(player, veg);
    const ai = newAi(7);
    let hits = 0, blocked = 0, f = 0;
    for (; f < 60 * 90 && s.winner === null; f++) {
      const close = s.f[1].sim.x - s.f[0].sim.x < 0.05;
      s = stepFight(s, [close ? { move: 1, attack: f % 30 < 3 } : { move: 1 }, aiInput(s, ai)]);
      for (const e of s.events) { hits++; if (e.blocked) blocked++; }
    }
    console.log(`${id} vs brócoli: ${s.winner === null ? 'sin KO' : 'ganó ' + s.winner} a los ${(f / 60).toFixed(1)} s · golpes ${hits} (bloqueados ${blocked}) · vida ${s.f[0].hp.toFixed(0)} / ${s.f[1].hp.toFixed(0)}`);
    ok(hits > 0, `${id}: se pegan`);
    ok(s.f.every((q) => q.hp >= 0 && Math.abs(q.sim.x) <= FIGHT.arenaHalf + 1e-9), `${id}: vida ≥ 0 y dentro de la arena`);
  }
  // Un golpe solo suma una vez por golpe, y la guardia levantada reduce el daño.
  const A = interpret(snap('A'), { facing: 1 });
  const run = (guard) => {
    let s = createFight(A, A);
    s.f[0].sim.x = -0.02; s.f[1].sim.x = 0.02;
    let dmg = 0;
    for (let f = 0; f < 200; f++) { s = stepFight(s, [{ move: 1, attack: f < 3 }, { move: 0, guard }]); for (const e of s.events) dmg += e.damage; }
    return dmg;
  };
  const free = run(false), guarded = run(true);
  console.log(`daño sin guardia ${free.toFixed(1)} · con guardia ${guarded.toFixed(1)}`);
  ok(free > 0 && guarded <= free, 'la guardia no aumenta el daño');
} finally { await server.close(); }
console.log(`\n${pass} bien, ${fail} fallas`);
process.exit(fail ? 1 : 0);
