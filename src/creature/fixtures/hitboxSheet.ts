/**
 * Hoja de cajas de golpe: el perfil 2D de cada criatura tal como lo va a usar el combate (cajas de daño por
 * extremidad con su pivote y el barrido de su mejor golpe), con frente +X y con el giro de 180° (−X).
 */
import { describeCreature } from '../describe';
import { interpret } from '../interpret';
import { drawProfile, profileExtent } from '../ui/profileSvg';
import type { BuiltCreature } from './build';

const S = 2700;
const CELL_W = 360;
const LABEL_W = 300;
const HEAD_H = 112;
const PAD_TOP = 40;
const PAD_BOT = 40;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > max) {
      out.push(line.trim());
      line = '  ' + w;
    } else line += ' ' + w;
  }
  out.push(line.trim());
  return out;
}

export function renderHitboxSheet(creatures: BuiltCreature[]): string {
  const W = LABEL_W + 2 * CELL_W + 10;
  const rows = creatures.map((c) => {
    const plus = interpret(c.snapshot, { facing: 1 });
    const minus = interpret(c.snapshot, { facing: -1 });
    const ext = [profileExtent(plus), profileExtent(minus)];
    const top = Math.max(...ext.map((e) => e.max[1]));
    const bottom = Math.min(...ext.map((e) => e.min[1]), 0);
    const h = Math.max(170, Math.ceil(PAD_TOP + (top - bottom) * S + PAD_BOT));
    return { c, plus, minus, h, floor: PAD_TOP + top * S };
  });
  const H = HEAD_H + rows.reduce((a, r) => a + r.h, 0) + 10;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif"><rect width="${W}" height="${H}" fill="#fffdf7"/>`;
  svg += `<text x="12" y="26" font-size="19" font-weight="700" fill="#222">Cajas de golpe (perfil 2D) por criatura</text>`;
  const head = [
    'Cajas de daño por extremidad, coloreadas por su rol: rojo golpea · verde apoya · azul defiende · gris alcanza.',
    'Punteado: extremidad en profundidad (se ve corta en reposo). Círculos rojos: barrido del mejor golpe, con el LARGO REAL de la extremidad.',
    'Puntos negros: pivotes. Línea punteada: piso. Izquierda: frente a la derecha (por defecto). Derecha: el giro de 180° (frente a la izquierda); los datos no se espejan.',
  ];
  head.forEach((t, i) => { svg += `<text x="12" y="${46 + i * 16}" font-size="12" fill="#555">${esc(t)}</text>`; });
  svg += `<text x="${LABEL_W + CELL_W / 2}" y="${HEAD_H - 10}" font-size="14" font-weight="700" text-anchor="middle" fill="#222">frente a la derecha (−Y)</text>`;
  svg += `<text x="${LABEL_W + CELL_W * 1.5}" y="${HEAD_H - 10}" font-size="14" font-weight="700" text-anchor="middle" fill="#222">giro de 180° (frente a la izquierda)</text>`;
  let y = HEAD_H;
  rows.forEach(({ c, plus, minus, h, floor }, r) => {
    svg += `<rect x="4" y="${y}" width="${W - 8}" height="${h - 4}" fill="${r % 2 ? '#fbf7ec' : '#fffdf7'}" stroke="#eee"/>`;
    svg += `<text x="12" y="${y + 22}" font-size="13" font-weight="700" fill="#222">${esc(c.name.split(' · ')[0].split(' (')[0])}</text>`;
    const lines = describeCreature(plus).filter((l) => !l.startsWith('⚠') && !l.startsWith('  ')).flatMap((l) => wrap(l, 50));
    lines.forEach((l, i) => { svg += `<text x="12" y="${y + 40 + i * 14}" font-size="10.5" fill="#555">${esc(l)}</text>`; });
    for (const [a, x0] of [[plus, LABEL_W], [minus, LABEL_W + CELL_W]] as const) {
      const e = profileExtent(a);
      svg += drawProfile(a, { cx: x0 + CELL_W / 2 - ((e.min[0] + e.max[0]) / 2) * S, floor: y + floor, scale: S, floorHalf: CELL_W / 2 - 8 });
    }
    y += h;
  });
  return svg + '</svg>\n';
}
