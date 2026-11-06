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

  // ── Golpe: piña = el brazo siguiente; carga → golpe → vuelta; gira en su clavado; uno por vez ──
  {
    const m = fight(mine);
    const phases = new Set();
    let max = 0;
    const used = new Set();
    let both = false;
    for (let i = 0; i < 200; i++) {
      stepMatch(m, [{ x: 0, punch: i === 0 || i === 90 }, { x: 0 }]);
      const striking = m.f[0].limbs.filter((s) => s.phase === 'windup' || s.phase === 'strike').length;
      both ||= striking > 1;
      m.f[0].limbs.forEach((s, k) => { phases.add(s.phase); if (s.phase !== 'rest') used.add(k); max = Math.max(max, rot(s)); });
    }
    ok(['windup', 'strike', 'recover', 'rest'].every((p) => phases.has(p)), `fases del golpe (${[...phases]})`);
    ok(max > 1, `el brazo gira en su punto de clavado (${(max * 57.3).toFixed(0)}°)`);
    ok(m.f[0].arms.every((k) => used.has(k)), 'dos piñas = los dos brazos, en orden');
    ok(!both, 'nunca dos golpes a la vez');
    ok(m.f[0].limbs.every((s) => s.phase === 'rest' && rot(s) < 0.2), 'todo vuelve al reposo');
    // Patada: solo piernas.
    const k = fight(mine);
    let kicked = -1;
    for (let i = 0; i < 40; i++) {
      stepMatch(k, [{ x: 0, kick: i === 0 }, { x: 0 }]);
      k.f[0].limbs.forEach((s, j) => { if (s.phase === 'strike') kicked = j; });
    }
    ok(kicked >= 0 && k.f[0].legs.includes(kicked), 'la patada usa una pierna');
    const B = fight(fighterFromSnapshot(snap('B')));
    let any = false;
    for (let i = 0; i < 40; i++) {
      stepMatch(B, [{ x: 0, kick: i === 0 }, { x: 0 }]);
      any ||= B.f[0].limbs.some((s) => s.phase !== 'rest');
    }
    ok(!any, 'sin piernas no hay patada');
  }

  // ── Errar con peso: la aceituna que no pega sigue de largo, desestabiliza y cuesta tiempo de reacción ──
  {
    const whiffOf = (heavy) => {
      const m = fight(mine);
      m.f[1].x = 0.15; // lejos: no hay nada que pegar
      let ev = null, tiltMax = 0;
      const presses = heavy ? [0, 60] : [0];
      for (let i = 0; i < 200; i++) {
        stepMatch(m, [{ x: 0, punch: presses.includes(i) }, { x: 0 }]);
        for (const e of m.events) if (e.type === 'whiff' && e.heavy === heavy) ev = e;
        if (ev) tiltMax = Math.max(tiltMax, Math.abs(m.f[0].tilt - (-0.093)));
      }
      return { ev, tiltMax };
    };
    const light = whiffOf(false);
    const heavy = whiffOf(true);
    ok(light.ev && heavy.ev, 'errar se registra');
    if (light.ev && heavy.ev) {
      ok(heavy.ev.lock > light.ev.lock * 2.5, `errar con la aceituna cuesta mucho más (${heavy.ev.lock} vs ${light.ev.lock} cuadros)`);
      ok(heavy.tiltMax > light.tiltMax && heavy.tiltMax > 0.15, `la aceituna que erra desestabiliza al chizito (${heavy.tiltMax.toFixed(2)} vs ${light.tiltMax.toFixed(2)} rad)`);
    }
  }

  // ── Piezas fijas: el chupetín y lo que atraviesa el chizito no giran; lo que asoma < 1 cm no es extremidad ──
  {
    const s = snap('criatura-20261011-1623');
    s.pieces.find((p) => p.id === 'palito-mv47lm1n-2').type = 'chupetin';
    const P = fighterFromSnapshot(s);
    const pop = P.limbs.find((l) => l.id === 'palito-mv47lm1n-2');
    ok(pop && pop.rigid, 'el chupetín queda rígido');
    const m = fight(P);
    const k = P.limbs.indexOf(pop);
    for (let i = 0; i < 200; i++) stepMatch(m, [{ x: i < 60 ? 1 : 0, punch: i % 40 === 0, guard: i > 150 }, { x: 0 }]);
    ok(rot(m.f[0].limbs[k]) < 1e-6 && !m.f[0].arms.includes(k), 'el chupetín no gira ni pega como brazo');
    const E = fighterFromSnapshot(snap('E'));
    const thr = E.limbs.filter((l) => l.through);
    ok(thr.length === 2 && thr.every((l) => l.rigid), `las varas que atraviesan el chizito quedan fijas (${thr.length})`);
    const t = snap('criatura-20261011-1623');
    const link = t.links.find((l) => l.childId === 'palito-mv47lm1n-2');
    const rod = t.pieces.find((p) => p.id === 'palito-mv47lm1n-2');
    rod.shape.b = link.anchor.map((v, i) => v + link.axis[i] * 0.006);
    const short = fighterFromSnapshot(t);
    ok(!short.limbs.some((l) => l.id === rod.id) && short.armor.some((q) => q.piece === rod.id), 'un palito que asoma 6 mm no es extremidad (es solo peso)');
  }

  // ── Piernas y peso: sin piernas no salta; si pesa más de lo que aguantan, camina lento y no salta ──
  {
    const B = fight(fighterFromSnapshot(snap('B')));
    ok(B.f[0].jump === 0, 'sin piernas no puede saltar');
    for (let i = 0; i < 30; i++) stepMatch(B, [{ x: 0, up: i === 0 }, { x: 0 }]);
    ok(B.f[0].grounded, 'apretar ↑ sin piernas no lo levanta');
    const A = fighterFromSnapshot(snap('A'));
    const heavyA = { ...A, armor: [...A.armor, { p: [0, 0, 0], m: 0.015, r: 0.001, piece: 'lastre', kind: 'light', inside: true }], mass: A.mass + 0.015 };
    const h = fight(heavyA);
    const a = fight(A);
    ok(a.f[0].jump > 0 && h.f[0].jump === 0, 'con 15 g de más ya no salta');
    ok(h.f[0].speed < a.f[0].speed * 0.6, `y camina mucho más lento (${(h.f[0].speed * 100).toFixed(1)} vs ${(a.f[0].speed * 100).toFixed(1)} cm/s)`);
  }

  // ── Daño: la aceituna pega más fuerte que el palito ──
  {
    const m = fight(mine);
    m.f[1].x = m.f[0].x + 0.038;
    const hits = [];
    for (let i = 0; i < 260; i++) {
      stepMatch(m, [{ x: 0, punch: i % 80 === 0 }, { x: 0 }]);
      for (const e of m.events) if (e.type === 'hit' && e.by === 0) hits.push(e);
    }
    const light = hits.find((e) => !e.heavy);
    const heavy = hits.find((e) => e.heavy);
    ok(light && heavy, `pegan los dos brazos (${hits.map((e) => (e.heavy ? 'aceituna' : 'palito') + ' ' + e.damage.toFixed(1))})`);
    if (light && heavy) ok(heavy.damage > light.damage * 1.3, `la aceituna pega más (${heavy.damage.toFixed(1)} vs ${light.damage.toFixed(1)})`);
  }

  // ── Guardia física: tapan los brazos (sin brazos no hay guardia) ──
  {
    const run = (guard, defender) => {
      const m = createMatch([fighterFromSnapshot(snap('A')), defender]);
      for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
      m.f[1].x = m.f[0].x + 0.05;
      let dmg = 0, blocked = 0;
      for (let i = 0; i < 300; i++) {
        stepMatch(m, [{ x: 0, punch: i % 40 === 10 }, { x: 0, guard }]);
        for (const e of m.events) if (e.type === 'hit' && e.by === 0) { dmg += e.damage; if (e.blocked) blocked++; }
      }
      return { dmg, blocked };
    };
    const open = run(false, broccoliFighter(1));
    const g = run(true, broccoliFighter(1));
    ok(open.dmg > 0, `A le pega al brócoli (${open.dmg.toFixed(1)})`);
    ok(g.blocked > 0 && g.dmg < open.dmg * 0.6, `los brazos del brócoli tapan (${g.blocked} bloqueos, ${g.dmg.toFixed(1)} vs ${open.dmg.toFixed(1)})`);
    const noArms = fighterFromSnapshot(snap('A'));
    noArms.limbs = noArms.limbs.filter((l) => l.role === 'leg');
    const n = run(true, noArms);
    ok(n.blocked === 0, 'sin brazos, cubrirse no tapa nada');
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
      stepMatch(m, [{ x: Math.abs(m.f[1].x - m.f[0].x) > 0.045 ? 1 : 0, punch: i % 30 === 0 }, { x: 0 }]);
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
    for (let i = 0; i < 600; i++) stepMatch(m, [{ x: i % 120 < 60 ? 1 : -1, punch: i % 20 === 0 }, { x: 0 }]);
    const ms = (performance.now() - t0) / 600;
    console.log(`  F40: ${ms.toFixed(3)} ms por paso`);
    ok(ms < 2, `F40 simula rápido (${ms.toFixed(3)} ms por paso)`);
  }
} finally {
  await server.close();
}
console.log(`pelea: ${pass} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
