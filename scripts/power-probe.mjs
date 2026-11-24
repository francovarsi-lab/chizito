// Sonda de poderes de los rivales (sin navegador): TU CHIZITO (arquetipo boxeador) quieto y sin cubrirse frente a cada rival, que
// suelta su poder a 6 cm; suma el daño. También mide REAGRUPARSE (vida que recupera la quinoa). Uso: node scripts/power-probe.mjs
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { fighterFromSnapshot, rivalFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { FIGHT } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  const P = fighterFromSnapshot(JSON.parse(fs.readFileSync('src/creature/fixtures/arq/boxeador.snapshot.json', 'utf8')));
  const out = [];
  for (const [lvl, kind, guard] of [[1, 'arbolitos', false], [1, 'arbolitos', true], [3, 'avalancha', false], [3, 'rearme', false]]) {
    const R = rivalFighter(lvl);
    const m = createMatch([P, R]);
    for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
    m.f[1].x = m.f[0].x + 0.06;
    if (kind === 'rearme') { m.f[1].hp = 50; m.piles.push({ id: 999, x: 0.1, n: 20, t: 0 }); }
    const hp0 = [m.f[0].hp, m.f[1].hp];
    m.f[1].pw = { kind, phase: 'wind', t: 0, hit: false };
    for (let i = 0; i < 200; i++) stepMatch(m, [{ x: 0, guard }, { x: 0 }]);
    out.push(`${kind}${guard ? ' (cubierto)' : ''}: daño a tu chizito ${(hp0[0] - m.f[0].hp).toFixed(1)}, vida del rival ${hp0[1].toFixed(0)} → ${m.f[1].hp.toFixed(1)}`);
  }
  console.log(out.join('\n'));
} finally { await server.close(); }
