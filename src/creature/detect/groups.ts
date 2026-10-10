import { CREATURE_CONFIG } from '../config';
import { pieceMass } from '../math/mass';
import { add, dot, len, norm, scale, sub } from '../math/vec';
import type { CreatureSnapshot, LimbDraft, SnapPiece, V3 } from '../types';

/** Hijos de cada pieza (por el árbol del archivo). */
export function childrenOf(s: CreatureSnapshot): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const l of s.links) out.set(l.parentId, [...(out.get(l.parentId) ?? []), l.childId]);
  return out;
}

/** La pieza y todo lo que cuelga de ella (grupo rígido). */
export function subtreeIds(rootId: string, kids: Map<string, string[]>): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    for (const c of kids.get(id) ?? []) walk(c);
  };
  walk(rootId);
  return out;
}

/** Puntos extremos de una pieza (para buscar el más lejano del pivote). */
function extremes(p: SnapPiece, from: V3): V3[] {
  const sh = p.shape;
  if (sh.kind === 'capsule') return [sh.a, sh.b];
  if (sh.kind === 'disc') {
    const d = sub(sh.center, from);
    const inPlane = sub(d, scale(sh.normal, dot(d, sh.normal)));
    const dir = len(inPlane) < 1e-9 ? ([0, 0, 0] as V3) : norm(inPlane);
    return [sh.center, add(sh.center, scale(dir, sh.radius))];
  }
  return [];
}

/** Punto del grupo más lejano del pivote: la "punta" de una extremidad con cosas colgando. */
export function farthestPoint(group: SnapPiece[], pivot: V3): V3 {
  let best: V3 = pivot;
  let bd = -1;
  for (const p of group) {
    if (p.cosmetic) continue;
    for (const q of extremes(p, pivot)) {
      const d = len(sub(q, pivot));
      if (d > bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best;
}

/** Fracción de la masa de una pieza que cae en la zona "extremo" (de `from` a `to` medido sobre `axis` desde el pivote). */
function massInZone(p: SnapPiece, pivot: V3, axis: V3, zoneStart: number): number {
  const sh = p.shape;
  if (sh.kind === 'capsule') {
    const ta = dot(sub(sh.a, pivot), axis);
    const tb = dot(sub(sh.b, pivot), axis);
    const lo = Math.min(ta, tb);
    const hi = Math.max(ta, tb);
    if (hi - lo < 1e-9) return lo >= zoneStart ? 1 : 0;
    return Math.max(0, Math.min(1, (hi - Math.max(lo, zoneStart)) / (hi - lo)));
  }
  if (sh.kind === 'disc') return dot(sub(sh.center, pivot), axis) >= zoneStart ? 1 : 0;
  return 0;
}

/** Masa del grupo, fracción de masa en el extremo y etiqueta (lanza / maza / placa-con-vara). */
export function groupStats(
  s: CreatureSnapshot,
  d: Pick<LimbDraft, 'pieceIds' | 'rootPieceId' | 'pivot' | 'tip' | 'massShare' | 'anchoredBy'>,
  cfg = CREATURE_CONFIG,
): Pick<LimbDraft, 'mass' | 'endMassRatio' | 'tag'> {
  const byId = new Map(s.pieces.map((p) => [p.id, p]));
  const L = len(sub(d.tip, d.pivot));
  const axis = L < 1e-9 ? ([0, 0, 0] as V3) : norm(sub(d.tip, d.pivot));
  const zoneStart = (1 - cfg.actions.endFraction) * L;
  let total = 0;
  let inEnd = 0;
  let rodMass = 0;
  let blobMass = 0;
  for (const id of d.pieceIds) {
    const p = byId.get(id);
    if (!p || p.cosmetic) continue;
    const m = pieceMass(p, cfg) * (id === d.rootPieceId ? d.massShare : 1);
    total += m;
    inEnd += m * massInZone(p, d.pivot, axis, zoneStart);
    if (id === d.rootPieceId) rodMass = m;
    else if (p.kind === 'blob') blobMass += m;
  }
  const ratio = total > 0 ? inEnd / total : 0;
  const parent = s.links.find((l) => l.childId === d.rootPieceId)?.parentId;
  const parentKind = byId.get(parent ?? '')?.kind;
  let tag: LimbDraft['tag'] = 'lanza';
  if (blobMass > 0 && ratio >= cfg.actions.maceEndRatio && blobMass >= cfg.actions.maceMassVsRod * rodMass) tag = 'maza';
  else if (parentKind === 'plate' && d.anchoredBy !== 'own') tag = 'placa-con-vara';
  return { mass: total, endMassRatio: ratio, tag };
}
