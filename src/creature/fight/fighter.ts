import { makeBasis, type Basis } from '../math/basis';
import { cross, dist, dot, len, mid, norm, sub } from '../math/vec';
import type { CreatureSnapshot, SnapLink, SnapPiece, V3 } from '../types';
import { FIGHT } from './tuning';

/**
 * Modelo de luchador (JSON puro, sin three.js): lo que la pelea necesita saber de una criatura.
 *
 * Regla del usuario: una vez que un palito (o escarbadientes, palito de la selva, chupetín) entró en el chizito, pasa a ser
 * un BRAZO o una PIERNA rígida con la articulación en su punto de clavado, esté donde esté. No se usa la física del análisis
 * (calidad de ancla, rangos de giro, arco de 140°): el peso de cada pieza sale de una tabla y la inercia, el contrapeso y el
 * daño salen de cómo está repartido ese peso a lo largo de la extremidad.
 *
 * Marco LOCAL del luchador (metros): x = frente de combate, y = arriba, z = profundidad (hacia la cámara si mira a +X).
 * Origen = centro del chizito raíz.
 */
export type HitKind = 'light' | 'cut' | 'heavy' | 'shield';

export interface MassPoint {
  /** Posición en el marco local (en reposo). */
  p: V3;
  m: number;
  /** Radio para el contacto. */
  r: number;
  piece: string;
  kind: HitKind;
  /** Queda dentro del chizito (pesa, pero no toca nada). */
  inside: boolean;
}

export interface LimbModel {
  /** Id de la pieza raíz de la extremidad (la que está clavada). */
  id: string;
  /** La pieza y todo lo que cuelga de ella. */
  pieceIds: string[];
  role: 'arm' | 'leg';
  /**
   * Sin articulación: el chupetín (rígido) y toda vara que ATRAVIESA el chizito (girarla rompería el chizito). Pesa, toca y apoya,
   * pero no pega ni camina.
   */
  rigid: boolean;
  /** kg que puede cargar si es pierna (articulada). */
  carry: number;
  /** Articulación = punto de clavado, sobre el perímetro del chizito (marco local). */
  pivot: V3;
  /** Dirección de reposo, del pivote al punto más lejano. */
  dir: V3;
  reach: number;
  mass: number;
  points: MassPoint[];
  through: boolean;
  /** Tipo de golpe dominante (la pieza más pesada que pega manda: aceituna/chupetín = pesado, escarbadientes = corte). */
  kind: HitKind;
  /** Para el render (marco raíz de la criatura): recorte de la parte embebida al girar. null = no se recorta. */
  clip: { point: V3; normal: V3 } | null;
  label: string;
}

export interface BodyShape {
  a: V3;
  b: V3;
  r: number;
}

export interface FighterModel {
  name: string;
  /** Marco raíz → local (filas f, u, s). */
  basis: Basis;
  /** Punto del marco raíz que es el origen local. */
  origin: V3;
  body: BodyShape[];
  bodyMass: number;
  /** Piezas fijas al cuerpo (papitas o nachos clavados directo en el chizito): escudos que no se mueven. */
  armor: MassPoint[];
  limbs: LimbModel[];
  /** kg. */
  mass: number;
  /** Escudos: golpes que aguanta cada pieza escudo. */
  shields: Record<string, number>;
}

const ROD_TYPES = new Set(['palito', 'escarbadientes', 'palito-selva', 'chupetin']);
const SHIELD_TYPES = new Set(['papita', 'nacho']);

/** Gramos → kg según la tabla de la realidad (chat de mecánicas). */
export function pieceMass(p: SnapPiece): number {
  const key = p.variant ? `${p.type}:${p.variant}` : p.type;
  return (FIGHT.massGrams[key as keyof typeof FIGHT.massGrams] ?? FIGHT.massGrams[p.type as keyof typeof FIGHT.massGrams] ?? FIGHT.massGrams.default) / 1000;
}

export function pieceKind(p: SnapPiece): HitKind {
  if (SHIELD_TYPES.has(p.type)) return 'shield';
  if (p.type === 'escarbadientes') return 'cut';
  if (p.type === 'aceituna' || p.type === 'chupetin-caramelo') return 'heavy';
  return 'light';
}

const STEP = 0.005;
const addS = (a: V3, d: V3, k: number): V3 => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];

/** Reparte la masa de una pieza en puntos a lo largo de su forma (en el marco que devuelve `L`). */
function sample(p: SnapPiece, L: (v: V3) => V3, coreInside: (v: V3) => boolean): MassPoint[] {
  const m = pieceMass(p);
  const kind = pieceKind(p);
  const sh = p.shape;
  const raw: { v: V3; r: number }[] = [];
  if (sh.kind === 'capsule') {
    const n = Math.max(2, Math.ceil(dist(sh.a, sh.b) / STEP) + 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      raw.push({ v: [sh.a[0] + (sh.b[0] - sh.a[0]) * t, sh.a[1] + (sh.b[1] - sh.a[1]) * t, sh.a[2] + (sh.b[2] - sh.a[2]) * t], r: Math.max(sh.radius, 0.0016) });
    }
  } else if (sh.kind === 'disc') {
    raw.push({ v: sh.center, r: sh.radius * 0.45 });
    const n = norm(sh.normal);
    const e1 = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
    const e2 = cross(n, e1);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const c = Math.cos(a) * sh.radius * 0.72;
      const s = Math.sin(a) * sh.radius * 0.72;
      raw.push({ v: [sh.center[0] + e1[0] * c + e2[0] * s, sh.center[1] + e1[1] * c + e2[1] * s, sh.center[2] + e1[2] * c + e2[2] * s], r: sh.radius * 0.3 });
    }
  } else return [];
  return raw.map((q) => ({ p: L(q.v), m: m / raw.length, r: q.r, piece: p.id, kind, inside: coreInside(q.v) }));
}

/** Distancia de un punto al segmento ab. */
function segDist(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
}

/** Luchador a partir de la criatura armada (el snapshot que ya produce el resolver del constructor). */
export function fighterFromSnapshot(s: CreatureSnapshot, name = 'TU CRIATURA'): FighterModel {
  const basis = makeBasis(s.orientation.front, s.orientation.up);
  const core = s.pieces.find((p) => p.id === s.coreId);
  if (!core || core.shape.kind !== 'capsule') throw new Error('la criatura no tiene chizito raíz');
  // En el snapshot `a` y `b` son las PUNTAS reales del chizito: el segmento de la cápsula va un radio adentro de cada una.
  const half0 = dist(core.shape.a, core.shape.b) / 2;
  const ax = norm(sub(core.shape.b, core.shape.a));
  const r0 = Math.min(core.shape.radius, half0 * 0.95);
  const cs = { a: addS(core.shape.a, ax, r0), b: addS(core.shape.b, ax, -r0), radius: r0 };
  const origin = mid(cs.a, cs.b);
  const L = (v: V3): V3 => {
    const d = sub(v, origin);
    return [dot(d, basis.f), dot(d, basis.u), dot(d, basis.s)];
  };
  const inside = (v: V3): boolean => segDist(v, cs.a, cs.b) < cs.radius * 0.98;
  const byId = new Map(s.pieces.map((p) => [p.id, p]));
  const kids = new Map<string, SnapLink[]>();
  for (const l of s.links) {
    const arr = kids.get(l.parentId) ?? [];
    arr.push(l);
    kids.set(l.parentId, arr);
  }
  const subtree = (id: string): string[] => [id, ...(kids.get(id) ?? []).flatMap((l) => subtree(l.childId))];
  const half = half0;

  const limbs: LimbModel[] = [];
  const armor: MassPoint[] = [];
  const shields: Record<string, number> = {};
  const walk = (parentId: string): void => {
    for (const link of kids.get(parentId) ?? []) {
      const piece = byId.get(link.childId);
      if (!piece || piece.cosmetic || link.mode === 'paint') continue;
      if (SHIELD_TYPES.has(piece.type)) shields[piece.id] = FIGHT.shieldHits[piece.type as 'papita' | 'nacho'];
      if (!ROD_TYPES.has(piece.type)) {
        // Placa o bulto fijo al cuerpo: suma peso y (si es papita/nacho) escudo; lo que tenga clavado sí puede ser brazo.
        armor.push(...sample(piece, L, inside));
        walk(piece.id);
        continue;
      }
      const ids = subtree(piece.id);
      // Escudos colgados de un brazo también cuentan como escudos.
      for (const id of ids) {
        const q = byId.get(id);
        if (q && SHIELD_TYPES.has(q.type)) shields[q.id] = FIGHT.shieldHits[q.type as 'papita' | 'nacho'];
      }
      const points = ids.flatMap((id) => {
        const q = byId.get(id);
        return q && !q.cosmetic ? sample(q, L, parentId === s.coreId ? inside : () => false) : [];
      });
      const out = points.filter((q) => !q.inside);
      const through = !!link.exit && link.exit.freeTip > FIGHT.throughMin && parentId === s.coreId;
      const pivot = L(link.anchor);
      let far = out[0];
      for (const q of out) if (dist(q.p, pivot) > dist(far.p, pivot)) far = q;
      const reach = far ? dist(far.p, pivot) : 0;
      // Clavada casi entera (asoma menos de 1 cm): no llega a nada, es solo peso pegado al cuerpo.
      if (reach < FIGHT.minReach && !through) {
        armor.push(...points.map((q) => ({ ...q, kind: q.kind === 'shield' ? q.kind : ('light' as HitKind) })));
        continue;
      }
      const dir = norm(sub(far.p, pivot));
      const rigid = through || ids.some((id) => byId.get(id)?.type === 'chupetin');
      const mass = points.reduce((a, q) => a + q.m, 0);
      const kinds = new Set(points.map((q) => q.kind));
      const kind: HitKind = kinds.has('heavy') ? 'heavy' : kinds.has('cut') ? 'cut' : 'light';
      // Pierna: sale de la mitad de abajo (o casi) y apunta hacia el piso. Todo lo demás es brazo, esté donde esté.
      const role = pivot[1] < half * FIGHT.legPivotMax && dir[1] < FIGHT.legDownMin ? 'leg' : 'arm';
      const names = ids.map((id) => byId.get(id)?.type).filter((t): t is string => !!t && t !== 'ketchup');
      limbs.push({
        id: piece.id,
        pieceIds: ids,
        role,
        rigid,
        carry: (FIGHT.legCarryGrams[piece.type as keyof typeof FIGHT.legCarryGrams] ?? FIGHT.legCarryGrams.default) / 1000,
        pivot,
        dir,
        reach,
        mass,
        points,
        through,
        kind,
        clip: rigid ? null : { point: link.anchor, normal: link.axis },
        label: [...new Set(names)].join(' + '),
      });
    }
  };
  walk(s.coreId);
  const bodyMass = FIGHT.massGrams.chizito / 1000;
  const mass = bodyMass + armor.reduce((a, q) => a + q.m, 0) + limbs.reduce((a, l) => a + l.mass, 0);
  return { name, basis, origin, body: [{ a: L(cs.a), b: L(cs.b), r: cs.radius }], bodyMass, armor, limbs, mass, shields };
}

// ───────────────────────── Brócoli (rival) ─────────────────────────

/** m por unidad del boceto (1 unidad ≈ 100 px): el brócoli mide ≈ 8 cm. */
export const BROCCOLI_K = 0.021;
/** Altura (unidades del boceto) del centro del tronco: origen local del brócoli. */
export const BROCCOLI_CY = 2.09;

/** Extremidades del brócoli (boceto 2D, de frente a la cámara): de dónde salen (dentro del tronco) y adónde llegan. Mismo orden que las mallas de `createBrocoli`. */
export const SKETCH = [
  { id: 'armL', arm: true, from: [-0.24, 2.29], to: [-1.44, 1.61] },
  { id: 'armR', arm: true, from: [0.24, 2.29], to: [1.44, 1.61] },
  { id: 'legL', arm: false, from: [-0.16, 1.53], to: [-0.38, 0.05] },
  { id: 'legR', arm: false, from: [0.16, 1.53], to: [0.38, 0.05] },
] as const;

/** El brócoli malvado como luchador: tronco + copa, brazos y piernas de zanahoria (gruesas afuera). */
export function broccoliFighter(level = 1): FighterModel {
  const K = BROCCOLI_K;
  const P = (x: number, y: number, z = 0): V3 => [x * K, (y - BROCCOLI_CY) * K, z * K];
  const carrotG = FIGHT.broccoli.carrotGrams / 1000;
  const limbs: LimbModel[] = SKETCH.map((sk) => {
    const a = P(sk.from[0], sk.from[1]);
    const b = P(sk.to[0], sk.to[1]);
    const n = Math.max(3, Math.ceil(dist(a, b) / STEP) + 1);
    const points: MassPoint[] = [];
    // La zanahoria es más gruesa en la punta libre: más masa hacia afuera.
    const wsum = Array.from({ length: n }, (_, i) => 0.3 + i / (n - 1)).reduce((x, y) => x + y, 0);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
      const inTrunk = Math.abs(p[0]) < 0.33 * K && p[1] > P(0, 1.45)[1];
      points.push({ p, m: (carrotG * (0.3 + t)) / wsum, r: (0.03 + 0.08 * t) * K + 0.0006, piece: sk.id, kind: 'light', inside: inTrunk });
    }
    return {
      id: sk.id,
      pieceIds: [sk.id],
      role: sk.arm ? 'arm' : 'leg',
      rigid: false,
      carry: FIGHT.broccoli.carrotCarryGrams / 1000,
      pivot: a,
      dir: norm(sub(b, a)),
      reach: len(sub(b, a)),
      mass: carrotG,
      points,
      through: false,
      kind: 'light',
      clip: null,
      label: 'zanahoria',
    } satisfies LimbModel;
  });
  const bodyMass = FIGHT.broccoli.bodyGrams / 1000;
  return {
    name: `BRÓCOLI · NIVEL ${level}`,
    basis: { f: [1, 0, 0], u: [0, 1, 0], s: [0, 0, 1] },
    origin: [0, 0, 0],
    body: [
      { a: P(0, 1.48), b: P(0, 2.72), r: 0.36 * K },
      { a: P(-0.25, 3.12), b: P(0.35, 3.12), r: 0.62 * K },
    ],
    bodyMass,
    armor: [],
    limbs,
    mass: bodyMass + limbs.reduce((s, l) => s + l.mass, 0),
    shields: {},
  };
}
