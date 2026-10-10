import { CREATURE_CONFIG } from '../config';
import { detectLimbs } from '../detect';
import type { CreatureAnalysis, CreatureSnapshot } from '../types';
import { buildContext, type Ctx } from './context';
import { completeLimbs } from './limbs';
import { computeLocomotion } from './locomotion';
import { computeSupport } from './support';
import { buildWarnings } from './warnings';

export type BodyAnalysis = Pick<CreatureAnalysis, 'mass' | 'limbs' | 'decorative' | 'support' | 'locomotion' | 'warnings'>;

/** Masa, extremidades con sus capacidades, apoyos, locomoción y avisos (las acciones y el perfil 2D llegan en la tanda 6). */
export function analyzeBody(s: CreatureSnapshot, cfg = CREATURE_CONFIG): { body: BodyAnalysis; ctx: Ctx } {
  const ctx = buildContext(s, cfg);
  const det = detectLimbs(s, cfg);
  const limbs = completeLimbs(ctx, det.limbs);
  const support = computeSupport(ctx, limbs);
  const locomotion = computeLocomotion(ctx, limbs, support);
  const partial = { limbs, decorative: det.decorative, locomotion, support };
  return { body: { mass: ctx.mass, ...partial, warnings: [...det.warnings, ...buildWarnings(partial)] }, ctx };
}

export { buildContext, type Ctx } from './context';
export { computeMass } from './mass';
export { completeLimbs } from './limbs';
export { computeSupport } from './support';
export { computeLocomotion, angularCoverageDeg } from './locomotion';
export { buildWarnings } from './warnings';
