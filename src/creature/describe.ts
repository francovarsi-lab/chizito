import type { AttackAction, CreatureAnalysis, Limb, Role } from './types';

export const MODE_TEXT: Record<CreatureAnalysis['locomotion']['mode'], string> = {
  walk: 'camina',
  hop: 'salta',
  drag: 'se arrastra',
  roll: 'rueda',
  immobile: 'casi inmóvil',
};
export const ROLE_TEXT: Record<Role, string> = { support: 'apoya', push: 'empuja', strike: 'golpea', reach: 'alcanza', defend: 'defiende' };
export const KIND_TEXT: Record<AttackAction['kind'], string> = {
  jab: 'jab',
  estocada: 'estocada',
  'golpe-alto': 'golpe alto',
  barrida: 'barrida',
  mazazo: 'mazazo',
  rodada: 'rodada',
  embestida: 'embestida',
};
export const INPUT_TEXT: Record<AttackAction['input'], string> = {
  attack: 'ataque',
  'forward+attack': '→ + ataque',
  'up+attack': '↑ + ataque',
  'down+attack': '↓ + ataque',
  'hold+attack': 'ataque mantenido',
};
export const TAG_TEXT: Record<Limb['tag'], string> = { lanza: 'lanza', maza: 'maza', rama: 'rama', 'placa-con-vara': 'placa con vara' };

const cm = (m: number) => `${(m * 100).toFixed(1).replace('.', ',')} cm`;
const g = (kg: number) => `${(kg * 1000).toFixed(1).replace('.', ',')} g`;

/** Texto de una extremidad para el panel. */
export function describeLimb(l: Limb): string {
  const role = l.dominant ? ROLE_TEXT[l.dominant] : 'sin rol';
  const deep = l.profile.inDepth ? ' · en profundidad' : '';
  const hang = l.mobility.droops ? ' · cuelga' : '';
  return `${TAG_TEXT[l.tag]} de ${cm(l.length)} · ${role}${deep}${hang}`;
}

/** Líneas de texto para el panel "ESTRUCTURA DETECTADA" (sin HTML ni estilos). */
export function describeCreature(a: CreatureAnalysis): string[] {
  const lines: string[] = [];
  lines.push(`Masa ${g(a.mass.total)} · ${MODE_TEXT[a.locomotion.mode]} (${(a.locomotion.speed * 1000).toFixed(0)} mm/s)`);
  lines.push(`${a.limbs.length} ${a.limbs.length === 1 ? 'extremidad' : 'extremidades'} · ${a.decorative.length} ${a.decorative.length === 1 ? 'pieza decorativa' : 'piezas decorativas'}`);
  for (const l of a.limbs.slice(0, 12)) lines.push(`  ${describeLimb(l)}`);
  if (a.limbs.length > 12) lines.push(`  … y ${a.limbs.length - 12} más`);
  lines.push(`Apoyos: ${a.support.feet.length}`);
  lines.push(a.actions.length ? `Acciones: ${a.actions.map((x) => `${KIND_TEXT[x.kind]} (${INPUT_TEXT[x.input]})`).join(', ')}` : 'Acciones: ninguna');
  lines.push(a.defense.kind === 'guard' ? `Defensa: guardia (−${Math.round(a.defense.reduction * 100)} % de daño)` : `Defensa: se encoge (−${Math.round(a.defense.reduction * 100)} % de daño)`);
  for (const w of a.warnings) lines.push(`⚠ ${w}`);
  return lines;
}
