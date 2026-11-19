// Matriz de balance (T1 del plan): arquetipo × rival (nivel 1, 2, 3) × bot × semillas → % de victorias, duración media y
// daño medio por golpe. Sin navegador. Arquetipos: `node scripts/make-archetypes.mjs`.
// Uso: node scripts/fight-matrix.mjs [semillas=20] [arquetipo…]
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { fighterFromSnapshot, rivalFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { aiInput, newAi } = await server.ssrLoadModule('/src/creature/fight/ai.ts');
  const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  const { MOVES } = await server.ssrLoadModule('/src/creature/fight/moves.ts');
  const DIR = 'src/creature/fixtures/arq';
  const seeds = Number(process.argv[2]) || 20;
  const only = process.argv.slice(3);
  const ids = fs.readdirSync(DIR).map((f) => f.replace('.snapshot.json', '')).filter((id) => !only.length || only.includes(id)).sort();

  const reachOf = (f) => Math.max(0.02, ...f.model.limbs.filter((l) => l.role === 'arm').map((l) => l.reach + Math.max(0, l.pivot[0] * 0.5))) + 0.012;
  const toward = (m) => (m.f[1].x >= m.f[0].x ? 1 : -1);
  // Distancia útil: centro a centro menos lo que el rival es más ancho que el brócoli (la quinoa es gorda).
  const gapOf = (m) => Math.abs(m.f[1].x - m.f[0].x) - Math.max(0, Math.max(...m.f[1].model.body.map((b) => b.r)) - 0.012);
  // Bots de nuestro lado (`listo` usa todo el sistema v2): (m, mem) => FightInput.
  const BOTS = {
    // Aprieta Q y W alternados sin pensar (cada 6 cuadros) y camina hacia el rival si no llega.
    aporrea: (m, mem) => {
      const near = gapOf(m);
      if (near > reachOf(m.f[0])) return { x: toward(m) };
      mem.t = (mem.t ?? 0) + 1;
      return mem.t % 6 ? { x: 0 } : { x: 0, quad: (mem.t / 6) % 2 ? 'LA' : 'RA' };
    },
    // La misma IA que maneja a los rivales, en su mejor nivel.
    ia: (m, mem) => aiInput(m, (mem.ai ??= newAi(mem.seed * 7 + 1, 3)), 0),
    // Juega bien: bloquea lo que ve venir, castiga cuando el rival queda trabado, usa el poder lleno y pega con cadencia.
    // Juega bien con todo el sistema: lee los ataques del rival (ataja lo que se bloquea, salta lo bajo, se aleja de lo que rompe
    // la guardia), castiga con golpes CARGADOS (revientan la quinoa) y usa el poder (media barra o llena).
    listo: (m, mem) => {
      const me = m.f[0], foe = m.f[1];
      const near = gapOf(m), reach = reachOf(me);
      const dir = toward(m);
      mem.t = (mem.t ?? 0) + 1;
      if (m.phase !== 'fight') return { x: 0 };
      if (me.stun > 0) return { x: 0 };
      // Golpe cargado en curso: mantener hasta `mem.hold` cuadros.
      if (mem.hold > 0) { mem.hold--; return { x: 0, quadHeld: mem.q }; }
      const mv = foe.mv && MOVES[foe.mv.id];
      // Humano, no perfecto: lee bien 2 de cada 3 ataques (se decide al verlo arrancar, con azar de semilla).
      if (foe.mv && mem.seen !== foe.mv) { mem.seen = foe.mv; mem.r = ((mem.r ?? mem.seed * 9301 + 49297) * 9301 + 49297) % 233280; mem.reads = mem.r / 233280 < 0.66; }
      if (mv && mv.hits.length && mem.reads) {
        const next = mv.hits.find((h) => h.to >= foe.mv.t);
        const until = next ? next.from - foe.mv.t : 99;
        if (next && near < mv.reach + 0.02) {
          if (mv.guard === 'low') return until <= 6 ? { x: 0, up: true } : { x: 0 };
          if (mv.guard === 'break') return { x: -dir };
          // Atajada: apretar la guardia justo antes (≤ 5 cuadros).
          return { x: 0, guard: until <= 5 };
        }
        // Se está recuperando (pasó la última ventana): castigar con un cargado.
        if (!next && near < reach * 1.3) { mem.q = mem.t % 2 ? 'LA' : 'RA'; mem.hold = 24; return { x: 0, quad: mem.q, quadHeld: mem.q }; }
      }
      const foeWind = foe.limbs.some((q) => q.phase === 'windup' || q.phase === 'strike');
      const mineBusy = me.limbs.some((q) => q.phase !== 'rest');
      if (!mv && foeWind && near < reach * 1.8 && !mineBusy) return { x: 0, guard: true };
      if (me.meter >= FIGHT.powerUse.half && me.model.power && near < reach * 1.5) return { x: 0, power: true };
      if (near > reach) return { x: dir };
      if (foe.lock > 4 || me.counter > 0 || mem.t % 80 === 0) {
        mem.q = mem.t % 2 ? 'LA' : 'RA';
        mem.hold = 24;
        return { x: 0, quad: mem.q, quadHeld: mem.q };
      }
      return { x: 0 };
    },
  };

  const run = (P, level, bot, seed) => {
    const m = createMatch([P, rivalFighter(level)]);
    const ai = newAi(seed * 31 + level, level);
    const mem = { seed };
    const hits = [0, 0], dmg = [0, 0];
    for (let fr = 0; fr < 60 * 600 && m.phase !== 'over'; fr++) {
      const inp = [BOTS[bot](m, mem), aiInput(m, ai, 1)];
      if (process.env.MTRACE && fr > 120 && fr < 700 && fr % 6 === 0) console.error(fr, 'gap', gapOf(m).toFixed(3), 'P', m.f[0].limbs.map((q) => q.phase[0] + q.t).join(','), 'lock', m.f[0].lock, 'R stun', m.f[1].stun, 'y', m.f[1].y.toFixed(3), 'mv', m.f[1].mv?.id ?? '-', m.f[1].mv?.t ?? '', ai.doing, ai.think, JSON.stringify(inp[1]));
      stepMatch(m, inp);
      for (const e of m.events) {
        if (e.type === 'hit' && !e.blocked) { hits[e.by]++; dmg[e.by] += e.damage; }
        if (process.env.MDEBUG && e.type === 'hit' && e.by === 1) { const k = `${e.blocked ? 'blk:' : ''}${e.piece}`; (mem.dbg ??= {})[k] = (mem.dbg[k] ?? 0) + e.damage; }
        if (process.env.MDEBUG) (mem.dbg ??= {})[e.type + (e.by ?? e.who ?? '')] = (mem.dbg[e.type + (e.by ?? e.who ?? '')] ?? 0) + (e.damage ?? 1);
      }
    }
    if (process.env.MDEBUG) console.error(bot, level, m.winner, Math.round(m.frame / 60), JSON.stringify(mem.dbg, (k, v) => (typeof v === 'number' ? Math.round(v) : v)));
    return { win: m.winner === 0, frames: m.frame, hits, dmg };
  };

  const cell = (P, bot, level) => {
    let w = 0, fr = 0, h = [0, 0], d = [0, 0];
    for (let s = 1; s <= seeds; s++) {
      const r = run(P, level, bot, s);
      w += r.win; fr += r.frames; h = h.map((v, i) => v + r.hits[i]); d = d.map((v, i) => v + r.dmg[i]);
    }
    return { win: w / seeds, secs: fr / seeds / 60, dmg: [d[0] / Math.max(1, h[0]), d[1] / Math.max(1, h[1])] };
  };
  // Hijo: calcula sus arquetipos y devuelve JSON. Padre: reparte los arquetipos en un proceso por núcleo y arma la tabla.
  if (process.env.MATRIX_CHILD) {
    const out = [];
    for (const id of ids) {
      const P = fighterFromSnapshot(JSON.parse(fs.readFileSync(`${DIR}/${id}.snapshot.json`, 'utf8')));
      P.power = 'queso'; // como en el juego (mount.ts)
      for (const bot of Object.keys(BOTS)) for (const level of [1, 2, 3]) out.push({ id, g: P.mass * 1000, bot, level, ...cell(P, bot, level) });
    }
    process.stdout.write(JSON.stringify(out));
  } else {
    const t0 = Date.now();
    const { execFile } = await import('node:child_process');
    const { cpus } = await import('node:os');
    const n = Math.min(ids.length, cpus().length);
    const groups = Array.from({ length: n }, (_, i) => ids.filter((_, k) => k % n === i));
    const parts = await Promise.all(groups.map((g) => new Promise((ok, ko) => execFile('node', [process.argv[1], String(seeds), ...g], { env: { ...process.env, MATRIX_CHILD: '1' }, maxBuffer: 1 << 24 }, (e, so) => (e ? ko(e) : ok(JSON.parse(so)))))));
    const rows = parts.flat();
    const pct = (v) => `${Math.round(v * 100)}%`;
    console.log(`Matriz: ${seeds} semillas por celda. Celda = % victorias · duración media · daño medio por golpe acertado (nuestro / rival)\n`);
    console.log('| arquetipo | g | bot | nivel 1 | nivel 2 | nivel 3 |');
    console.log('|---|---|---|---|---|---|');
    for (const id of ids) for (const bot of Object.keys(BOTS)) {
      const r = rows.filter((x) => x.id === id && x.bot === bot).sort((a, b) => a.level - b.level);
      console.log(`| ${id} | ${r[0].g.toFixed(1)} | ${bot} | ${r.map((c) => `${pct(c.win)} · ${c.secs.toFixed(0)} s · ${c.dmg[0].toFixed(1)} / ${c.dmg[1].toFixed(1)}`).join(' | ')} |`);
    }
    // Promedios por bot y nivel, y quién se sale 15 puntos del promedio (objetivo 4.7 del plan).
    console.log('\nPromedio de victorias por bot (nivel 1 / 2 / 3):');
    for (const bot of Object.keys(BOTS)) {
      const avg = [1, 2, 3].map((l) => { const r = rows.filter((x) => x.bot === bot && x.level === l); return r.reduce((a, x) => a + x.win, 0) / r.length; });
      const out = rows.filter((x) => x.bot === bot && Math.abs(x.win - avg[x.level - 1]) > 0.15).map((x) => `${x.id}@${x.level} ${pct(x.win)}`);
      console.log(`- ${bot}: ${avg.map(pct).join(' / ')}${out.length ? ` · a más de 15 puntos del promedio: ${out.join(', ')}` : ''}`);
    }
    console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
} finally { await server.close(); }
