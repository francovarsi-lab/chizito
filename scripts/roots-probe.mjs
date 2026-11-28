// Sonda de RAÍCES (sin navegador): el brócoli suelta raíces bajo TU CHIZITO quieto; después el chizito intenta caminar y saltar.
// Atado tiene que quedarse en el lugar ~2,5 s. Uso: node scripts/roots-probe.mjs
import { createServer } from 'vite';
import fs from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { fighterFromSnapshot, broccoliFighter } = await server.ssrLoadModule('/src/creature/fight/fighter.ts');
  const { createMatch, stepMatch } = await server.ssrLoadModule('/src/creature/fight/engine.ts');
  const { FIGHT, POWERS } = await server.ssrLoadModule('/src/creature/fight/tuning.ts');
  const P = fighterFromSnapshot(JSON.parse(fs.readFileSync('src/creature/fixtures/arq/boxeador.snapshot.json', 'utf8')));
  const m = createMatch([P, broccoliFighter(1)]);
  for (let i = 0; i < FIGHT.introFrames; i++) stepMatch(m, [{ x: 0 }, { x: 0 }]);
  m.f[1].x = m.f[0].x + 0.1;
  m.f[1].pw = { kind: 'raices', phase: 'wind', t: 0, hit: false };
  let held = -1;
  for (let i = 0; i < 120 && held < 0; i++) { stepMatch(m, [{ x: 0 }, { x: 0 }]); if (m.f[0].rooted > 0) held = i; }
  const x0 = m.f[0].x;
  const log = [];
  for (let i = 0; i < 200; i++) {
    stepMatch(m, [{ x: -1, up: i % 20 === 0 }, { x: 0 }]);
    if (i % 25 === 0) log.push(`${i}: x ${((m.f[0].x - x0) * 100).toFixed(2)} cm, y ${(m.f[0].y * 100).toFixed(2)}, atado ${m.f[0].rooted}, stun ${m.f[0].stun}`);
  }
  console.log(`atado al cuadro ${held}\n` + log.join('\n'));
} finally { await server.close(); }
