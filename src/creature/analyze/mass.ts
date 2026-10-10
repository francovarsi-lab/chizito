import { CREATURE_CONFIG } from '../config';
import { makeBasis, type Basis, toProfile } from '../math/basis';
import { centerOfMass, pieceMass, shapeCenter } from '../math/mass';
import type { CreatureAnalysis, CreatureSnapshot } from '../types';

/** Masa de cada pieza (los decorativos pesan), total, núcleo y centro de masa (en el marco raíz y en el perfil). */
export function computeMass(s: CreatureSnapshot, basis?: Basis, cfg = CREATURE_CONFIG): CreatureAnalysis['mass'] {
  const b = basis ?? makeBasis(s.orientation.front, s.orientation.up);
  const byPiece: Record<string, number> = {};
  let total = 0;
  for (const p of s.pieces) {
    const m = pieceMass(p, cfg);
    byPiece[p.id] = m;
    total += m;
  }
  const com = centerOfMass(s.pieces.map((p) => ({ mass: byPiece[p.id], at: shapeCenter(p.shape) })));
  return { total, core: byPiece[s.coreId] ?? 0, byPiece, com, comProfile: toProfile(b, com) };
}
