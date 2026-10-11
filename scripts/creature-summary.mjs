// Resumen numérico de A–E y vegetal (extremidades, acciones, locomoción, masa) para comparar antes/después de un cambio.
// Uso: node scripts/creature-summary.mjs [salida.json]
import { createServer } from 'vite';
import fs from 'node:fs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { interpret } = await server.ssrLoadModule('/src/creature/index.ts');
const r = (x, n = 5) => Math.round(x * 10 ** n) / 10 ** n;
const out = {};
for (const id of ['A', 'B', 'C', 'D', 'E', 'veg', 'P']) {
  const snap = JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8'));
  for (const facing of [1, -1]) {
    const a = interpret(snap, { facing });
    out[`${id}${facing === 1 ? '' : '-giro'}`] = {
      limbs: a.limbs.map((l) => [l.id, l.tag, r(l.mass, 6), r(l.caps.strike, 4), r(l.caps.support, 4), l.profile.inDepth]),
      decorative: a.decorative.map((d) => [d.pieceId, d.reason]),
      actions: a.actions.map((x) => [x.kind, x.input, x.limbId ?? '', x.startup, x.active, x.recovery, r(x.damage, 4), r(x.reach, 5)]),
      locomotion: { ...a.locomotion, speed: r(a.locomotion.speed, 5), jump: r(a.locomotion.jump, 5), turn: r(a.locomotion.turn, 4), brake: r(a.locomotion.brake, 4) },
      mass: r(a.mass.total, 7),
      defense: a.defense,
    };
  }
}
const file = process.argv[2];
if (file) fs.writeFileSync(file, JSON.stringify(out, null, 1));
const brief = Object.entries(out).filter(([k]) => !k.endsWith('-giro')).map(([k, v]) => `${k}: ${v.limbs.length} extr, golpes [${v.actions.map((x) => x[0]).join(',')}], ${v.locomotion.mode} freno ${v.locomotion.brake}`);
console.log(brief.join('\n'));
await server.close();
