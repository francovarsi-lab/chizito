import { add2, rot2 } from '../math/vec';
import { transform2D } from '../math/shapes2d';
import type { AttackAction, HurtGroup, Limb, Profile2D, Shape2D, V2 } from '../types';

/** Punto del perfil de la criatura (frente +x) → coordenadas del perfil ya colocado (origen y lado). */
export const mapPoint = (profile: Profile2D, p: V2): V2 => [(p[0] - profile.origin[0]) * profile.facing, p[1] - profile.origin[1]];

export const hurtGroupOf = (profile: Profile2D, limbId: string): HurtGroup | undefined => profile.groups.find((g) => g.owner === limbId);

/** Las cajas de una extremidad con la extremidad girada `deltaDeg` grados (en el sentido de la criatura) alrededor de su pivote. */
export function poseGroup(profile: Profile2D, group: HurtGroup, deltaDeg: number): Shape2D[] {
  if (!group.pivot) return group.shapes;
  const rotate = (deltaDeg * profile.facing * Math.PI) / 180;
  return group.shapes.map((s) => transform2D(s, { rotate, pivot: group.pivot }));
}

/**
 * Arco del golpe (grados, sentido de la criatura): de su posición de reposo al ángulo del rango de giro más cercano
 * al frente (0°). Una extremidad en profundidad no tiene reposo útil en el perfil: barre desde el extremo
 * más alejado del frente de su rango hacia el más cercano.
 */
export function swingArc(limb: Limb): { from: number; to: number } {
  const { minDeg, maxDeg, restDeg } = limb.mobility;
  const to = Math.min(maxDeg, Math.max(minDeg, 0));
  const from = limb.profile.inDepth ? (Math.abs(minDeg) >= Math.abs(maxDeg) ? minDeg : maxDeg) : restDeg;
  return { from, to };
}

/**
 * Caja de golpe activa en el instante t (0..1) del barrido: un círculo en la punta de la extremidad, con su LARGO REAL
 * (3D), girando por su arco. Así una extremidad en profundidad, que se ve corta en reposo, golpea con todo su largo
 * al girar al plano. Las acciones del cuerpo (embestida, rodada) son un círculo alrededor del centro del núcleo.
 */
export function attackHitbox(profile: Profile2D, limbs: Limb[], action: AttackAction, t: number): { center: V2; r: number } {
  const limb = action.limbId ? limbs.find((l) => l.id === action.limbId) : undefined;
  if (!limb) return { center: [0, profile.bounds.max[1] / 2], r: action.hitRadius };
  const { from, to } = swingArc(limb);
  const clamped = Math.min(1, Math.max(0, t));
  const theta = ((from + (to - from) * clamped) * Math.PI) / 180;
  const pivot = mapPoint(profile, limb.profile.pivot);
  const dir = rot2([1, 0], theta);
  const center = add2(pivot, [dir[0] * limb.length * profile.facing, dir[1] * limb.length]);
  return { center, r: action.hitRadius };
}

/** Muestras del barrido (para dibujarlo y para probarlo). */
export function hitboxPath(profile: Profile2D, limbs: Limb[], action: AttackAction, samples = 8): { center: V2; r: number }[] {
  return Array.from({ length: samples }, (_, i) => attackHitbox(profile, limbs, action, samples === 1 ? 0 : i / (samples - 1)));
}
