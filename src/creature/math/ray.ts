import type { V3 } from '../types';
import { addScaled, dot, len, sub } from './vec';

/**
 * Intersección de un rayo (origen `o`, dirección UNITARIA `d`) con una cápsula de extremos redondos
 * (segmento a→b = centros de las tapas, radio r). Devuelve el intervalo [tIn, tOut] a lo largo del rayo
 * (puede empezar en t ≈ 0 si el origen está sobre la superficie) o null si no la toca. Una cápsula es
 * convexa, así que la intersección es un único intervalo.
 */
export function rayCapsule(o: V3, d: V3, a: V3, b: V3, r: number): [number, number] | null {
  const ax = sub(b, a);
  const L2 = dot(ax, ax);
  const ts: number[] = [];
  const sOf = (t: number) => (L2 < 1e-18 ? 0.5 : dot(sub(addScaled(o, d, t), a), ax) / L2);

  if (L2 > 1e-18) {
    const w = sub(o, a);
    const dPerp = sub(d, addScaled([0, 0, 0], ax, dot(d, ax) / L2));
    const wPerp = sub(w, addScaled([0, 0, 0], ax, dot(w, ax) / L2));
    const A = dot(dPerp, dPerp);
    const B = 2 * dot(dPerp, wPerp);
    const C = dot(wPerp, wPerp) - r * r;
    if (A > 1e-18) {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
          const s = sOf(t);
          if (s >= -1e-9 && s <= 1 + 1e-9) ts.push(t);
        }
      }
    }
  }
  for (const [c, end] of [[a, 0], [b, 1]] as const) {
    const oc = sub(o, c);
    const bq = dot(d, oc);
    const cq = dot(oc, oc) - r * r;
    const disc = bq * bq - cq;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const t of [-bq - sq, -bq + sq]) {
      const s = sOf(t);
      if (L2 < 1e-18 || (end === 0 ? s <= 1e-9 : s >= 1 - 1e-9)) ts.push(t);
    }
  }
  if (!ts.length) return null;
  return [Math.min(...ts), Math.max(...ts)];
}

/** Intersección de un rayo con un disco grueso (losa de espesor `thick` y radio `R`). */
export function rayDisc(o: V3, d: V3, center: V3, n: V3, thick: number, R: number): [number, number] | null {
  const dn = dot(d, n);
  if (Math.abs(dn) < 1e-9) return null;
  const on = dot(sub(center, o), n);
  const t0 = (on - thick / 2) / dn;
  const t1 = (on + thick / 2) / dn;
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const mid = addScaled(o, d, (lo + hi) / 2);
  const inPlane = sub(mid, addScaled(center, n, dot(sub(mid, center), n)));
  return len(inPlane) <= R ? [lo, hi] : null;
}

/** Tramo de un segmento p0→p1 que está dentro de un intervalo de rayo: recorta a [0, largo]. */
export function clipToSegment(iv: [number, number] | null, segLen: number): { tIn: number; tOut: number; chord: number } | null {
  if (!iv) return null;
  const tIn = Math.max(iv[0], 0);
  const tOut = Math.min(iv[1], segLen);
  return tOut > tIn + 1e-9 ? { tIn, tOut, chord: tOut - tIn } : null;
}
