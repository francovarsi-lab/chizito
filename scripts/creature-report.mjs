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
  md += 'Generado por `node scripts/creature-report.mjs` (tanda 6: incluye acciones y defensa). Cajas de golpe: `docs/creature/hitboxes.svg`. Frente de combate +X, arriba +Y. Medidas en mm y gramos de juego (valores a calibrar, ver `src/creature/config.ts`).\n\n';
  const rows = [];
  let body = '';
  const f2 = (x) => Number(x).toFixed(2);
  for (const id of ids) {
    const snap = JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8'));
    const an = idx.interpret(snap);
    rows.push({ id, snap, an });
    const deep = an.limbs.filter((l) => l.profile.inDepth).length;
    body += `## ${names[id]}\n\n`;
    body += `${snap.budget.pieceCount} piezas · ${an.limbs.length} extremidades · ${an.decorative.length} decorativas · masa ${g(an.mass.total)} g · **${an.locomotion.mode}**\n\n`;
    if (an.limbs.length <= 12) {
      body += '| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
      for (const l of an.limbs) body += `| ${l.id.split(':')[1].replace('palito-fx', '')}${l.pairedWith ? ` (${l.end}, par)` : ''} | ${mm(l.reach)} | ${f2(l.anchorQuality)} | ${l.dominant ?? '—'} | ${f2(l.caps.strike)} | ${f2(l.caps.support)} | ${f2(l.caps.defend)} | ${l.profile.inDepth ? 'sí' : 'no'} | ${l.mobility.minDeg.toFixed(0)} a ${l.mobility.maxDeg.toFixed(0)} | ${l.mobility.droops ? 'sí' : 'no'} | ${l.tag} |\n`;
      body += '\n';
    } else {
      const sMax = Math.max(...an.limbs.map((l) => l.caps.strike));
      const swing = an.limbs.reduce((a, l) => a + (l.mobility.maxDeg - l.mobility.minDeg), 0) / an.limbs.length;
      body += `Las ${an.limbs.length} extremidades: golpe máximo ${f2(sMax)} (mínimo para contar: ${idx.CREATURE_CONFIG.capabilities.minRole}), giro medio ${swing.toFixed(0)}°, ${deep} en profundidad.\n\n`;
    }
    body += `Locomoción: velocidad ${(an.locomotion.speed * 1000).toFixed(1)} mm/s · giro ${an.locomotion.turn} · freno ${an.locomotion.brake} · salto ${(an.locomotion.jump * 1000).toFixed(1)} mm · apoyos ${an.support.feet.length} · margen ${mm(an.support.margin)} mm · carga/capacidad ${f2(an.support.loadRatio)}\n\n`;
    body += 'Acciones (una por entrada):\n\n| acción | entrada | arranque | activa | recuperación | daño | alcance (mm) | radio (mm) |\n|---|---|---|---|---|---|---|---|\n';
    for (const x of an.actions) body += `| ${x.kind} | ${x.input} | ${x.startup} | ${x.active} | ${x.recovery} | ${x.damage.toFixed(1)} | ${mm(x.reach)} | ${mm(x.hitRadius)} |\n`;
    body += `\nDefensa: **${an.defense.kind === 'guard' ? 'guardia' : 'se encoge'}** (−${Math.round(an.defense.reduction * 100)} % de daño)\n\n`;
    if (an.decorative.length) {
      body += 'Decorativas (suman masa, no son extremidades):\n\n';
      for (const d of an.decorative) body += `- \`${d.pieceId}\` — **${d.reason}** (${g(d.mass)} g)\n`;
      body += '\n';
    }
    if (an.warnings.length) {
      body += 'Avisos del panel:\n\n';
      for (const w of an.warnings) body += `- ${w}\n`;
      body += '\n';
    }
  }
  md += '| criatura | piezas | extremidades | decorativas | masa (g) | modo | vel. (mm/s) | freno | apoyos | en profundidad |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) md += `| ${names[r.id]} | ${r.snap.budget.pieceCount} | ${r.an.limbs.length} | ${r.an.decorative.length} | ${g(r.an.mass.total)} | ${r.an.locomotion.mode} | ${(r.an.locomotion.speed * 1000).toFixed(1)} | ${r.an.locomotion.brake} | ${r.an.support.feet.length} | ${r.an.limbs.filter((l) => l.profile.inDepth).length} |\n`;
  const by = Object.fromEntries(rows.map((r) => [r.id, r.an]));
  const minRole = idx.CREATURE_CONFIG.capabilities.minRole;
  const check = (ok) => (ok ? '✅' : '❌');
  md += '\n**Criterios de aceptación**\n\n';
  md += `- ${check(by.A.locomotion.mode === 'walk')} A camina\n`;
  md += `- ${check(by.B.locomotion.mode === 'drag')} B se arrastra\n`;
  md += `- ${check(by.C.locomotion.mode === 'drag' && by.C.limbs[0].profile.inDepth)} C se arrastra y su brazo sale marcado "en profundidad"\n`;
  md += `- ${check(by.D.locomotion.mode === 'roll' && by.D.limbs.every((l) => l.caps.strike < minRole) && by.D.locomotion.brake <= 0.2)} D rueda, casi no golpea y casi no frena\n`;
  md += `- ${check(by.D.actions.length === 1 && by.D.actions[0].kind === 'rodada')} D: su única acción es la rodada\n`;
  md += `- ${check(by.E.limbs.length === 3 && by.E.warnings.some((w) => w.includes('MVP 0')))} E: 3 extremidades y el aviso de segundo nivel\n`;
  md += `- ${check(by.veg.locomotion.mode === 'walk')} el vegetal camina\n`;
  md += '\n' + body;
  fs.mkdirSync('docs/creature', { recursive: true });
  fs.writeFileSync('docs/creature/informe-criaturas.md', md);
  console.log(md.split('\n').slice(0, 14).join('\n'));
} finally {
  await server.close();
}
