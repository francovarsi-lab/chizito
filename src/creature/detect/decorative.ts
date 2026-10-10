import { CREATURE_CONFIG } from '../config';
import { pieceMass } from '../math/mass';
import { isKnownType } from '../profiles';
import type { CreatureSnapshot, DecorativePiece, DecorativeReason, LimbDraft } from '../types';

/**
 * Todo lo que no es núcleo ni parte de una extremidad es decorativo: SUMA masa, no cuenta como extremidad y el
 * panel avisa por qué. `rodReasons` trae la razón por la que cada vara no llegó a extremidad.
 */
export function collectDecorative(
  s: CreatureSnapshot,
  limbs: LimbDraft[],
  rodReasons: Map<string, DecorativeReason>,
  cfg = CREATURE_CONFIG,
): DecorativePiece[] {
  const inLimb = new Set<string>();
  for (const l of limbs) for (const id of l.pieceIds) inLimb.add(id);
  const links = new Map(s.links.map((l) => [l.childId, l]));
  const byId = new Map(s.pieces.map((p) => [p.id, p]));
  const out: DecorativePiece[] = [];
  const add = (pieceId: string, reason: DecorativeReason) => {
    const p = byId.get(pieceId)!;
    out.push({ pieceId, reason, mass: pieceMass(p, cfg) });
  };
  for (const p of s.pieces) {
    if (p.id === s.coreId) continue;
    const link = links.get(p.id);
    const parent = link ? byId.get(link.parentId) : undefined;
    if (p.cosmetic) add(p.id, 'stroke');
    else if (link?.integrity === 'broken') add(p.id, 'broken');
    else if (!isKnownType(p.type)) add(p.id, 'unknown-type');
    else if (p.kind === 'plate') add(p.id, 'plate');
    // Un palito clavado en un chizito ensartado se mueve con su extremidad: no es una extremidad propia (deuda del MVP 1).
    else if (p.kind === 'rod' && parent && parent.kind === 'blob' && parent.id !== s.coreId) add(p.id, 'second-level');
    else if (inLimb.has(p.id)) continue;
    else if (p.kind === 'rod') add(p.id, rodReasons.get(p.id) ?? 'no-free-tip');
    else {
      // Un chizito ensartado en una vara que no llegó a extremidad: decorativo por la misma razón que su vara.
      const holder = link && link.mode === 'tail' ? link.parentId : undefined;
      add(p.id, (holder && rodReasons.get(holder)) || 'weak-anchor');
    }
  }
  return out;
}

