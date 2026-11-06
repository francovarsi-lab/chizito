import type { V3 } from '../types';

/** Cuaternión [x, y, z, w] (unitario). Matemática mínima para las articulaciones de la pelea, sin three.js. */
export type Q = [number, number, number, number];

export const QI = (): Q => [0, 0, 0, 1];

export function qAxis(axis: V3, angle: number): Q {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

export function qMul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export const qConj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];

export function qNorm(q: Q): Q {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function qRot(q: Q, v: V3): V3 {
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Rotación como vector (eje × ángulo, ángulo en [0, π]). */
export function qToVec(q: Q): V3 {
  const r = q[3] < 0 ? ([-q[0], -q[1], -q[2], -q[3]] as Q) : q;
  const s = Math.hypot(r[0], r[1], r[2]);
  if (s < 1e-9) return [0, 0, 0];
  const a = 2 * Math.atan2(s, r[3]);
  return [(r[0] / s) * a, (r[1] / s) * a, (r[2] / s) * a];
}

/** Integra una velocidad angular `w` (rad/s, mismo marco) durante `dt`: q' = exp(w·dt) · q. */
export function qIntegrate(q: Q, w: V3, dt: number): Q {
  const a = Math.hypot(w[0], w[1], w[2]) * dt;
  if (a < 1e-12) return q;
  const k = 1 / (Math.hypot(w[0], w[1], w[2]) || 1);
  return qNorm(qMul(qAxis([w[0] * k, w[1] * k, w[2] * k], a), q));
}

/** Rotación más corta que lleva la dirección unitaria `a` a la `b`. */
export function qFromTo(a: V3, b: V3): Q {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    // Opuestos: cualquier eje perpendicular.
    const p: V3 = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[2], 0, a[0]];
    const l = Math.hypot(p[0], p[1], p[2]);
    return qAxis([p[0] / l, p[1] / l, p[2] / l], Math.PI);
  }
  const c: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return qNorm([c[0], c[1], c[2], 1 + d]);
}
