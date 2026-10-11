import { CREATURE_CONFIG } from '../config';
import type { CreatureAnalysis, Shape2D, V2 } from '../types';
import type { SimPlan } from './types';

/** Punto más bajo de una forma del perfil (con su radio). */
export const lowestY = (s: Shape2D): number => (s.kind === 'capsule' ? Math.min(s.a[1], s.b[1]) - s.r : Math.min(...s.pts.map((p) => p[1])));

/** Distancia del punto `c` al punto más lejano de la forma (con su radio). */
const farthest = (s: Shape2D, c: V2): number => (s.kind === 'capsule' ? Math.max(Math.hypot(s.a[0] - c[0], s.a[1] - c[1]), Math.hypot(s.b[0] - c[0], s.b[1] - c[1])) + s.r : Math.max(...s.pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))));

/**
 * El plan de simulación de una criatura: lo que el análisis ya decidió (modo, velocidad, salto, freno y giro) más el tamaño
 * del cuerpo. No inventa nada: si el análisis dice "arrastra a 11 mm/s", el simulador la arrastra a 11 mm/s.
 */
export function makeSimPlan(a: CreatureAnalysis, cfg = CREATURE_CONFIG): SimPlan {
  const sm = cfg.sim;
  const lc = a.locomotion;
  const feet = a.limbs.filter((l) => a.support.feet.includes(l.id));
  const strideSet = feet.length ? feet : a.limbs;
  const shapes = a.profile2D.groups.flatMap((g) => g.shapes);
  const comHeight = a.mass.comProfile[1] - a.profile2D.origin[1];
  const width = a.profile2D.bounds.max[0] - a.profile2D.bounds.min[0];
  const meanLen = strideSet.length ? strideSet.reduce((acc, l) => acc + l.length, 0) / strideSet.length : width;
  const airFrames = Math.max(1, Math.round(sm.hopAirTime / sm.dt));
  const pauseFrames = Math.max(0, Math.round(sm.hopPause / sm.dt));
  const airTime = airFrames * sm.dt;
  // Parábola: h = g·T²/8 → g = 8h/T². El saltito dura exactamente `airFrames` pasos; la caída usa el salto de referencia.
  const jump = lc.mode === 'hop' && lc.jump > 0 ? lc.jump : cfg.locomotion.jumpHeight;
  const gravity = (8 * jump) / (airTime * airTime);
  return {
    mode: lc.mode,
    speed: lc.speed,
    accel: lc.speed / sm.accelTime,
    decel: (lc.speed * lc.brake) / sm.stopTime,
    turnLock: sm.turnTime / lc.turn,
    airFrames,
    pauseFrames,
    hopSpeed: (lc.speed * (airFrames + pauseFrames)) / airFrames,
    jumpSpeed: (gravity * airTime) / 2,
    gravity,
    stride: Math.max(sm.strideRatio * meanLen, cfg.profile.minShapeThickness),
    rollRadius: Math.max(...shapes.map((s) => farthest(s, [0, comHeight])), cfg.profile.minShapeThickness),
    comHeight,
    facing: a.profile2D.facing,
    actions: a.actions,
    defense: a.defense,
  };
}
