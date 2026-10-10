import type { CreatureAnalysis, Limb } from '../types';
import type { Ctx } from './context';

/**
 * Apoyos: las extremidades con capacidad de apoyo (apuntan hacia abajo y llegan al piso). El intervalo es el
 * rango de x de sus puntas en el perfil; el margen es cuánto adentro del intervalo cae el centro de masa
 * (negativo = fuera). La carga de cada apoyo sale de repartir el peso por momentos; la capacidad de un apoyo
 * es el pandeo simplificado k · r⁴ / largo².
 */
export function computeSupport(ctx: Ctx, limbs: Limb[]): CreatureAnalysis['support'] {
  const { cfg } = ctx;
  const feet = limbs.filter((l) => l.caps.support >= cfg.capabilities.minRole);
  if (feet.length === 0) return { feet: [], intervalX: null, margin: 0, loadRatio: 0 };
  const xs = feet.map((l) => l.profile.tip[0]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const comX = ctx.mass.comProfile[0];
  const weight = ctx.mass.total * cfg.locomotion.gravity;

  // Carga por apoyo: con dos, por momentos (el más cercano al centro de masa carga más); con más, parejo.
  const loads = feet.map((_, i) => {
    if (feet.length === 1) return weight;
    if (feet.length > 2) return weight / feet.length;
    const [a, b] = xs;
    const span = Math.abs(b - a);
    if (span < 1e-9) return weight / 2;
    const t = Math.min(1, Math.max(0, (comX - Math.min(a, b)) / span)); // 0 = en el apoyo izquierdo, 1 = en el derecho
    const leftIsFirst = a <= b;
    const share = i === 0 ? (leftIsFirst ? 1 - t : t) : leftIsFirst ? t : 1 - t;
    return weight * share;
  });
  let ratio = 0;
  feet.forEach((l, i) => {
    const root = ctx.pieces.get(l.rootPieceId);
    const r = root && root.shape.kind === 'capsule' ? root.shape.radius : cfg.strength.refRadius;
    const capacity = (cfg.locomotion.bucklingK * r ** 4) / Math.max(l.length, 1e-9) ** 2;
    ratio = Math.max(ratio, loads[i] / capacity);
  });
  return { feet: feet.map((l) => l.id), intervalX: [xMin, xMax], margin: Math.min(comX - xMin, xMax - comX), loadRatio: ratio };
}
