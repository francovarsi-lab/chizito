/**
 * Hoja de perfiles: para cada criatura, su silueta lateral (la proyección 2D de la tanda 2) con el frente
 * +Z (decisión actual del juego), +X y −X, lado a lado. Con frente ±X el combate se ve igual que la cámara
 * del constructor (que mira hacia −Z). Solo sirve para decidir el frente de combate mirando.
 */
import { CREATURE_CONFIG } from '../config';
import { makeBasis, depthOf } from '../math/basis';
import { foreshortening, projectShape } from '../math/shapes2d';
import { len, mid, sub } from '../math/vec';
import type { CreatureSnapshot, Shape2D, SnapPiece, V2, V3 } from '../types';
import type { BuiltCreature } from './build';

const SCALE = 2700; // px por metro
const CELL_W = 330;
const LABEL_W = 210;
const HEAD_H = 132;
const TOP_PAD = 44;
const FOOT_PAD = 52;
const COLORS: Record<string, { fill: string; line: string }> = {
  core: { fill: '#f6cb43', line: '#8a6a10' },
  blob: { fill: '#f6cb43', line: '#8a6a10' },
  rod: { fill: '#d4a15e', line: '#7a5424' },
  plate: { fill: '#ecdca0', line: '#9a8440' },
};

const DEFAULT_FRONT = CREATURE_CONFIG.orientation.defaultFront as V3;
const FRONTS: { label: string; sub: string; front: V3 }[] = [
  { label: 'frente a la derecha (−Y)', sub: 'por defecto: es lo que ves al construir', front: DEFAULT_FRONT },
  { label: 'giro de 180° (frente a la izquierda)', sub: 'visto del otro lado: se gira, no se espeja', front: [-DEFAULT_FRONT[0], -DEFAULT_FRONT[1], -DEFAULT_FRONT[2]] },
  { label: 'frente +Z', sub: 'descartado: hacia la cámara', front: [0, 0, 1] },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (x: number) => x.toFixed(1);

function bboxOf(shapes: Shape2D[]): { min: V2; max: V2 } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const take = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const s of shapes) {
    if (s.kind === 'capsule') for (const p of [s.a, s.b]) { take(p[0] - s.r, p[1] - s.r); take(p[0] + s.r, p[1] + s.r); }
    else for (const p of s.pts) take(p[0], p[1]);
  }
  return { min: [minX, minY], max: [maxX, maxY] };
}

function projected(snap: CreatureSnapshot, front: V3) {
  const basis = makeBasis(front, snap.orientation.up);
  const items = snap.pieces
    .map((p) => ({ p, shape2: p.cosmetic ? null : projectShape(p.shape, basis), depth: depthOf(basis, p.shape.kind === 'capsule' ? mid(p.shape.a, p.shape.b) : p.shape.kind === 'disc' ? p.shape.center : p.shape.points[0]) }))
    .filter((i) => i.shape2);
  return { basis, items, bb: bboxOf(items.map((i) => i.shape2!)) };
}

function cell(snap: CreatureSnapshot, front: V3, x0: number, y0: number, cellH: number, floorPx: number): string {
  const { basis, items, bb } = projected(snap, front);
  const cx = (bb.min[0] + bb.max[0]) / 2;
  const px = (x: number) => x0 + CELL_W / 2 + (x - cx) * SCALE;
  const py = (y: number) => floorPx - (y - bb.min[1]) * SCALE;
  let out = `<line x1="${x0 + 10}" y1="${f1(floorPx + 1)}" x2="${x0 + CELL_W - 10}" y2="${f1(floorPx + 1)}" stroke="#bbb" stroke-dasharray="4 4"/>`;
  // La profundidad sale hacia el espectador: se dibuja primero lo más lejano.
  for (const it of items.sort((a, b) => a.depth - b.depth)) {
    const col = COLORS[it.p.kind] ?? COLORS.blob;
    const s = it.shape2!;
    if (s.kind === 'capsule') {
      const w = Math.max(2 * s.r * SCALE, 1.2);
      const d = `M${f1(px(s.a[0]))} ${f1(py(s.a[1]))} L${f1(px(s.b[0]))} ${f1(py(s.b[1]))}`;
      out += `<path d="${d}" stroke="${col.line}" stroke-width="${f1(w + 2)}" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${col.fill}" stroke-width="${f1(w)}" stroke-linecap="round" fill="none"/>`;
    } else {
      const pts = s.pts.map((p) => `${f1(px(p[0]))},${f1(py(p[1]))}`).join(' ');
      out += `<polygon points="${pts}" fill="${col.fill}" stroke="${col.line}" stroke-width="1.2" fill-opacity="0.9"/>`;
    }
  }
  // Ketchup
  for (const p of snap.pieces) {
    if (p.shape.kind !== 'polyline') continue;
    const pts = p.shape.points.map((q) => { const v = [q[0] * basis.f[0] + q[1] * basis.f[1] + q[2] * basis.f[2], q[0] * basis.u[0] + q[1] * basis.u[1] + q[2] * basis.u[2]]; return `${f1(px(v[0]))},${f1(py(v[1]))}`; }).join(' ');
    out += `<polyline points="${pts}" fill="none" stroke="#c62828" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  // Datos al pie
  const rods = snap.pieces.filter((p: SnapPiece) => p.kind === 'rod');
  const deep = rods.filter((p) => foreshortening(p.shape, basis) < CREATURE_CONFIG.profile.foreshortenWarn).length;
  const core = snap.pieces[0];
  const cs = core.shape.kind === 'capsule' ? core.shape : null;
  let body = '';
  if (cs) {
    const f = foreshortening(cs, basis);
    body = f < 0.2 ? `cuerpo visto de punta (círculo Ø ${f1(cs.radius * 200)} cm)` : `cuerpo visto de costado (${f1(len(sub(cs.b, cs.a)) * 100)} × ${f1(cs.radius * 200)} cm)`;
  }
  out += `<text x="${x0 + 8}" y="${y0 + cellH - 22}" font-size="11" fill="#444">${esc(body)}</text>`;
  out += `<text x="${x0 + 8}" y="${y0 + cellH - 8}" font-size="11" fill="${deep > 0 ? '#b3261e' : '#2e7d32'}">palitos casi de frente a la cámara: ${deep} de ${rods.length}</text>`;
  out += `<text x="${x0 + CELL_W - 8}" y="${y0 + 16}" font-size="11" text-anchor="end" fill="#666">frente →</text>`;
  return out;
}

export function renderProfileSheet(creatures: BuiltCreature[]): string {
  const W = LABEL_W + FRONTS.length * CELL_W + 10;
  // Alto de cada fila: lo que mide la criatura más alta de sus tres vistas.
  const rows = creatures.map((c) => {
    const ext = Math.max(...FRONTS.map((f) => { const bb = projected(c.snapshot, f.front).bb; return (bb.max[1] - bb.min[1]) * SCALE; }));
    const h = Math.ceil(TOP_PAD + ext + FOOT_PAD);
    return { c, h, floor: TOP_PAD + ext };
  });
  const H = HEAD_H + rows.reduce((a, r) => a + r.h, 0) + 10;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`;
  svg += `<rect width="${W}" height="${H}" fill="#fffdf7"/>`;
  svg += `<text x="12" y="26" font-size="19" font-weight="700" fill="#222">Perfiles de combate: arriba = arriba del constructor, frente a la derecha o a la izquierda</text>`;
  svg += `<text x="12" y="46" font-size="12" fill="#555">Cada criatura vista de costado (proyección 2D de perfil, la misma que usarán las cajas de golpe). Mismo tamaño en todas las celdas (1 cm ≈ ${f1(SCALE / 100)} px).</text>`;
  svg += `<text x="12" y="62" font-size="12" fill="#555">Con el frente a la derecha (−Y) el perfil de combate es la imagen del constructor; el cambio de lado es un giro de 180° (x → −x). Con frente +Z los costados quedan en profundidad.</text>`;
  svg += `<text x="12" y="78" font-size="12" fill="#555">Chizito parado (arriba = +X): brazos en los costados, piernas abajo. En rojo: palitos que casi apuntan a la cámara (se ven cortos en reposo).</text>`;
  FRONTS.forEach((f, i) => {
    const x = LABEL_W + i * CELL_W;
    svg += `<text x="${x + CELL_W / 2}" y="${HEAD_H - 26}" font-size="14" font-weight="700" text-anchor="middle" fill="#222">${f.label}</text>`;
    svg += `<text x="${x + CELL_W / 2}" y="${HEAD_H - 10}" font-size="11" text-anchor="middle" fill="#777">${f.sub}</text>`;
  });
  let y = HEAD_H;
  rows.forEach(({ c, h, floor }, r) => {
    svg += `<rect x="4" y="${y}" width="${W - 8}" height="${h - 4}" fill="${r % 2 ? '#fbf7ec' : '#fffdf7'}" stroke="#eee"/>`;
    svg += `<text x="12" y="${y + 24}" font-size="13" font-weight="700" fill="#222">${esc(c.name.split(' · ')[0].split(' (')[0])}</text>`;
    const rest = c.name.includes(' · ') ? c.name.split(' · ')[1] : c.name.includes('(') ? c.name.slice(c.name.indexOf('(')) : '';
    let line = '';
    let ly = y + 42;
    for (const w of rest.split(' ')) {
      if ((line + ' ' + w).length > 26) { svg += `<text x="12" y="${ly}" font-size="11" fill="#555">${esc(line.trim())}</text>`; line = w; ly += 14; } else line += ' ' + w;
    }
    svg += `<text x="12" y="${ly}" font-size="11" fill="#555">${esc(line.trim())}</text>`;
    svg += `<text x="12" y="${ly + 18}" font-size="11" fill="#888">${c.snapshot.budget.pieceCount} piezas</text>`;
    FRONTS.forEach((f, i) => {
      svg += cell(c.snapshot, f.front, LABEL_W + i * CELL_W, y, h, y + floor);
    });
    y += h;
  });
  return svg + '</svg>\n';
}
