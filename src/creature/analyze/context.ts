import { CREATURE_CONFIG } from '../config';
import { type Basis, makeBasis } from '../math/basis';
import { bounds2D, projectShape } from '../math/shapes2d';
import type { CreatureAnalysis, CreatureSnapshot, Shape2D, SnapPiece } from '../types';
import { computeMass } from './mass';

/** Todo lo que comparten los cálculos de una criatura: base, masas, y la altura del perfil (piso y techo). */
export interface Ctx {
  s: CreatureSnapshot;
  cfg: typeof CREATURE_CONFIG;
  basis: Basis;
  pieces: Map<string, SnapPiece>;
  mass: CreatureAnalysis['mass'];
  floorY: number;
  topY: number;
  height: number;
  core2D: Shape2D | null;
}

export function buildContext(s: CreatureSnapshot, cfg = CREATURE_CONFIG): Ctx {
  const basis = makeBasis(s.orientation.front, s.orientation.up);
  const pieces = new Map(s.pieces.map((p) => [p.id, p]));
  const shapes = s.pieces.filter((p) => !p.cosmetic).map((p) => projectShape(p.shape, basis)).filter((x): x is Shape2D => !!x);
  const bb = bounds2D(shapes);
  const core = pieces.get(s.coreId);
  return {
    s,
    cfg,
    basis,
    pieces,
    mass: computeMass(s, basis, cfg),
    floorY: shapes.length ? bb.min[1] : 0,
    topY: shapes.length ? bb.max[1] : 0,
    height: shapes.length ? bb.max[1] - bb.min[1] : 0,
    core2D: core ? projectShape(core.shape, basis) : null,
  };
}
