import { clamp } from '../math/vec';
import type { CreatureAnalysis, Limb } from '../types';
import type { Ctx } from './context';

type Mode = CreatureAnalysis['locomotion']['mode'];

/** Una vuelta completa, en grados. */
const FULL_TURN = 2 * 180;

/** Una vuelta menos el mayor hueco entre las direcciones de perfil de las extremidades (0 con menos de dos). */
export function angularCoverageDeg(limbs: Limb[], minLen2: number): number {
  const angles = limbs.filter((l) => l.profile.length2D >= minLen2).map((l) => ((l.profile.angleDeg % FULL_TURN) + FULL_TURN) % FULL_TURN).sort((a, b) => a - b);
  if (angles.length < 2) return 0;
  let gap = angles[0] + FULL_TURN - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
  return FULL_TURN - gap;
}

/**
 * Modo de locomoción, en este orden (siempre hay uno; nunca se inventan partes):
 *  inmóvil (se hunde bajo su peso o pesa demasiado) → rueda (muchas extremidades en todas direcciones) →
 *  camina (≥ 2 apoyos separados con el centro de masa entre ellos) → salta (≥ 1 apoyo) → se arrastra.
 */
export function computeLocomotion(ctx: Ctx, limbs: Limb[], support: CreatureAnalysis['support']): CreatureAnalysis['locomotion'] {
  const lc = ctx.cfg.locomotion;
  const total = ctx.mass.total;
  const feet = limbs.filter((l) => support.feet.includes(l.id));
  const footXs = feet.map((l) => l.profile.tip[0]);
  const gap = footXs.length ? Math.max(...footXs) - Math.min(...footXs) : 0;
  const coverage = angularCoverageDeg(limbs, ctx.cfg.profile.minShapeThickness);

  let mode: Mode;
  if ((feet.length > 0 && support.loadRatio >= 1) || total >= lc.massRef * lc.immobileMassMult) mode = 'immobile';
  else if (limbs.length >= lc.rollMinLimbs && coverage >= lc.rollMinCoverageDeg) mode = 'roll';
  else if (feet.length >= 2 && gap >= lc.minFeetGap && support.margin >= 0) mode = 'walk';
  else if (feet.length >= 1) mode = 'hop';
  else mode = 'drag';

  const pushSum = feet.reduce((a, l) => a + l.caps.push, 0);
  const pushFactor = mode === 'walk' || mode === 'hop' ? lc.pushFloor + (1 - lc.pushFloor) * Math.min(1, pushSum / lc.pushSaturation) : 1;
  const massDamp = 1 / (1 + total / lc.massRef);
  const speed = mode === 'immobile' ? lc.immobileSpeed : clamp(lc.baseSpeed * lc.modeSpeed[mode] * pushFactor * massDamp, lc.minSpeed, lc.maxSpeed);
  return {
    mode,
    speed,
    jump: mode === 'hop' ? lc.jumpHeight * massDamp : 0,
    turn: lc.modeTurn[mode],
    brake: lc.modeBrake[mode],
  };
}
