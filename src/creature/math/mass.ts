import { CREATURE_CONFIG } from '../config';
import { densityOf, lumpinessOf } from '../profiles';
import type { Shape, SnapPiece, V3 } from '../types';
import { len, mid, sub } from './vec';

/** Volumen (m³). Cápsula de extremos redondos para núcleo/bulto; cilindro de extremos planos para varas. */
export function shapeVolume(shape: Shape, kind: SnapPiece['kind']): number {
  if (shape.kind === 'polyline') return 0;
  if (shape.kind === 'disc') return Math.PI * shape.radius * shape.radius * shape.thickness * Math.min(1, Math.max(0, shape.solidFraction));
  const L = len(sub(shape.b, shape.a));
  const r = shape.radius;
  if (kind === 'rod') return Math.PI * r * r * L;
  if (L <= 2 * r) return (4 / 3) * Math.PI * r * r * r; // más corta que ancha: esfera
  return Math.PI * r * r * (L - 2 * r) + (4 / 3) * Math.PI * r * r * r;
}

/** Masa de una pieza (kg de juego). Lo cosmético pesa 0. */
export function pieceMass(p: SnapPiece, cfg = CREATURE_CONFIG): number {
  if (p.cosmetic) return 0;
  return densityOf(p.type, cfg) * lumpinessOf(p.type, cfg) * shapeVolume(p.shape, p.kind);
}

/** Centro geométrico de la forma. */
export function shapeCenter(shape: Shape): V3 {
  if (shape.kind === 'capsule') return mid(shape.a, shape.b);
  if (shape.kind === 'disc') return shape.center;
  const n = shape.points.length || 1;
  const s = shape.points.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as V3, [0, 0, 0] as V3);
  return [s[0] / n, s[1] / n, s[2] / n];
}

/** Centro de masa de un conjunto de masas puntuales. Sin masa, devuelve el origen. */
export function centerOfMass(items: { mass: number; at: V3 }[]): V3 {
  let m = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const it of items) {
    m += it.mass;
    x += it.at[0] * it.mass;
    y += it.at[1] * it.mass;
    z += it.at[2] * it.mass;
  }
  return m > 0 ? [x / m, y / m, z / m] : [0, 0, 0];
}

