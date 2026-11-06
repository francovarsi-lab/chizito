// Pelea (módulos puros, sin navegador): modelo de luchador ("palito clavado = brazo/pierna"), física, golpes, escudos, rounds e IA.
// Uso: node scripts/creature-fight-test.mjs
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FALLA:', m)); };
try {
  const { fighterFromSnapshot, broccoliFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { aiInput, newAi } = await server.ssrLoadModule('/src/creature/fight/ai.ts');
  const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  const snap = (id) => JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8'));
  const IDS = ['A', 'B', 'C', 'D', 'E', 'F40', 'P', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'veg', 'criatura-20261011-1623'];
  const rot = (s) => 2 * Math.acos(Math.min(1, Math.abs(s.q[3])));
  const fight = (P) => {
    const m = createMatch([P, broccoliFighter(1)]);
    for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
    return m;
  };
  const lowest = (f) => {
    let low = Infinity;
    f.cur.forEach((a, k) => f.model.limbs[k].points.forEach((p, j) => { if (!p.inside) low = Math.min(low, a[2 * j + 1] - p.r * 0.5); }));
    return low;
  };

  // ── Modelo: cada vara clavada en el chizito es una extremidad con la articulación en su punto de clavado ──
  const mine = fighterFromSnapshot(snap('criatura-20261011-1623'));
  ok(mine.limbs.length === 4, `mi criatura: 4 extremidades (${mine.limbs.length})`);
  ok(mine.limbs.filter((l) => l.role === 'arm').length === 2 && mine.limbs.filter((l) => l.role === 'leg').length === 2, `mi criatura: 2 brazos y 2 piernas (${mine.limbs.map((l) => l.role)})`);
  const olive = mine.limbs.find((l) => l.label.includes('aceituna'));
  ok(olive && olive.kind === 'heavy' && olive.role === 'arm', 'el palito con aceituna es un brazo pesado');
  ok(Math.abs(mine.mass * 1000 - (3.3 + 0.4 * 3 + 4 + 1.1)) < 0.01, `masa = tabla de la realidad (${(mine.mass * 1000).toFixed(2)} g)`);
  ok(mine.limbs.every((l) => Math.hypot(...l.dir) > 0.99 && l.reach > 0.01), 'cada extremidad tiene dirección y alcance');
  for (const id of IDS) {
    const s = snap(id);
    const rods = s.links.filter((l) => l.parentId === s.coreId && ['palito', 'escarbadientes', 'palito-selva', 'chupetin'].includes(s.pieces.find((p) => p.id === l.childId)?.type));
    const P = fighterFromSnapshot(s);
    ok(P.limbs.length >= rods.length * 0.9, `${id}: las varas clavadas son extremidades (${P.limbs.length} de ${rods.length})`);
  }

  // ── Parado: apoyado en el piso, quieto y sin NaN; el contrapeso inclina hacia el lado pesado ──
  for (const id of IDS) {
    const m = fight(fighterFromSnapshot(snap(id)));
    for (let i = 0; i < 180; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
    const f = m.f[0];
    ok(Number.isFinite(f.x + f.y + f.tilt), `${id}: estado finito`);
    ok(f.grounded && Math.abs(f.vy) < 0.05, `${id}: quieto en el piso`);
    ok(Math.abs(f.wt) < 0.3, `${id}: no se bambolea solo (ω ${f.wt.toFixed(2)})`);
  }
  {
    const m = fight(mine);
    for (let i = 0; i < 180; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
    ok(m.f[0].tilt < -0.03, `mi criatura se inclina hacia la aceituna (atrás): ${m.f[0].tilt.toFixed(3)} rad`);
    ok(lowest(m.f[0]) > -1e-4 && lowest(m.f[0]) < 0.0025, `mi criatura apoya las piernas en el piso (${lowest(m.f[0]).toExponential(1)})`);
    const a = fight(fighterFromSnapshot(snap('A')));
    for (let i = 0; i < 180; i++) stepMatch(a, [{ x: 0 }, { x: 0 }]);
    ok(Math.abs(a.f[0].tilt) < 0.03, `A (simétrica) queda derecha (${a.f[0].tilt.toFixed(3)})`);
  }

  // ── Caminar: → avanza; más peso = más lento; sin piernas se arrastra ──
  const walk = (P) => {
    const m = fight(P);
    const x0 = m.f[0].x;
    for (let i = 0; i < 60; i++) stepMatch(m, [{ x: 1 }, { x: 0 }]);
    return m.f[0].x - x0;
  };
  const dMine = walk(mine);
  const dA = walk(fighterFromSnapshot(snap('A')));
  const dB = walk(fighterFromSnapshot(snap('B')));
  ok(dMine > 0.02, `mi criatura camina (${(dMine * 100).toFixed(1)} cm en 1 s)`);
  ok(dA > dMine, `más liviana = más rápida (A ${(dA * 100).toFixed(1)} cm vs ${(dMine * 100).toFixed(1)} cm)`);
  ok(fighterFromSnapshot(snap('B')).limbs.every((l) => l.role === 'arm') ? dB > 0.005 && dB < dA : true, `sin piernas se arrastra, más lento (${(dB * 100).toFixed(1)} cm)`);

  // ── Golpe: Z = el brazo siguiente; carga → golpe → vuelta; gira en su clavado ──
  {
    const m = fight(mine);
    const phases = new Set();
    let max = 0;
    const used = new Set();
    for (let i = 0; i < 120; i++) {
      stepMatch(m, [{ x: 0, attack: i === 0 || i === 40 }, { x: 0 }]);
      m.f[0].limbs.forEach((s, k) => { phases.add(s.phase); if (s.phase !== 'rest') used.add(k); max = Math.max(max, rot(s)); });
    }
    ok(['windup', 'strike', 'recover', 'rest'].every((p) => phases.has(p)), `fases del golpe (${[...phases]})`);
    ok(max > 1, `el brazo gira en su punto de clavado (${(max * 57.3).toFixed(0)}°)`);
    ok(m.f[0].arms.every((k) => used.has(k)), 'dos toques de Z = los dos brazos, en orden');
    ok(m.f[0].limbs.every((s) => s.phase === 'rest' && rot(s) < 0.2), 'todo vuelve al reposo');
  }

  // ── Daño por peso: la aceituna pega más fuerte que el palito; la guardia lo reduce ──
  {
    // Forzar qué brazo pega: el orden es del más adelantado al más atrasado (palito, después aceituna).
    const m = fight(mine);
    m.f[1].x = m.f[0].x + 0.038;
    const hits = [];
    for (let i = 0; i < 200; i++) {
      stepMatch(m, [{ x: 0, attack: i % 50 === 0 }, { x: 0 }]);
      for (const e of m.events) if (e.type === 'hit' && e.by === 0) hits.push(e);
    }
    const light = hits.find((e) => !e.heavy);
    const heavy = hits.find((e) => e.heavy);
    ok(light && heavy, `pegan los dos brazos (${hits.map((e) => (e.heavy ? 'aceituna' : 'palito') + ' ' + e.damage.toFixed(1))})`);
    if (light && heavy) ok(heavy.damage > light.damage * 1.5, `la aceituna pega más (${heavy.damage.toFixed(1)} vs ${light.damage.toFixed(1)})`);
  }
  {
    const run = (guard) => {
      const m = fight(fighterFromSnapshot(snap('A')));
      m.f[1].x = m.f[0].x + 0.05;
      let dmg = 0, blocked = false;
      for (let i = 0; i < 200; i++) {
        stepMatch(m, [{ x: 0, attack: i % 30 === 10 }, { x: 0, guard }]);
        for (const e of m.events) if (e.type === 'hit' && e.by === 0) { dmg += e.damage; blocked ||= e.blocked; }
      }
      return { dmg, blocked };
    };
    const open = run(false);
    const g = run(true);
    ok(open.dmg > 0, `A le pega al brócoli (${open.dmg.toFixed(1)})`);
    ok(g.blocked && g.dmg < open.dmg * 0.5, `la guardia bloquea (${g.dmg.toFixed(1)} vs ${open.dmg.toFixed(1)})`);
  }

  // ── Escudos: E tiene una papita (en la espalda); un escudo adelante se gasta y salta ──
  {
    const E = fighterFromSnapshot(snap('E'));
    ok(Object.keys(E.shields).length > 0 && E.armor.some((p) => p.kind === 'shield'), `E tiene un escudo de papita (${Object.keys(E.shields)})`);
    const A = fighterFromSnapshot(snap('A'));
    A.shields = { 'papita-prueba': FIGHT.shieldHits.papita };
    for (let y = -0.012; y <= 0.016; y += 0.004) A.armor.push({ p: [0.014, y, 0], m: 0.0001, r: 0.006, piece: 'papita-prueba', kind: 'shield', inside: false });
    const m = createMatch([broccoliFighter(1), A]);
    for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
    let shieldHits = 0, breaks = 0, through = 0;
    for (let i = 0; i < 60 * 30 && m.phase === 'fight'; i++) {
      stepMatch(m, [{ x: Math.abs(m.f[1].x - m.f[0].x) > 0.045 ? 1 : 0, attack: i % 24 === 0 }, { x: 0 }]);
      for (const e of m.events) {
        if (e.type === 'hit' && e.shield) shieldHits++;
        if (e.type === 'hit' && !e.shield && breaks) through++;
        if (e.type === 'shieldBreak') breaks++;
      }
    }
    ok(shieldHits >= FIGHT.shieldHits.papita, `los golpes dan en el escudo (${shieldHits})`);
    ok(breaks === 1 && m.f[1].broken.includes('papita-prueba'), `la papita aguanta ${FIGHT.shieldHits.papita} golpes y salta (${breaks})`);
    ok(through > 0, `sin escudo, los golpes llegan al cuerpo (${through})`);
  }

  // ── Rounds: KO, al mejor de 3, tiempo, empate, determinismo ──
  const play = (P, seedA, seedB, lv = 2) => {
    const m = createMatch([P, broccoliFighter(1)]);
    const a = newAi(seedA, lv), b = newAi(seedB, 1);
    let nan = false;
    for (let i = 0; i < 60 * 400 && m.phase !== 'over'; i++) {
      stepMatch(m, [aiInput(m, a, 0), aiInput(m, b, 1)]);
      if (!Number.isFinite(m.f[0].x + m.f[1].x + m.f[0].tilt + m.f[1].tilt + m.f[0].hp + m.f[1].hp)) nan = true;
    }
    return { m, nan };
  };
  for (const id of ['A', 'E', 'D', 'criatura-20261011-1623']) {
    const { m, nan } = play(fighterFromSnapshot(snap(id)), 3, 7);
    ok(!nan, `${id}: pelea completa sin NaN`);
    ok(m.phase === 'over' && m.winner !== null && Math.max(...m.wins) === FIGHT.roundsToWin, `${id}: termina al mejor de 3 (${m.wins})`);
  }
  {
    const r1 = play(mine, 11, 12).m;
    const r2 = play(mine, 11, 12).m;
    ok(r1.frame === r2.frame && r1.f[0].hp === r2.f[0].hp && r1.f[1].x === r2.f[1].x, 'determinista: mismas entradas, misma pelea');
  }
  {
    const m = fight(fighterFromSnapshot(snap('A')));
    m.timer = 3;
    m.f[0].hp = 60;
    m.f[1].hp = 40;
    for (let i = 0; i < 10 + FIGHT.koFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
    ok(m.wins[0] === 1 && m.wins[1] === 0, `se acaba el tiempo: gana el que tiene más vida (${m.wins})`);
    const d = fight(fighterFromSnapshot(snap('A')));
    d.timer = 3;
    for (let i = 0; i < 10 + FIGHT.koFrames + FIGHT.endFrames; i++) stepMatch(d, [{ x: 0 }, { x: 0 }]);
    ok(d.wins[0] === 0 && d.wins[1] === 0 && d.round === 2, `empate exacto: ronda extra sin puntos (round ${d.round})`);
  }

  // ── Rendimiento: 40 extremidades, dos luchadores ──
  {
    const m = fight(fighterFromSnapshot(snap('F40')));
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) stepMatch(m, [{ x: i % 120 < 60 ? 1 : -1, attack: i % 20 === 0 }, { x: 0 }]);
    const ms = (performance.now() - t0) / 600;
    console.log(`  F40: ${ms.toFixed(3)} ms por paso`);
    ok(ms < 2, `F40 simula rápido (${ms.toFixed(3)} ms por paso)`);
  }
} finally {
  await server.close();
}
console.log(`pelea: ${pass} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
