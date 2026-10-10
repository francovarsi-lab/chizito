import type { V2, V3 } from '../types';
import { cross, dot, norm, scale, sub } from './vec';

/**
 * Base de la criatura: f = frente, u = arriba, s = f × u (eje de PROFUNDIDAD de la vista lateral).
 * Con el frente de fábrica del juego (f = +Z, u = +Y) queda s = −X: la cámara lateral mira a lo largo del eje
 * largo del chizito.
 */
export interface Basis {
  f: V3;
  u: V3;
  s: V3;
}

/** Ortonormaliza (frente manda; `up` se corrige para ser perpendicular al frente). */
export function makeBasis(front: V3, up: V3): Basis {
  const f = norm(front);
  let u = norm(sub(up, scale(f, dot(up, f))));
  if (Math.hypot(u[0], u[1], u[2]) < 1e-9) u = norm(sub([0, 1, 0], scale(f, f[1]))); // up degenerado
  if (Math.hypot(u[0], u[1], u[2]) < 1e-9) u = norm(sub([1, 0, 0], scale(f, f[0])));
  return { f, u, s: norm(cross(f, u)) };
}

/** Coordenadas de perfil (x = hacia el frente, y = hacia arriba). Se descarta la profundidad. */
export const toProfile = (b: Basis, v: V3): V2 => [dot(v, b.f), dot(v, b.u)];

/** Profundidad (componente sobre s): lo que la vista lateral no ve. */
export const depthOf = (b: Basis, v: V3): number => dot(v, b.s);

/**
 * Cambio de lado = rotar 180° alrededor de `up`. En el perfil es exactamente x → −x (y no cambia);
 * los datos de la criatura no se espejan.
 */
export const applyFacing = (p: V2, facing: 1 | -1): V2 => [p[0] * facing, p[1]];
