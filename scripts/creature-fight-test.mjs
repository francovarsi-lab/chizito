// Pelea (módulos puros, sin navegador): modelo de luchador ("palito clavado = brazo/pierna"), física, golpes, escudos, rounds e IA.
// Uso: node scripts/creature-fight-test.mjs
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FALLA:', m)); };
try {
  const { fighterFromSnapshot, broccoliFighter, rivalFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
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
    // Reposo = la postura (las piernas quedan giradas para apoyar todas; los brazos, derechos).
    const off = (s, q) => 2 * Math.acos(Math.min(1, Math.abs(s.q[0] * q[0] + s.q[1] * q[1] + s.q[2] * q[2] + s.q[3] * q[3])));
    ok(m.f[0].limbs.every((s, k) => s.phase === 'rest' && off(s, m.f[0].stance[k]) < 0.2), 'todo vuelve al reposo');
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
    const stick = s.pieces.find((p) => p.id === 'palito-mv47lm1n-2');
    stick.type = 'chupetin';
    // Como lo entrega el resolver: el palito + la bola de caramelo soldada en la punta libre (`<id>~caramelo`).
    const tip = stick.shape.b;
    s.pieces.push({ id: `${stick.id}~caramelo`, type: 'chupetin-caramelo', kind: 'blob', seed: 1, cosmetic: false, stability: 'stable', shape: { kind: 'capsule', a: tip, b: tip, radius: 0.0105 } });
    s.links.push({ ...s.links.find((l) => l.childId === stick.id), id: 'lk-bola', parentId: stick.id, childId: `${stick.id}~caramelo`, mode: 'tail', exit: null, crossings: [] });
    const P = fighterFromSnapshot(s);
    const pop = P.limbs.find((l) => l.id === 'palito-mv47lm1n-2');
    ok(pop && pop.rigid, 'el chupetín queda rígido');
    const m = fight(P);
    const k = P.limbs.indexOf(pop);
    for (let i = 0; i < 200; i++) stepMatch(m, [{ x: i < 60 ? 1 : 0, punch: i % 40 === 0, guard: i > 150 }, { x: 0 }]);
    ok(rot(m.f[0].limbs[k]) < 1e-6, 'el chupetín no gira sobre su clavado');
    // Pero pega con el cuerpo entero (fuerza centrípeta): carga echándose atrás y se balancea; pifiar cuesta muchísimo.
    const sw = fight(P);
    sw.f[1].x = 0.15;
    sw.f[0].nextArm = sw.f[0].arms.indexOf(k);
    let tiltSpan = [0, 0], whiff = null;
    for (let i = 0; i < 160; i++) {
      stepMatch(sw, [{ x: 0, punch: i === 0 }, { x: 0 }]);
      tiltSpan = [Math.min(tiltSpan[0], sw.f[0].tilt), Math.max(tiltSpan[1], sw.f[0].tilt)];
      for (const e of sw.events) if (e.type === 'whiff') whiff = e;
    }
    ok(tiltSpan[1] - tiltSpan[0] > 0.6, `con el chupetín se balancea el cuerpo entero (${tiltSpan.map((v) => v.toFixed(2))})`);
    ok(whiff && whiff.lock > 40, `pifiar con el chupetín deja expuesto mucho tiempo (${whiff?.lock} cuadros)`);
    // El chupetín pesa: el cuerpo se inclina hacia donde está.
    const lean = fight(P);
    for (let i = 0; i < 180; i++) stepMatch(lean, [{ x: 0 }, { x: 0 }]);
    const pl = P.limbs[k];
    const side = Math.sign(pl.points.reduce((a, q) => a + q.m * q.p[0], 0));
    const base = fight(fighterFromSnapshot(snap('criatura-20261011-1623')));
    for (let i = 0; i < 180; i++) stepMatch(base, [{ x: 0 }, { x: 0 }]);
    ok(Math.sign(lean.f[0].tilt - base.f[0].tilt) === side, `el chupetín inclina el centro de gravedad hacia su lado (${base.f[0].tilt.toFixed(3)} → ${lean.f[0].tilt.toFixed(3)})`);
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
    m.f[1].x = m.f[0].x + 0.034;
    const hits = [];
    for (let i = 0; i < 260; i++) {
      stepMatch(m, [{ x: 0, punch: i % 80 === 0 }, { x: 0 }]);
      for (const e of m.events) if (e.type === 'hit' && e.by === 0) hits.push(e);
    }
    // El brazo de la aceituna puede tocar primero con su palito: se lo reconoce por sus piezas, no por el punto que tocó.
    const oliveArm = olive.pieceIds;
    const heavy = hits.find((e) => oliveArm.includes(e.piece));
    const light = hits.find((e) => !oliveArm.includes(e.piece));
    ok(light && heavy, `pegan los dos brazos (${hits.map((e) => (oliveArm.includes(e.piece) ? 'aceituna' : 'palito') + ' ' + e.damage.toFixed(1))})`);
    if (light && heavy) ok(heavy.damage > light.damage * 1.3, `la aceituna pega más (${heavy.damage.toFixed(1)} vs ${light.damage.toFixed(1)})`);
  }

  // ── Carga: lo pesado tarda en cargar; si le pegan mientras carga, lo pierde ──
  {
    const windOf = (heavy) => {
      const m = fight(mine);
      m.f[1].x = 0.15;
      const k = m.f[0].arms.find((a) => (mine.limbs[a].kind === 'heavy') === heavy);
      m.f[0].nextArm = m.f[0].arms.indexOf(k);
      let wind = 0;
      for (let i = 0; i < 120; i++) {
        stepMatch(m, [{ x: 0, punch: i === 0 }, { x: 0 }]);
        if (m.f[0].limbs[k].phase === 'windup') wind++;
      }
      return wind;
    };
    const wl = windOf(false), wh = windOf(true);
    ok(wh > wl * 2.5 && wh > 25, `la aceituna carga mucho más que el palito (${wh} vs ${wl} cuadros)`);
    // Cortarle la carga: el rival pega mientras carga la aceituna.
    const m = fight(mine);
    m.f[1].x = m.f[0].x + 0.045;
    const k = m.f[0].arms.find((a) => mine.limbs[a].kind === 'heavy');
    m.f[0].nextArm = m.f[0].arms.indexOf(k);
    let lost = false;
    for (let i = 0; i < 90 && !lost; i++) {
      stepMatch(m, [{ x: 0, punch: i === 0 }, { x: 0, punch: i === 2 }]);
      for (const e of m.events) if (e.type === 'hit' && e.by === 1 && m.f[0].limbs[k].phase !== 'windup' && m.f[0].limbs[k].phase !== 'strike') lost = true;
    }
    ok(lost, 'un golpe del rival mientras carga le corta la carga');
  }

  // ── Escudo de frente: al cubrirse se da vuelta, inclina la cabeza o se pone de cabeza según dónde lo tenga ──
  {
    const withShield = (x, y) => {
      const A = fighterFromSnapshot(snap('A'));
      A.shields = { esc: 2 };
      A.armor.push({ p: [x, y, 0], m: 0.001, r: 0.008, piece: 'esc', kind: 'shield', inside: false });
      A.mass += 0.001;
      const m = fight(A);
      for (let i = 0; i < 70; i++) stepMatch(m, [{ x: 0, guard: true }, { x: 0 }]);
      return m.f[0];
    };
    const back = withShield(-0.014, 0);
    const head = withShield(0.004, 0.03);
    const low = withShield(0.002, -0.03);
    ok(back.shieldPose?.turned && back.facing === -1, 'escudo en la espalda: se da vuelta para mostrarlo');
    ok(head.tilt > 0.6, `escudo en la cabeza: inclina la cabeza hacia adelante (${head.tilt.toFixed(2)})`);
    ok(low.tilt < -0.6, `escudo abajo: se pone de cabeza (${low.tilt.toFixed(2)})`);
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
    ok(g.blocked > 0 && g.dmg < open.dmg * 0.75, `los brazos del brócoli tapan (${g.blocked} bloqueos, ${g.dmg.toFixed(1)} vs ${open.dmg.toFixed(1)})`);
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

  // ── Piernas según su pieza: palito de la selva = lento pero fuerte; escarbadientes = rápido pero débil ──
  {
    const A0 = fighterFromSnapshot(snap('A'));
    const legIds = fight(A0).f[0].legs.map((k) => A0.limbs[k].id);
    const legsAs = (type) => {
      const s = snap('A');
      for (const id of legIds) s.pieces.find((p) => p.id === id).type = type;
      return fighterFromSnapshot(s);
    };
    const [selva, pal, esc] = ['palito-selva', 'palito', 'escarbadientes'].map(legsAs);
    const [fs, fp, fe] = [selva, pal, esc].map((P) => fight(P).f[0]);
    ok(fs.jump > fp.jump && fp.jump > fe.jump, `salto: selva ${fs.jump.toFixed(2)} > palito ${fp.jump.toFixed(2)} > escarbadientes ${fe.jump.toFixed(2)} m/s`);
    ok(fe.speed > fp.speed && fp.speed > fs.speed, `marcha: escarbadientes ${(fe.speed * 100).toFixed(1)} > palito ${(fp.speed * 100).toFixed(1)} > selva ${(fs.speed * 100).toFixed(1)} cm/s`);
    // Antes de despegar se agacha: las piernas lentas tardan más.
    const jumpAt = (P) => {
      const m = fight(P);
      for (let i = 0; i < 30; i++) {
        stepMatch(m, [{ x: 0, up: i === 0 }, { x: 0 }]);
        if (m.events.some((e) => e.type === 'jump' && e.who === 0)) return i;
      }
      return -1;
    };
    const [js, je] = [jumpAt(selva), jumpAt(esc)];
    ok(je >= 2 && js > je, `se agacha antes de saltar (escarbadientes ${je} cuadros, selva ${js})`);
    // Más piernas suman fuerza, pero el peso la reparte: con lastre no salta más alto.
    const heavy = { ...pal, armor: [...pal.armor, { p: [0, 0, 0], m: 0.004, r: 0.001, piece: 'lastre', kind: 'light', inside: true }], mass: pal.mass + 0.004 };
    ok(fight(heavy).f[0].jump < fp.jump, 'con más peso salta menos');
  }

  // ── Golpe con lógica física: al pifiar el brazo sigue de largo y el cuerpo se va; al acertar frena contra el otro ──
  {
    const strikeOf = (gap) => {
      const m = fight(mine);
      m.f[1].x = m.f[0].x + gap;
      const f = m.f[0];
      const k = f.model.limbs.findIndex((l, j) => f.arms.includes(j) && l.kind !== 'heavy');
      f.nextArm = f.arms.indexOf(k);
      const x0 = f.x;
      let maxRot = 0, hit = false, whiff = false;
      for (let i = 0; i < 50; i++) {
        stepMatch(m, [{ x: 0, punch: i === 0 }, { x: 0 }]);
        maxRot = Math.max(maxRot, rot(f.limbs[k]));
        for (const e of m.events) {
          if (e.type === 'hit' && e.by === 0) hit = true;
          if (e.type === 'whiff' && e.who === 0) whiff = true;
        }
      }
      return { maxRot, hit, whiff, dx: f.x - x0 };
    };
    const H = strikeOf(0.034);
    const Wf = strikeOf(0.2);
    ok(H.hit && Wf.whiff, `acierto y pifie (${H.hit}, ${Wf.whiff})`);
    ok(Wf.maxRot > H.maxRot + 0.3, `al pifiar el brazo sigue de largo (${(Wf.maxRot * 57.3).toFixed(0)}° vs ${(H.maxRot * 57.3).toFixed(0)}° al acertar)`);
    ok(Wf.dx > H.dx, `el que pifia se va para adelante, el que acierta frena (${(Wf.dx * 1000).toFixed(1)} vs ${(H.dx * 1000).toFixed(1)} mm)`);
    // Anticipación: al cargar el peso va atrás; al soltar, adelante.
    const m = fight(mine);
    m.f[1].x = 0.2;
    const f = m.f[0];
    f.nextArm = f.arms.indexOf(f.model.limbs.findIndex((l, j) => f.arms.includes(j) && l.kind !== 'heavy'));
    const t0 = f.tilt;
    let back = 0, fwd = 0;
    for (let i = 0; i < 30; i++) {
      stepMatch(m, [{ x: 0, punch: i === 0 }, { x: 0 }]);
      const ph = f.limbs.find((q) => q.phase === 'windup' || q.phase === 'strike')?.phase;
      if (ph === 'windup') back = Math.min(back, f.tilt - t0);
      if (ph === 'strike') fwd = Math.max(fwd, f.tilt - t0);
    }
    ok(back < -0.01 && fwd > back + 0.03, `el peso va atrás al cargar y adelante al soltar (${back.toFixed(3)} → ${fwd.toFixed(3)} rad)`);
  }

  // ── Combinaciones: después de acertar se encadena (UNO-DOS, PIÑA Y PATADA); después de bloquear, CONTRA ──
  {
    const chainOf = (second) => {
      const m = fight(mine);
      // Contra la pared: el empujón no lo saca de alcance.
      m.f[0].x = 0.111;
      m.f[1].x = 0.145;
      const f = m.f[0];
      f.nextArm = f.arms.indexOf(f.model.limbs.findIndex((l, j) => f.arms.includes(j) && l.kind !== 'heavy'));
      let first = -1, started = null, startAt = -1, hs = 0;
      const landed = [];
      for (let i = 0; i < 90; i++) {
        const press = first >= 0 && i === first + 3;
        stepMatch(m, [{ x: 0, punch: i === 0 || (second === 'punch' && press), kick: second === 'kick' && press }, { x: 0 }]);
        for (const e of m.events) if (e.type === 'hit' && e.by === 0) { if (first < 0) { first = i; hs = m.hitstop; } if (e.chain) landed.push(e.chain); }
        const c = f.limbs.find((q) => q.combo && q.phase !== 'rest');
        if (c && !started) { started = c.combo; startAt = i; }
      }
      return { first, started, wait: startAt - first, hs, landed };
    };
    const p2 = chainOf('punch');
    ok(p2.first >= 0 && p2.started === 'UNO-DOS', `piña que acierta + piña = UNO-DOS (${p2.started})`);
    // Sale apenas termina el congelamiento del impacto, sin pagar el castigo de acertar (`hitLock`).
    ok(p2.wait > 0 && p2.wait < p2.hs + FIGHT.hitLock, `la segunda sale sin esperar el castigo (${p2.wait} cuadros, congelamiento ${p2.hs})`);
    ok(p2.landed.includes('UNO-DOS'), `y pega (${p2.landed})`);
    const pk = chainOf('kick');
    ok(pk.started === 'PIÑA Y PATADA', `piña que acierta + patada = PIÑA Y PATADA (${pk.started})`);
    // Sin acertar no hay combinación: pifiar corta la cadena.
    const solo = fight(mine);
    solo.f[1].x = 0.2;
    let any = false;
    for (let i = 0; i < 120; i++) {
      stepMatch(solo, [{ x: 0, punch: i % 12 === 0 }, { x: 0 }]);
      any ||= solo.f[0].limbs.some((q) => q.combo);
    }
    ok(!any, 'sin acertar no hay combinación');
    // CONTRA: bloquea con la guardia y suelta una piña enseguida.
    const c = fight(mine);
    c.f[1].x = c.f[0].x + 0.045;
    let blockedAt = -1, contra = false;
    for (let i = 0; i < 260 && !contra; i++) {
      const guard = blockedAt < 0;
      stepMatch(c, [{ x: 0, guard, punch: blockedAt >= 0 && i === blockedAt + FIGHT.blockstun + 4 }, { x: 0, punch: i % 45 === 10 }]);
      for (const e of c.events) if (e.type === 'hit' && e.by === 1 && e.blocked && blockedAt < 0) blockedAt = i;
      contra ||= c.f[0].limbs.some((q) => q.combo === 'CONTRA');
    }
    ok(blockedAt >= 0 && contra, `después de bloquear, la piña sale como CONTRA (bloqueó en ${blockedAt})`);
  }

  // ── Chupetín: carga corta y visible; abajo (pierna fija) patea con el cuerpo entero si tiene otra pierna ──
  {
    const withPop = (id) => {
      const s = snap('criatura-20261011-1623');
      const stick = s.pieces.find((p) => p.id === id);
      stick.type = 'chupetin';
      s.pieces.push({ id: `${id}~caramelo`, type: 'chupetin-caramelo', kind: 'blob', seed: 1, cosmetic: false, stability: 'stable', shape: { kind: 'capsule', a: stick.shape.b, b: stick.shape.b, radius: 0.0105 } });
      s.links.push({ ...s.links.find((l) => l.childId === id), id: `lk-${id}`, parentId: id, childId: `${id}~caramelo`, mode: 'tail', exit: null, crossings: [] });
      return fighterFromSnapshot(s);
    };
    const P = withPop('palito-mv47lm1n-2');
    const m = fight(P);
    const k = P.limbs.findIndex((l) => l.rigid);
    m.f[0].nextArm = m.f[0].arms.indexOf(k);
    let at = -1;
    for (let i = 0; i < 60 && at < 0; i++) {
      stepMatch(m, [{ x: 0, punch: i === 0 }, { x: 0 }]);
      if (m.f[0].limbs[k].phase === 'strike') at = i;
    }
    ok(at > 0 && at <= FIGHT.swing.windFrames + FIGHT.swing.maxCharge + 2, `el chupetín suelta el golpe en ${at} cuadros (no espera un segundo)`);
    const peg = withPop('palito-selva-mv47mu5p-6');
    const g = fight(peg);
    const pk = peg.limbs.findIndex((l) => l.rigid);
    ok(g.f[0].pegs.includes(pk) && g.f[0].legs.length === 1, `el chupetín abajo es una pierna fija (${g.f[0].pegs}, piernas ${g.f[0].legs.length})`);
    let swung = false;
    for (let i = 0; i < 200; i++) {
      stepMatch(g, [{ x: 0, kick: i % 60 === 0 }, { x: 0 }]);
      swung ||= g.f[0].swing?.k === pk;
    }
    ok(swung, 'y patea balanceando el cuerpo entero');
  }

  // ── Secciones y botones por cuadrante: piernas abajo (pedazo chico), cabeza arriba (no es brazo), brazos al medio; Q/W brazos
  //    izq/der, A/S piernas izq/der, cada botón de a una extremidad y cada cuadrante por su lado ──
  {
    const { zoneOf, ZONES, quadOf } = await server.ssrLoadModule('/src/creature/zones.ts');
    ok(zoneOf(-0.9, 1) === 'leg' && zoneOf(0, 1) === 'arm' && zoneOf(0.9, 1) === 'head', 'secciones: pierna abajo, brazo al medio, cabeza arriba');
    ok(1 + ZONES.legBelow < 0.6 && quadOf('head', 'L') === null && quadOf('leg', 'R') === 'RL', `la sección de piernas es un pedazo chico (${((1 + ZONES.legBelow) * 50).toFixed(0)} % del largo) y la cabeza no tiene botón`);
    ok(mine.limbs.every((l) => l.side === 'L' || l.side === 'R'), 'cada extremidad tiene lado');
    // Los dos brazos del mismo lado: ese botón los usa de a uno, el del otro lado no hace nada.
    const both = { ...mine, limbs: mine.limbs.map((l) => (l.role === 'arm' ? { ...l, side: 'L' } : l)) };
    const m = fight(both);
    m.f[1].x = 0.2;
    const used = [];
    let other = false;
    for (let i = 0; i < 240; i++) {
      stepMatch(m, [{ x: 0, quad: i === 0 || i === 120 ? 'LA' : i === 200 ? 'RA' : undefined }, { x: 0 }]);
      m.f[0].limbs.forEach((q, k) => {
        if (q.phase === 'windup' && q.t === 1) (i >= 200 ? (other = true) : used.push(k));
      });
    }
    ok(used.length === 2 && used[0] !== used[1] && used.every((k) => both.limbs[k].role === 'arm'), `Q dos veces = los dos brazos de ese lado, de a uno (${used})`);
    ok(!other, 'W sin brazos en ese lado no hace nada');
    // Patada por cuadrante: sólo las piernas de ese lado.
    const legs = fight(mine);
    const legSide = mine.limbs.find((l) => l.role === 'leg').side;
    let kicked = -1;
    for (let i = 0; i < 40; i++) {
      stepMatch(legs, [{ x: 0, quad: i === 0 ? `${legSide}L` : undefined }, { x: 0 }]);
      legs.f[0].limbs.forEach((q, k) => q.phase === 'strike' && (kicked = k));
    }
    ok(kicked >= 0 && mine.limbs[kicked].role === 'leg' && mine.limbs[kicked].side === legSide, `A/S patea con la pierna de ese lado (${kicked})`);
  }

  // ── Cuerpo entero: el torso gira con el golpe y, al patear, la pierna que queda apoyada se acomoda bajo el cuerpo ──
  {
    const m = fight(mine);
    m.f[1].x = 0.2;
    const f = m.f[0];
    f.nextArm = f.arms.indexOf(f.model.limbs.findIndex((l, j) => f.arms.includes(j) && l.kind !== 'heavy'));
    let wind = 0, strike = 0;
    for (let i = 0; i < 30; i++) {
      stepMatch(m, [{ x: 0, punch: i === 0 }, { x: 0 }]);
      const ph = f.limbs.find((q) => q.phase === 'windup' || q.phase === 'strike')?.phase;
      if (ph === 'windup' && Math.abs(f.twist) > Math.abs(wind)) wind = f.twist;
      if (ph === 'strike' && Math.abs(f.twist) > Math.abs(strike)) strike = f.twist;
    }
    ok(Math.abs(strike) > 0.12 && Math.sign(strike) !== Math.sign(wind), `el torso gira al pegar: atrás al cargar, adelante al soltar (${wind.toFixed(2)} → ${strike.toFixed(2)} rad)`);
    const k = fight(mine);
    const kf = k.f[0];
    for (let i = 0; i < 60; i++) stepMatch(k, [{ x: 0 }, { x: 0 }]);
    const rest = kf.limbs.map((q) => [...q.q]);
    let kicker = -1, moved = 0;
    for (let i = 0; i < 20; i++) {
      stepMatch(k, [{ x: 0, kick: i === 0 }, { x: 0 }]);
      kf.limbs.forEach((q, j) => (q.phase === 'windup' || q.phase === 'strike') && (kicker = j));
      for (const j of kf.legs) if (j !== kicker && kicker >= 0) moved = Math.max(moved, 2 * Math.acos(Math.min(1, Math.abs(kf.limbs[j].q.reduce((a, v, c) => a + v * rest[j][c], 0)))));
    }
    ok(kicker >= 0 && moved > 0.03, `al patear, la otra pierna se acomoda para sostenerlo (${(moved * 57.3).toFixed(1)}°)`);
  }

  // ── Rivales por nivel: 1 brócoli, 2 huevo duro (brazos largos, menos defensa), 3 quinoa (defensa y se rearma) ──
  {
    const mine = fighterFromSnapshot(snap('criatura-20261011-1623'));
    const names = [1, 2, 3].map((l) => rivalFighter(l).name);
    ok(/BROCOLOCO/.test(names[0]) && /HUEVO/.test(names[1]) && /QUINOA/.test(names[2]), `un rival por nivel (${names.join(' / ')})`);
    const armReach = (R) => Math.max(...R.limbs.filter((l) => l.role === 'arm').map((l) => l.reach));
    ok(armReach(rivalFighter(2)) > armReach(rivalFighter(1)) * 1.5, 'el huevo tiene los brazos más largos (más alcance)');
    ok(rivalFighter(2).armorMul > 1 && rivalFighter(3).armorMul < 1, 'el huevo recibe más daño y la quinoa menos');
    for (const lvl of [2, 3]) {
      const m = createMatch([mine, rivalFighter(lvl)]);
      for (let i = 0; i < FIGHT.introFrames + 30; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
      const f = m.f[1];
      ok(f.grounded && Math.abs(f.tilt) < 0.05 && f.legs.length === 2, `nivel ${lvl}: parado sobre sus dos patas (inclinación ${f.tilt.toFixed(3)})`);
      const x0 = f.x;
      for (let i = 0; i < 60; i++) stepMatch(m, [{ x: 0 }, { x: -1 }]);
      ok(x0 - f.x > 0.03, `nivel ${lvl}: camina (${((x0 - f.x) * 1000).toFixed(0)} mm en 1 s)`);
    }
    const q = createMatch([mine, rivalFighter(3)]);
    for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(q, [{ x: 0 }, { x: 0 }]);
    q.f[1].hp = 50;
    q.f[1].lastHurt = q.frame;
    for (let i = 0; i < 60; i++) stepMatch(q, [{ x: 0 }, { x: 0 }]);
    const early = q.f[1].hp;
    for (let i = 0; i < 240; i++) stepMatch(q, [{ x: 0 }, { x: 0 }]);
    ok(early === 50 && q.f[1].hp > 55, `la quinoa se rearma si no le pegan (50 → ${early.toFixed(1)} al segundo → ${q.f[1].hp.toFixed(1)} a los 5 s)`);
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
