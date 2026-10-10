import { CREATURE_CONFIG } from '../config';
import { dist, len, sub } from '../math/vec';
import { isKnownType } from '../profiles';
import type { CreatureSnapshot, DecorativePiece, DecorativeReason, LimbDraft, SnapLink, SnapPiece, V3 } from '../types';
import { anchorOptions, chainQualities } from './anchors';
import { collectDecorative } from './decorative';
import { childrenOf, farthestPoint, groupStats, subtreeIds } from './groups';

export interface Detection {
  limbs: LimbDraft[];
  decorative: DecorativePiece[];
  warnings: string[];
}

interface EndEval {
  end: 'tail' | 'tip';
  pivot: V3;
  tip: V3;
  freeLength: number;
  qualifies: boolean;
  /** Por qué no calificó (si no calificó). */
  reason: DecorativeReason | null;
  anchoredBy: string;
  embedded: number;
  tiltDeg: number;
  quality: number;
}

/**
 * Detección de extremidades (tanda 4). Una extremidad es un EXTREMO LIBRE de una vara con base clara:
 *  - largo libre ≥ max(minFreeAbs, minFreeRatio · largo de la vara);
 *  - embebida ≥ max(minEmbeddedAbs, minEmbeddedRatio · largo) en el sólido que la sostiene;
 *  - inclinada como máximo `maxTiltDeg` respecto de la normal;
 *  - calidad de ancla ≥ minAnchorQuality (la cadena de sostén cuenta: una vara en una papita floja es floja).
 * Una vara que atraviesa el cuerpo da DOS candidatas (cola y punta). Una vara con un chizito ensartado en la
 * cola es una sola extremidad que termina en ese chizito (una maza si pesa). Todo lo demás es decorativo.
 */
export function detectLimbs(s: CreatureSnapshot, cfg = CREATURE_CONFIG): Detection {
  const pieces = new Map(s.pieces.map((p) => [p.id, p]));
  const linkOf = new Map(s.links.map((l) => [l.childId, l]));
  const kids = childrenOf(s);
  const chain = chainQualities(s, cfg);
  const limbs: LimbDraft[] = [];
  const rodReasons = new Map<string, DecorativeReason>();
  const warnings: string[] = [];

  for (const rod of s.pieces) {
    if (rod.kind !== 'rod' || rod.shape.kind !== 'capsule' || !isKnownType(rod.type)) continue;
    const link = linkOf.get(rod.id);
    if (!link || link.mode !== 'pierce' || link.integrity === 'broken') continue;
    const parent = pieces.get(link.parentId);
    if (!parent) continue;
    // Un palito clavado en un chizito ensartado se mueve con su extremidad (deuda del MVP 1): lo resuelve collectDecorative.
    if (parent.kind === 'blob' && parent.id !== s.coreId) continue;
    const cap = rod.shape;
    const rodLen = len(sub(cap.b, cap.a));
    const ends = evalEnds(s, rod, cap, link, rodLen, chain, pieces, kids, cfg);
    const good = ends.filter((e) => e.qualifies);
    if (good.length === 0) {
      rodReasons.set(rod.id, worstReason(ends));
      continue;
    }
    const totalFree = good.reduce((a, e) => a + e.freeLength, 0);
    const created: LimbDraft[] = good.map((e) => {
      const ids = subtreeIds(rod.id, kids);
      const massShare = good.length > 1 && totalFree > 0 ? e.freeLength / totalFree : 1;
      const base = {
        id: `limb:${rod.id}:${e.end}`,
        rootPieceId: rod.id,
        end: e.end,
        pieceIds: ids,
        branchIds: ids.filter((id) => pieces.get(id)?.kind === 'rod' && id !== rod.id),
        pivot: e.pivot,
        tip: e.tip,
        length: dist(e.tip, e.pivot),
        freeLength: e.freeLength,
        embedded: e.embedded,
        tiltDeg: e.tiltDeg,
        anchorQuality: e.quality,
        anchoredBy: e.anchoredBy,
        massShare,
      };
      return { ...base, ...groupStats(s, base, cfg) };
    });
    if (created.length === 2) {
      created[0].pairedWith = created[1].id;
      created[1].pairedWith = created[0].id;
    }
    limbs.push(...created);
  }
  const decorative = collectDecorative(s, limbs, rodReasons, cfg);
  return { limbs, decorative, warnings };
}

/** Evalúa los dos extremos libres posibles de una vara. */
function evalEnds(
  s: CreatureSnapshot,
  rod: SnapPiece,
  cap: { a: V3; b: V3 },
  link: SnapLink,
  rodLen: number,
  chain: Map<string, number>,
  pieces: Map<string, SnapPiece>,
  kids: Map<string, string[]>,
  cfg: typeof CREATURE_CONFIG,
): EndEval[] {
  const lim = cfg.limb;
  const minFree = Math.max(lim.minFreeAbs, lim.minFreeRatio * rodLen);
  const minEmb = Math.max(lim.minEmbeddedAbs, lim.minEmbeddedRatio * rodLen);
  const out: EndEval[] = [];
  const mounted = s.links.some((l) => l.mode === 'tail' && l.parentId === rod.id);

  const judge = (end: 'tail' | 'tip', pivot: V3, tip: V3, freeLength: number): EndEval => {
    const { best } = anchorOptions(link, rodLen, end, chain, pieces, cfg);
    const tiltDeg = (best.tiltRad * 180) / Math.PI;
    const freeOk = freeLength >= minFree;
    const anchorOk = best.embedded >= minEmb && tiltDeg <= lim.maxTiltDeg && best.quality >= lim.minAnchorQuality;
    let reason: DecorativeReason | null = null;
    if (!freeOk || !anchorOk) {
      // Si lo que sobresale alcanza pero la base no, es base floja; si no alcanza, es corta (o no hay punta libre).
      reason = freeOk ? 'weak-anchor' : freeLength > lim.minVisibleFree ? 'too-short' : 'no-free-tip';
    }
    return {
      end,
      pivot,
      tip,
      freeLength,
      qualifies: freeOk && anchorOk,
      reason,
      anchoredBy: best.solidId === link.parentId ? 'own' : best.solidId,
      embedded: best.embedded,
      tiltDeg,
      quality: best.quality,
    };
  };

  // Extremo de la COLA (por donde entró la vara).
  if (mounted) {
    const group = subtreeIds(rod.id, kids).map((id) => pieces.get(id)!).filter(Boolean);
    const tip = farthestPoint(group, link.anchor);
    out.push(judge('tail', link.anchor, tip, dist(tip, link.anchor)));
  } else if (link.freeTail > 0) {
    out.push(judge('tail', link.anchor, cap.b, link.freeTail));
  }
  // Extremo de la PUNTA (si la vara atraviesa y sale).
  if (link.exit) out.push(judge('tip', link.exit.point, cap.a, link.exit.freeTip));
  if (out.length === 0) {
    out.push({ end: 'tail', pivot: link.anchor, tip: cap.b, freeLength: 0, qualifies: false, reason: 'no-free-tip', anchoredBy: 'own', embedded: link.embedded, tiltDeg: (link.tiltFromNormal * 180) / Math.PI, quality: 0 });
  }
  return out;
}

/** La razón más "importante" de por qué una vara no es extremidad: base floja > corta > sin punta libre. */
function worstReason(ends: EndEval[]): DecorativeReason {
  const order: DecorativeReason[] = ['weak-anchor', 'too-short', 'no-free-tip'];
  for (const r of order) if (ends.some((e) => e.reason === r)) return r;
  return 'no-free-tip';
}
