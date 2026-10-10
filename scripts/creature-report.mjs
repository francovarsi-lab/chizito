// Informe de texto del intérprete sobre las criaturas de prueba: docs/creature/informe-criaturas.md
// Uso: node scripts/creature-report.mjs     (se regenera en cada tanda)
import { createServer } from 'vite';
import fs from 'node:fs';

globalThis.location ??= { search: '' };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const mm = (x) => (x * 1000).toFixed(1);
const g = (x) => (x * 1000).toFixed(2);
try {
  const idx = await server.ssrLoadModule('/src/creature/index.ts');
  const ids = ['A', 'B', 'C', 'D', 'E', 'veg'];
  const names = { A: 'A · cuerpo + 2 brazos + 2 piernas', B: 'B · cuerpo + 4 brazos', C: 'C · cuerpo + 1 brazo', D: 'D · erizo', E: 'E · asimétrica / extraña', veg: 'Rival vegetal (proxy)' };
  let md = '# Informe del intérprete sobre las criaturas de prueba\n\n';
  md += 'Generado por `node scripts/creature-report.mjs`. Frente de combate +X, arriba +Y. Medidas en mm y gramos de juego (valores a calibrar, ver `src/creature/config.ts`).\n\n';
  const rows = [];
  let body = '';
  for (const id of ids) {
    const snap = JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8'));
    const det = idx.detectLimbs(snap);
    rows.push({ id, snap, det });
    body += `## ${names[id]}\n\n`;
    body += `${snap.budget.pieceCount} piezas · ${det.limbs.length} extremidades · ${det.decorative.length} decorativas\n\n`;
    if (det.limbs.length <= 12) {
      body += '| extremidad | extremo | libre | adentro | inclin. | calidad | etiqueta | masa | grupo |\n|---|---|---|---|---|---|---|---|---|\n';
      for (const l of det.limbs) body += `| ${l.id.split(':')[1].replace('palito-fx', '')} | ${l.end}${l.pairedWith ? ' (par)' : ''} | ${mm(l.freeLength)} | ${mm(l.embedded)} | ${l.tiltDeg.toFixed(0)}° | ${l.anchorQuality.toFixed(2)} | ${l.tag} | ${g(l.mass)} | ${l.pieceIds.length} |\n`;
      body += '\n';
    } else {
      const q = det.limbs.map((l) => l.anchorQuality);
      body += `Las ${det.limbs.length} extremidades tienen calidad de ancla entre ${Math.min(...q).toFixed(2)} y ${Math.max(...q).toFixed(2)}.\n\n`;
    }
    if (det.decorative.length) {
      body += 'Decorativas (suman masa, no son extremidades):\n\n';
      for (const d of det.decorative) body += `- \`${d.pieceId}\` — **${d.reason}** (${g(d.mass)} g)\n`;
      body += '\n';
    }
  }
  md += '| criatura | piezas | extremidades | decorativas |\n|---|---|---|---|\n';
  for (const r of rows) md += `| ${names[r.id]} | ${r.snap.budget.pieceCount} | ${r.det.limbs.length} | ${r.det.decorative.length} |\n`;
  md += '\n' + body;
  fs.mkdirSync('docs/creature', { recursive: true });
  fs.writeFileSync('docs/creature/informe-criaturas.md', md);
  console.log(md.split('\n').slice(0, 14).join('\n'));
} finally {
  await server.close();
}
