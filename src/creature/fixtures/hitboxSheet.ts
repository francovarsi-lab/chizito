/**
 * Hoja de cajas de golpe: el perfil 2D de cada criatura tal como lo va a usar el combate (cajas de daño por
 * extremidad con su pivote y el barrido de su mejor golpe), con frente +X y con el giro de 180° (−X).
 */
import { interpret } from '../interpret';
import { attackHitbox, hitboxPath } from '../project';
import type { CreatureAnalysis, HurtGroup, Limb, Shape2D, V2 } from '../types';
import type { BuiltCreature } from './build';
import { describeCreature } from '../describe';

const S = 2700;
const CELL_W = 360;
const LABEL_W = 300;
const HEAD_H = 112;
const PAD_TOP = 40;
const PAD_BOT = 40;
const ROLE_COLOR: Record<string, string> = { strike: '#e57373', support: '#81c784', push: '#a5d6a7', defend: '#64b5f6', reach: '#bdbdbd', none: '#e0e0e0' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (x: number) => x.toFixed(1);

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

function shapeBounds(shapes: Shape2D[]): { min: V2; max: V2 } {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const s of shapes) {
    const pts: [V2, number][] = s.kind === 'capsule' ? [[s.a, s.r], [s.b, s.r]] : s.pts.map((p) => [p, 0] as [V2, number]);
    for (const [p, r] of pts) { a = Math.min(a, p[0] - r); b = Math.min(b, p[1] - r); c = Math.max(c, p[0] + r); d = Math.max(d, p[1] + r); }
  }
  return { min: [a, b], max: [c, d] };
}

function extentOf(a: CreatureAnalysis): { min: V2; max: V2 } {
  const shapes: Shape2D[] = a.profile2D.groups.flatMap((g) => g.shapes);
  for (const act of a.actions) {
    if (!act.limbId) continue;
    for (const h of hitboxPath(a.profile2D, a.limbs, act, 6)) shapes.push({ kind: 'capsule', a: h.center, b: h.center, r: h.r });
  }
  return shapeBounds(shapes);
}

function drawShape(s: Shape2D, px: (x: number) => number, py: (y: number) => number, fill: string, dashed: boolean): string {
  const dash = dashed ? ' stroke-dasharray="3 2"' : '';
  if (s.kind === 'capsule') {
    const w = Math.max(2 * s.r * S, 1.2);
    const d = `M${f1(px(s.a[0]))} ${f1(py(s.a[1]))} L${f1(px(s.b[0]))} ${f1(py(s.b[1]))}`;
    return `<path d="${d}" stroke="#555" stroke-width="${f1(w + 1.6)}" stroke-linecap="round" fill="none"${dash}/><path d="${d}" stroke="${fill}" stroke-width="${f1(w)}" stroke-linecap="round" fill="none"/>`;
  }
  return `<polygon points="${s.pts.map((p) => `${f1(px(p[0]))},${f1(py(p[1]))}`).join(' ')}" fill="${fill}" fill-opacity="0.85" stroke="#555" stroke-width="1"${dash}/>`;
}

function drawCreature(a: CreatureAnalysis, x0: number, floor: number): string {
  const ext = extentOf(a);
  const cx = x0 + CELL_W / 2 - ((ext.min[0] + ext.max[0]) / 2) * S;
  const px = (x: number) => cx + x * S;
  const py = (y: number) => floor - y * S;
  let out = `<line x1="${x0 + 8}" y1="${f1(floor)}" x2="${x0 + CELL_W - 8}" y2="${f1(floor)}" stroke="#bbb" stroke-dasharray="4 4"/>`;
  const limbOf = new Map<string, Limb>(a.limbs.map((l) => [l.id, l]));
  // Barrido del mejor golpe de cada extremidad: círculos por el arco, con el largo real de la extremidad.
  for (const act of a.actions) {
    if (!act.limbId) continue;
    const pts = hitboxPath(a.profile2D, a.limbs, act, 7);
    pts.forEach((h, i) => {
      out += `<circle cx="${f1(px(h.center[0]))}" cy="${f1(py(h.center[1]))}" r="${f1(h.r * S)}" fill="#e53935" fill-opacity="${i === pts.length - 1 ? 0.35 : 0.12}" stroke="#e53935" stroke-opacity="0.5" stroke-width="0.8"/>`;
    });
  }
  // Rodada / embestida: círculo alrededor del cuerpo.
  for (const act of a.actions) {
    if (act.limbId) continue;
    const c = attackHitbox(a.profile2D, a.limbs, act, 0);
    const core = a.profile2D.groups[0].shapes[0];
    const center: V2 = core && core.kind === 'capsule' ? [(core.a[0] + core.b[0]) / 2, (core.a[1] + core.b[1]) / 2] : c.center;
    out += `<circle cx="${f1(px(center[0]))}" cy="${f1(py(center[1]))}" r="${f1(act.hitRadius * S)}" fill="none" stroke="#e53935" stroke-dasharray="5 3" stroke-opacity="${act.kind === 'rodada' ? 0.8 : 0.35}"/>`;
  }
  // Cajas de daño: cuerpo en amarillo, extremidades por su rol; punteado = en profundidad.
  for (const g of a.profile2D.groups as HurtGroup[]) {
    const limb = limbOf.get(g.owner);
    const fill = g.owner === 'core' ? '#f6cb43' : ROLE_COLOR[limb?.dominant ?? 'none'];
    for (const s of g.shapes) out += drawShape(s, px, py, fill, !!limb?.profile.inDepth);
  }
  for (const g of a.profile2D.groups) if (g.pivot) out += `<circle cx="${f1(px(g.pivot[0]))}" cy="${f1(py(g.pivot[1]))}" r="2.2" fill="#222"/>`;
  out += `<text x="${x0 + CELL_W - 8}" y="${f1(floor + 14)}" font-size="10" text-anchor="end" fill="#666">frente ${a.profile2D.facing === 1 ? '→' : '←'}</text>`;
  return out;
}

export function renderHitboxSheet(creatures: BuiltCreature[]): string {
  const W = LABEL_W + 2 * CELL_W + 10;
  const rows = creatures.map((c) => {
    const plus = interpret(c.snapshot, { facing: 1 });
    const minus = interpret(c.snapshot, { facing: -1 });
    const ext = [extentOf(plus), extentOf(minus)];
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
    'Puntos negros: pivotes. Línea punteada: piso. Izquierda: frente +X. Derecha: el giro de 180° (frente −X); los datos no se espejan.',
  ];
  head.forEach((t, i) => { svg += `<text x="12" y="${46 + i * 16}" font-size="12" fill="#555">${esc(t)}</text>`; });
  svg += `<text x="${LABEL_W + CELL_W / 2}" y="${HEAD_H - 10}" font-size="14" font-weight="700" text-anchor="middle" fill="#222">frente +X</text>`;
  svg += `<text x="${LABEL_W + CELL_W * 1.5}" y="${HEAD_H - 10}" font-size="14" font-weight="700" text-anchor="middle" fill="#222">frente −X (giro de 180°)</text>`;
  let y = HEAD_H;
  rows.forEach(({ c, plus, minus, h, floor }, r) => {
    svg += `<rect x="4" y="${y}" width="${W - 8}" height="${h - 4}" fill="${r % 2 ? '#fbf7ec' : '#fffdf7'}" stroke="#eee"/>`;
    svg += `<text x="12" y="${y + 22}" font-size="13" font-weight="700" fill="#222">${esc(c.name.split(' · ')[0].split(' (')[0])}</text>`;
    const lines = describeCreature(plus).filter((l) => !l.startsWith('⚠') && !l.startsWith('  ')).flatMap((l) => wrap(l, 50));
    lines.forEach((l, i) => { svg += `<text x="12" y="${y + 40 + i * 14}" font-size="10.5" fill="#555">${esc(l)}</text>`; });
    svg += drawCreature(plus, LABEL_W, y + floor) + drawCreature(minus, LABEL_W + CELL_W, y + floor);
    y += h;
  });
  return svg + '</svg>\n';
}
