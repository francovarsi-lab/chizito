import { analyzeBody } from './analyze';
import { computeActions, computeDefense } from './analyze/actions';
import { CREATURE_CONFIG } from './config';
import { buildProfile2D } from './project';
import type { CreatureAnalysis, CreatureSnapshot } from './types';
import { validateSnapshot } from './validate';

export interface InterpretOptions {
  /** Lado al que mira en el combate: 1 = como está el frente del snapshot; −1 = girada 180° (sin espejar datos). */
  facing?: 1 | -1;
}

/**
 * Entrada única del intérprete: un `CreatureSnapshot` entra, un `CreatureAnalysis` sale. Puro y determinista:
 * no toca la escena, no usa three.js y no guarda estado.
 */
export function interpret(s: CreatureSnapshot, opts: InterpretOptions = {}, cfg = CREATURE_CONFIG): CreatureAnalysis {
  const { body, ctx } = analyzeBody(s, cfg);
  const actions = computeActions(ctx, body.limbs, body.locomotion.mode);
  const defense = computeDefense(ctx, body.limbs);
  const profile2D = buildProfile2D(ctx, body.limbs, opts.facing ?? 1);
  return { ...body, actions, defense, profile2D, warnings: [...validateSnapshot(s, cfg), ...body.warnings] };
}
