import type { Ctx } from '../analyze/context';
import { bounds2D, projectShape, transform2D } from '../math/shapes2d';
import type { HurtGroup, Limb, Profile2D, Shape2D, V2 } from '../types';

/**
 * Perfil de combate: el plano (frente, arriba) con el origen en el centro de masa a la altura del piso. Cada extremidad
 * es un grupo de cajas de daño (con su pivote); el núcleo y lo decorativo forman el grupo del cuerpo. El cambio de
 * lado (`facing` −1) es un espejo en x aplicado a la SALIDA: los datos de la criatura no se tocan.
 */
export function buildProfile2D(ctx: Ctx, limbs: Limb[], facing: 1 | -1 = 1): Profile2D {
  const origin: V2 = [ctx.mass.comProfile[0], ctx.floorY];
  const place = (sh: Shape2D): Shape2D => {
    const moved = transform2D(sh, { translate: [-origin[0], -origin[1]] });
    return facing === -1 ? transform2D(moved, { facing }) : moved;
  };
  const placePoint = (p: V2): V2 => [(p[0] - origin[0]) * facing, p[1] - origin[1]];
  const shapesOf = (ids: string[]): Shape2D[] => {
    const out: Shape2D[] = [];
    for (const id of ids) {
      const p = ctx.pieces.get(id);
      if (!p || p.cosmetic) continue;
      const sh = projectShape(p.shape, ctx.basis);
      if (sh) out.push(place(sh));
    }
    return out;
  };

  const inLimb = new Set(limbs.flatMap((l) => l.pieceIds));
  const bodyIds = ctx.s.pieces.filter((p) => p.id === ctx.s.coreId || !inLimb.has(p.id)).map((p) => p.id);
  const groups: HurtGroup[] = [{ id: 'hurt:core', owner: 'core', shapes: shapesOf(bodyIds) }];
  for (const l of limbs) groups.push({ id: `hurt:${l.id}`, owner: l.id, shapes: shapesOf(l.pieceIds), pivot: placePoint(l.profile.pivot) });
  const all = groups.flatMap((g) => g.shapes);
  return { facing, origin, groups, bounds: all.length ? bounds2D(all) : { min: [0, 0], max: [0, 0] } };
}
