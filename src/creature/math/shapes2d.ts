import { CREATURE_CONFIG } from '../config';
import type { Shape, Shape2D, V2, V3 } from '../types';
import { type Basis, toProfile } from './basis';
import { add, cross, len, norm, perpendicular, scale, sub } from './vec';
import { add2, cross2, dist2, dot2, len2, norm2, rot2, scale2, sub2 } from './vec';

// ───────────── casco convexo y utilidades de polígonos ─────────────

/** Casco convexo (Andrew monotone chain), antihorario. Con < 3 puntos distintos devuelve lo que haya. */
export function convexHull(points: V2[]): V2[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const uniq: V2[] = [];
  for (const p of pts) {
    const last = uniq[uniq.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-12 || Math.abs(last[1] - p[1]) > 1e-12) uniq.push(p);
  }
  if (uniq.length < 3) return uniq;
  const turn = (o: V2, a: V2, b: V2) => cross2(sub2(a, o), sub2(b, o));
  const lower: V2[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: V2[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function polygonArea(pts: V2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) a += cross2(pts[i], pts[(i + 1) % pts.length]);
  return Math.abs(a) / 2;
}

// ───────────── distancias ─────────────

/** Distancia punto → segmento. */
export function distPointSegment(p: V2, a: V2, b: V2): number {
  const ab = sub2(b, a);
  const l2 = dot2(ab, ab);
  const t = l2 < 1e-18 ? 0 : Math.min(1, Math.max(0, dot2(sub2(p, a), ab) / l2));
  return dist2(p, add2(a, scale2(ab, t)));
}

function segmentsIntersect(a: V2, b: V2, c: V2, d: V2): boolean {
  const o = (p: V2, q: V2, r: V2) => Math.sign(cross2(sub2(q, p), sub2(r, p)));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

/** Distancia mínima entre dos segmentos (0 si se cruzan). */
export function distSegmentSegment(a: V2, b: V2, c: V2, d: V2): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(distPointSegment(a, c, d), distPointSegment(b, c, d), distPointSegment(c, a, b), distPointSegment(d, a, b));
}

export function pointInConvex(p: V2, poly: V2[]): boolean {
  if (poly.length < 3) return false;
  for (let i = 0; i < poly.length; i++) {
    if (cross2(sub2(poly[(i + 1) % poly.length], poly[i]), sub2(p, poly[i])) < -1e-12) return false;
  }
  return true;
}

/** Distancia mínima segmento → polígono convexo (0 si lo toca o está adentro). */
export function distSegmentPolygon(a: V2, b: V2, poly: V2[]): number {
  if (poly.length === 0) return Infinity;
  if (poly.length < 3) {
    const p = poly[0];
    const q = poly[poly.length - 1];
    return distSegmentSegment(a, b, p, q);
  }
  if (pointInConvex(a, poly) || pointInConvex(b, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, distSegmentSegment(a, b, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

// ───────────── SAT entre polígonos convexos ─────────────

function project(poly: V2[], axis: V2): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of poly) {
    const d = dot2(p, axis);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

export function polyPolyOverlap(p: V2[], q: V2[]): boolean {
  if (p.length < 3 || q.length < 3) return false;
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub2(poly[(i + 1) % poly.length], poly[i]);
      const axis = norm2([-e[1], e[0]]);
      const [a0, a1] = project(p, axis);
      const [b0, b1] = project(q, axis);
      if (a1 < b0 || b1 < a0) return false;
    }
  }
  return true;
}

// ───────────── solapes entre formas 2D ─────────────

export function overlap2D(a: Shape2D, b: Shape2D): boolean {
  if (a.kind === 'capsule' && b.kind === 'capsule') return distSegmentSegment(a.a, a.b, b.a, b.b) <= a.r + b.r;
  if (a.kind === 'poly' && b.kind === 'poly') return polyPolyOverlap(a.pts, b.pts);
  const cap = (a.kind === 'capsule' ? a : b) as Extract<Shape2D, { kind: 'capsule' }>;
  const poly = (a.kind === 'poly' ? a : b) as Extract<Shape2D, { kind: 'poly' }>;
  return distSegmentPolygon(cap.a, cap.b, poly.pts) <= cap.r;
}

export function bounds2D(shapes: Shape2D[]): { min: V2; max: V2 } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const s of shapes) {
    if (s.kind === 'capsule') {
      for (const p of [s.a, s.b]) {
        take(p[0] - s.r, p[1] - s.r);
        take(p[0] + s.r, p[1] + s.r);
      }
    } else for (const p of s.pts) take(p[0], p[1]);
  }
  return { min: [minX, minY], max: [maxX, maxY] };
}

/** Transforma una forma 2D: espejo en x (facing −1), giro alrededor de `pivot` y traslación. */
export function transform2D(s: Shape2D, o: { facing?: 1 | -1; rotate?: number; pivot?: V2; translate?: V2 }): Shape2D {
  const pivot = o.pivot ?? [0, 0];
  const f = (p: V2): V2 => {
    let q: V2 = p;
    if (o.rotate) q = add2(rot2(sub2(q, pivot), o.rotate), pivot);
    if (o.facing === -1) q = [-q[0], q[1]];
    if (o.translate) q = add2(q, o.translate);
    return q;
  };
  return s.kind === 'capsule' ? { kind: 'capsule', a: f(s.a), b: f(s.b), r: s.r } : { kind: 'poly', pts: f2poly(s.pts.map(f), o.facing === -1) };
}
// Un espejo invierte el sentido de giro del polígono: se vuelve a ordenar antihorario.
function f2poly(pts: V2[], mirrored: boolean): V2[] {
  return mirrored ? [...pts].reverse() : pts;
}

// ───────────── proyección de formas 3D al perfil ─────────────

/**
 * Forma 3D → forma de perfil. Cápsula: segmento entre los centros de las tapas (los extremos reales
 * acortados en `r`) con radio `r`. Disco: casco convexo del borde proyectado (ambas caras); si queda de canto
 * se reduce a una cápsula fina. Trazo (ketchup): sin forma.
 */
export function projectShape(shape: Shape, basis: Basis): Shape2D | null {
  const minR = CREATURE_CONFIG.profile.minShapeThickness / 2;
  if (shape.kind === 'polyline') return null;
  if (shape.kind === 'capsule') {
    const axis = sub(shape.b, shape.a);
    const L = len(axis);
    const r = Math.max(shape.radius, minR);
    const u = L < 1e-12 ? ([0, 0, 0] as V3) : norm(axis);
    const shrink = Math.min(shape.radius, L / 2);
    const a = add(shape.a, scale(u, shrink));
    const b = sub(shape.b, scale(u, shrink));
    return { kind: 'capsule', a: toProfile(basis, a), b: toProfile(basis, b), r };
  }
  const n = norm(shape.normal);
  const t1 = perpendicular(n);
  const t2 = cross(n, t1);
  const N = CREATURE_CONFIG.profile.discRimPoints;
  const half = scale(n, shape.thickness / 2);
  const pts: V2[] = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const rim = add(add(shape.center, scale(t1, Math.cos(ang) * shape.radius)), scale(t2, Math.sin(ang) * shape.radius));
    pts.push(toProfile(basis, add(rim, half)), toProfile(basis, sub(rim, half)));
  }
  const hull = convexHull(pts);
  const minThick = CREATURE_CONFIG.profile.minShapeThickness;
  const area = polygonArea(hull);
  const extent = hull.length ? Math.max(...hull.map((p) => Math.max(...hull.map((q) => dist2(p, q))))) : 0;
  if (hull.length < 3 || area < extent * minThick * 0.5) {
    // De canto: una cápsula fina entre los dos puntos más alejados.
    let best: [V2, V2] = [hull[0] ?? [0, 0], hull[hull.length - 1] ?? [0, 0]];
    let bd = -1;
    for (const p of hull) {
      for (const q of hull) {
        const d = dist2(p, q);
        if (d > bd) {
          bd = d;
          best = [p, q];
        }
      }
    }
    return { kind: 'capsule', a: best[0], b: best[1], r: Math.max(shape.thickness / 2, minR) };
  }
  return { kind: 'poly', pts: hull };
}

/** Largo en el perfil / largo real de una cápsula (1 = de lado, 0 = de frente a la cámara). */
export function foreshortening(shape: Shape, basis: Basis): number {
  if (shape.kind !== 'capsule') return 1;
  const L = len(sub(shape.b, shape.a));
  if (L < 1e-12) return 1;
  const p = sub2(toProfile(basis, shape.b), toProfile(basis, shape.a));
  return len2(p) / L;
}
