// Batería de golpes S1–S7: por criatura, qué acción usa cada extremidad y por qué las otras no generan ninguna.
// Uso: node scripts/creature-battery.mjs [docs/creature/informe-golpes.md]
import { createServer } from 'vite';
import fs from 'node:fs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const I = await server.ssrLoadModule('/src/creature/index.ts');
const { strikeKindOf } = await server.ssrLoadModule('/src/creature/analyze/actions.ts');
const cfg = I.CREATURE_CONFIG;
const f = (x, n = 2) => (+x).toFixed(n);
const short = (id) => id.replace(/^limb:/, '').replace(/^palito-fx/, 'p').replace(':tail', ' (cola)').replace(':tip', ' (punta)');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const unit = (a, b) => { const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

const lines = ['# Batería de golpes (S1–S7)', '', 'Generado por `node scripts/creature-battery.mjs`. Frente por defecto (−Y, derecha de la pantalla del constructor). Mínimo de capacidad de golpe: ' + cfg.capabilities.minRole + '.', ''];
const summary = [];
for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']) {
  const snap = JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8'));
  const a = I.interpret(snap);
  const dirKind = new Map(a.limbs.map((l) => [l.id, strikeKindOf({ tag: l.tag, length: l.length, angleDeg: l.profile.angleDeg, inDepth: l.profile.inDepth, dy: l.profile.tip[1] - l.profile.pivot[1] }, cfg)]));
  const byAction = new Map(a.actions.filter((x) => x.limbId).map((x) => [x.limbId, x]));
  const rows = [];
  for (const l of a.limbs) {
    const kind = dirKind.get(l.id);
    const axis = unit(l.pivot, l.tip);
    const near = a.limbs.filter((o) => o !== l && o.id !== l.pairedWith && dirKind.get(o.id) === kind && dist(o.pivot, l.pivot) <= cfg.mobility.crowdRadius && (Math.acos(Math.max(-1, Math.min(1, axis.reduce((s, v, i) => s + v * unit(o.pivot, o.tip)[i], 0)))) * 180) / Math.PI < cfg.mobility.crowdAngleDeg);
    const act = byAction.get(l.id);
    let result;
    if (act) result = `**${act.kind}** (${act.input}), daño ${f(act.damage, 1)}`;
    else if (kind === null) result = 'ninguna: apunta fuera del arco de golpe';
    else if (l.caps.strike < cfg.capabilities.minRole) {
      const why = [];
      if (l.profile.inDepth) why.push(`en profundidad (×${cfg.capabilities.inDepthStrikeFactor})`);
      if (near.length) why.push(`apiñada con ${near.length} del mismo golpe (÷${near.length + 1})`);
      if (l.anchorQuality < 0.6) why.push(`ancla ${f(l.anchorQuality)}`);
      result = `ninguna: capacidad ${f(l.caps.strike)} < ${cfg.capabilities.minRole} — ${why.join(', ') || 'dirección'}`;
    } else {
      const winner = a.actions.find((x) => x.kind === kind && x.limbId);
      result = `ninguna: pasa el mínimo, pero la acción "${kind}" la ejecuta ${short(winner.limbId)} (una por tipo)`;
    }
    rows.push(`| ${short(l.id)} | ${f(l.length * 100, 1)} | ${f(l.profile.angleDeg, 0)}°${l.profile.inDepth ? ' prof.' : ''} | ${kind ?? '—'} | ${f(l.anchorQuality)} | ${near.length} | ${f(l.caps.strike)} | ${result} |`);
  }
  const body = a.actions.map((x) => `${x.kind}${x.limbId ? ' ← ' + short(x.limbId) : ' ← cuerpo'}`).join(' · ');
  lines.push(`## ${snap.source.name}`, '', `Locomoción: ${a.locomotion.mode}, freno ${f(a.locomotion.brake)}. Acciones: ${body}.`, '', '| extremidad | largo cm | ángulo | golpe por dirección | ancla | vecinas iguales | capacidad | acción |', '|---|---|---|---|---|---|---|---|', ...rows, '');
  summary.push(`${id}: ${a.limbs.length} extr → ${a.actions.map((x) => x.kind).join(', ')}`);
}
const out = process.argv[2] ?? 'docs/creature/informe-golpes.md';
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(summary.join('\n'));
await server.close();
