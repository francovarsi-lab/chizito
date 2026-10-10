import { hitboxPath } from '../project';
import type { CreatureAnalysis, HurtGroup, Limb, Shape2D, V2 } from '../types';
import { CORE_COLOR, ROLE_COLOR } from './colors';

/** Dibujo del perfil 2D de una criatura con sus cajas de golpe (SVG como texto: sirve para el panel, las capturas y las hojas). */
export const PROFILE_SCALE = 2700; // px por metro

const f1 = (x: number) => x.toFixed(1);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export interface Extent {
  min: V2;
  max: V2;
}

function boundsOf(shapes: Shape2D[]): Extent {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const s of shapes) {
    const pts: [V2, number][] = s.kind === 'capsule' ? [[s.a, s.r], [s.b, s.r]] : s.pts.map((p) => [p, 0] as [V2, number]);
    for (const [p, r] of pts) {
      a = Math.min(a, p[0] - r);
      b = Math.min(b, p[1] - r);
      c = Math.max(c, p[0] + r);
      d = Math.max(d, p[1] + r);
    }
  }
  return { min: [a, b], max: [c, d] };
}

/** Extensión del dibujo en metros: las cajas de daño y el barrido de los golpes. */
export function profileExtent(a: CreatureAnalysis): Extent {
  const shapes: Shape2D[] = a.profile2D.groups.flatMap((g) => g.shapes);
  for (const act of a.actions) {
    if (!act.limbId) continue;
    for (const h of hitboxPath(a.profile2D, a.limbs, act, 6)) shapes.push({ kind: 'capsule', a: h.center, b: h.center, r: h.r });
  }
  return boundsOf(shapes);
}

function drawShape(s: Shape2D, px: (x: number) => number, py: (y: number) => number, scale: number, fill: string, dashed: boolean, extra = ''): string {
  const dash = dashed ? ' stroke-dasharray="3 2"' : '';
  if (s.kind === 'capsule') {
    const w = Math.max(2 * s.r * scale, 1.2);
    const d = `M${f1(px(s.a[0]))} ${f1(py(s.a[1]))} L${f1(px(s.b[0]))} ${f1(py(s.b[1]))}`;
    return `<path d="${d}" stroke="#555" stroke-width="${f1(w + 1.6)}" stroke-linecap="round" fill="none"${dash}${extra}/><path d="${d}" stroke="${fill}" stroke-width="${f1(w)}" stroke-linecap="round" fill="none"${extra}/>`;
  }
  return `<polygon points="${s.pts.map((p) => `${f1(px(p[0]))},${f1(py(p[1]))}`).join(' ')}" fill="${fill}" fill-opacity="0.85" stroke="#555" stroke-width="1"${dash}${extra}/>`;
}

export interface DrawOptions {
  /** Centro horizontal y piso (y de pantalla) del dibujo. */
  cx: number;
  floor: number;
  scale?: number;
  /** Extremidad resaltada (pasar el mouse por su fila). */
  highlightLimbId?: string | null;
  showFrontLabel?: boolean;
  /** Mitad del largo de la línea del piso (px). */
  floorHalf?: number;
}

/** Fragmento SVG de una criatura: piso, barrido de los golpes, cajas de daño por rol, pivotes y cartel de frente. */
export function drawProfile(a: CreatureAnalysis, o: DrawOptions): string {
  const S = o.scale ?? PROFILE_SCALE;
  const px = (x: number) => o.cx + x * S;
  const py = (y: number) => o.floor - y * S;
  const ext = profileExtent(a);
  const facing = a.profile2D.facing;
  const half = o.floorHalf ?? 170;
  let out = `<line x1="${f1(o.cx - half)}" y1="${f1(o.floor)}" x2="${f1(o.cx + half)}" y2="${f1(o.floor)}" stroke="#bbb" stroke-dasharray="4 4"/>`;
  const limbOf = new Map<string, Limb>(a.limbs.map((l) => [l.id, l]));
  // Barrido de cada golpe de extremidad: círculos por el arco, con el LARGO REAL de la extremidad.
  for (const act of a.actions) {
    if (!act.limbId) continue;
    const pts = hitboxPath(a.profile2D, a.limbs, act, 7);
    const on = o.highlightLimbId === act.limbId;
    pts.forEach((h, i) => {
      const last = i === pts.length - 1;
      out += `<circle cx="${f1(px(h.center[0]))}" cy="${f1(py(h.center[1]))}" r="${f1(h.r * S)}" fill="#e53935" fill-opacity="${last ? (on ? 0.55 : 0.35) : on ? 0.2 : 0.12}" stroke="#e53935" stroke-opacity="0.5" stroke-width="0.8"/>`;
    });
  }
  // Rodada / embestida: círculo alrededor del cuerpo.
  for (const act of a.actions) {
    if (act.limbId) continue;
    const core = a.profile2D.groups[0].shapes[0];
    const c: V2 = core && core.kind === 'capsule' ? [(core.a[0] + core.b[0]) / 2, (core.a[1] + core.b[1]) / 2] : [0, ext.max[1] / 2];
    out += `<circle cx="${f1(px(c[0]))}" cy="${f1(py(c[1]))}" r="${f1(act.hitRadius * S)}" fill="none" stroke="#e53935" stroke-dasharray="5 3" stroke-opacity="${act.kind === 'rodada' ? 0.8 : 0.35}"/>`;
  }
  // Cajas de daño: cuerpo amarillo, extremidades por su rol; punteado = en profundidad.
  for (const g of a.profile2D.groups as HurtGroup[]) {
    const limb = limbOf.get(g.owner);
    const fill = g.owner === 'core' ? CORE_COLOR : ROLE_COLOR[limb?.dominant ?? 'none'];
    const dim = o.highlightLimbId && g.owner !== 'core' && g.owner !== o.highlightLimbId ? ' opacity="0.35"' : '';
    out += `<g data-limb="${esc(g.owner)}"${dim}>`;
    for (const s of g.shapes) out += drawShape(s, px, py, S, fill, !!limb?.profile.inDepth);
    out += '</g>';
  }
  for (const g of a.profile2D.groups) if (g.pivot) out += `<circle cx="${f1(px(g.pivot[0]))}" cy="${f1(py(g.pivot[1]))}" r="2.2" fill="#222"/>`;
  if (o.showFrontLabel !== false) {
    // Cartel de frente: una flecha sobre la criatura hacia el lado al que mira.
    const x0 = px(ext.min[0]);
    const x1 = px(ext.max[0]);
    const y = py(ext.max[1]) - 16;
    const tipX = facing === 1 ? x1 : x0;
    const tailX = facing === 1 ? x0 : x1;
    const mid = (x0 + x1) / 2;
    const head = facing === 1 ? -7 : 7;
    out += `<g class="cs-front" data-facing="${facing}"><line x1="${f1(tailX)}" y1="${f1(y)}" x2="${f1(tipX)}" y2="${f1(y)}" stroke="#1565c0" stroke-width="2.4" stroke-linecap="round"/><path d="M${f1(tipX)} ${f1(y)} l${head} -5 l0 10 z" fill="#1565c0"/><text x="${f1(mid)}" y="${f1(y - 6)}" font-size="11" font-weight="700" text-anchor="middle" fill="#1565c0">FRENTE ${facing === 1 ? '→' : '←'}</text></g>`;
  }
  return out;
}

export interface ProfileSvgOptions {
  scale?: number;
  highlightLimbId?: string | null;
  width?: number;
}

/** SVG completo del perfil (se ajusta solo al tamaño de la criatura), listo para meter en el panel o guardar. */
export function renderProfileSvg(a: CreatureAnalysis, opts: ProfileSvgOptions = {}): string {
  const S = opts.scale ?? PROFILE_SCALE;
  const ext = profileExtent(a);
  const pad = 22;
  const labelH = 38; // lugar para el cartel de frente
  const w = Math.max((ext.max[0] - ext.min[0]) * S + pad * 2, 260);
  const floor = labelH + ext.max[1] * S;
  const h = labelH + (ext.max[1] - ext.min[1]) * S + pad;
  const cx = w / 2 - ((ext.min[0] + ext.max[0]) / 2) * S;
  const body = drawProfile(a, { cx, floor, scale: S, highlightLimbId: opts.highlightLimbId, floorHalf: w / 2 - 6 });
  return `<svg xmlns="http://www.w3.org/2000/svg" class="cs-profile" viewBox="0 0 ${f1(w)} ${f1(h)}" ${opts.width ? `width="${opts.width}"` : ''} data-facing="${a.profile2D.facing}" font-family="system-ui, sans-serif">${body}</svg>`;
}
