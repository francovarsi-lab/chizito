import { CREATURE_CONFIG } from '../config';
import { transform2D } from '../math/shapes2d';
import { hurtGroupOf, poseGroup, swingArc } from '../project/hitboxes';
import { activeHitbox, attackAngle } from './combat';
import type { CreatureAnalysis, Limb, Shape2D } from '../types';
import { lowestY } from './plan';
import type { Pose, PosedLimb, SimPlan, SimState } from './types';

/** Escala una forma alrededor de un punto (la criatura que se encoge). */
const scaleAbout = (sh: Shape2D, k: number, c: readonly [number, number]): Shape2D => {
  const f = (p: readonly [number, number]): [number, number] => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
  return sh.kind === 'capsule' ? { kind: 'capsule', a: f(sh.a), b: f(sh.b), r: sh.r * k } : { kind: 'poly', pts: sh.pts.map(f) };
};

const lowestOf = (shapes: Shape2D[]): number => (shapes.length ? Math.min(...shapes.map(lowestY)) : Infinity);

/**
 * La criatura en un instante: cada extremidad girada dentro de su rango de movilidad (por el ciclo de andar), el cuerpo apoyado
 * en el piso y, si rueda, todo girado. Reglas de cada cuadro:
 *  - cada extremidad gira como mucho `swingFraction` de su rango (reposo ± hacia el límite que corresponda): nunca sale de él;
 *  - con apoyos (camina, salta), el cuerpo se sube hasta que el punto más bajo de los apoyos toca el piso; sin apoyos (se arrastra,
 *    rueda, inmóvil) toca lo más bajo de todo. El piso no se atraviesa nunca;
 *  - una extremidad que no es de apoyo no puede llegar al piso al girar: se le recorta el giro hasta que quede en el aire.
 */
export function poseCreature(a: CreatureAnalysis, plan: SimPlan, st: SimState, cfg = CREATURE_CONFIG): Pose {
  const sm = cfg.sim;
  const profile = a.profile2D;
  const limbs = a.limbs;
  const withFeet = (plan.mode === 'walk' || plan.mode === 'hop') && a.support.feet.length > 0;
  const feet = new Set(withFeet ? a.support.feet : []);
  const feetOrder = limbs.filter((l) => feet.has(l.id)).sort((p, q) => p.profile.tip[0] - q.profile.tip[0]).map((l) => l.id);
  const turn = Math.PI * 2;

  /** Posición dentro del ciclo, de −1 a 1: positivo = hacia el límite máximo del rango. */
  const cycle = (l: Limb, i: number): number => {
    if (plan.mode === 'walk') {
      const k = feetOrder.indexOf(l.id);
      const off = k >= 0 ? k / feetOrder.length : 1 / 2;
      return Math.sin(turn * (st.phase + off));
    }
    if (plan.mode === 'hop') return st.air ? Math.sin((Math.PI * st.hopFrame) / plan.airFrames) : 0;
    if (plan.mode === 'drag') return Math.sin(turn * (st.phase + (i % 2) / 2));
    return 0;
  };
  const deltaOf = (l: Limb, s: number, scale = 1): number => {
    const m = l.mobility;
    return scale * sm.swingFraction * (s >= 0 ? s * (m.maxDeg - m.restDeg) : s * (m.restDeg - m.minDeg));
  };

  const guardFrac = sm.guardFrames > 0 ? st.combat.guard / sm.guardFrames : 0;
  const curl = plan.defense.kind === 'curl' && guardFrac > 0 ? 1 - (1 - sm.curlScale) * guardFrac : 1;
  const place = (shapes: Shape2D[]): Shape2D[] => {
    let out = shapes;
    if (curl !== 1) out = out.map((sh) => scaleAbout(sh, curl, [0, plan.comHeight]));
    if (st.facing !== plan.facing) out = out.map((s) => transform2D(s, { facing: -1 }));
    if (plan.mode === 'roll' && st.angle !== 0) out = out.map((s) => transform2D(s, { rotate: st.angle, pivot: [0, plan.comHeight] }));
    return out;
  };
  const shapesOf = (l: Limb, delta: number): Shape2D[] => {
    const g = hurtGroupOf(profile, l.id);
    return g ? place(poseGroup(profile, g, delta)) : [];
  };

  const bodyGroup = hurtGroupOf(profile, 'core');
  const body = place(bodyGroup ? bodyGroup.shapes : []);
  const animated = plan.mode === 'walk' || plan.mode === 'hop' || plan.mode === 'drag';
  const restShapes = limbs.map((l) => shapesOf(l, 0));
  const restAll = Math.min(lowestOf(body), ...restShapes.map(lowestOf));
  // Quién carga el cuerpo: con apoyos, los pies; sin ellos, lo que ya toca el piso en reposo (el cuerpo y/o alguna extremidad,
  // que en ese caso no gira: es sobre lo que está tirada). Todo lo demás tiene que quedar en el aire.
  const ground = new Set(withFeet ? a.support.feet : limbs.filter((_, i) => lowestOf(restShapes[i]) <= restAll + sm.contactTol).map((l) => l.id));
  const bodyOnGround = !withFeet && lowestOf(body) <= restAll + sm.contactTol;
  const deltas = limbs.map((l, i) => (!animated || (!withFeet && ground.has(l.id)) ? 0 : deltaOf(l, cycle(l, i))));
  // Combate: la extremidad que pega recorre el arco del análisis (reposo → arranque → arco → reposo); la que guarda sube hacia el frente.
  const act = st.combat.actionId ? plan.actions.find((q) => q.id === st.combat.actionId) : undefined;
  const combatLimbs = new Set<string>();
  if (act?.limbId) {
    const ang = attackAngle(a, st.combat, act);
    const i = limbs.findIndex((l) => l.id === act.limbId);
    if (ang !== null && i >= 0) {
      deltas[i] = ang - limbs[i].mobility.restDeg;
      combatLimbs.add(act.limbId);
    }
  }
  if (plan.defense.kind === 'guard' && plan.defense.limbId && guardFrac > 0 && !combatLimbs.has(plan.defense.limbId)) {
    const i = limbs.findIndex((l) => l.id === plan.defense.limbId);
    if (i >= 0) {
      deltas[i] = (swingArc(limbs[i]).to - limbs[i].mobility.restDeg) * guardFrac;
      combatLimbs.add(limbs[i].id);
    }
  }
  let limbShapes = limbs.map((l, i) => (deltas[i] === 0 ? restShapes[i] : shapesOf(l, deltas[i])));
  // El cuerpo se apoya como en reposo: una extremidad de apoyo que pega o guarda no hace subir y bajar a la criatura.
  const supportShapes = limbs.map((l, i) => (combatLimbs.has(l.id) ? restShapes[i] : limbShapes[i]));

  const lowestAll = (): number => Math.min(lowestOf(body), ...limbShapes.map(lowestOf));
  const groundLow = (shapes: Shape2D[][]): number => Math.min(bodyOnGround ? lowestOf(body) : Infinity, ...limbs.map((l, i) => (ground.has(l.id) ? lowestOf(shapes[i]) : Infinity)));
  let lift = animated ? -groundLow(supportShapes) : -lowestAll();

  // Las que no cargan el cuerpo no llegan al piso: se recorta el giro (bisección hacia el reposo) hasta que quede en el aire.
  if (animated) {
    const restLift = -groundLow(restShapes);
    limbs.forEach((l, i) => {
      if (ground.has(l.id) || deltas[i] === 0) return;
      const allowed = Math.min(sm.contactTol, lowestOf(restShapes[i]) + restLift);
      const ok = (t: number): boolean => lowestOf(shapesOf(l, deltas[i] * t)) + lift >= allowed;
      if (ok(1)) return;
      let lo = 0;
      let hi = 1;
      for (let n = 0; n < sm.clampSteps; n++) {
        const mid = (lo + hi) / 2;
        if (ok(mid)) lo = mid;
        else hi = mid;
      }
      deltas[i] *= lo;
      limbShapes[i] = shapesOf(l, deltas[i]);
    });
  }
  lift = Math.max(lift, -lowestAll());

  const move = (shapes: Shape2D[]): Shape2D[] => shapes.map((s) => transform2D(s, { translate: [st.x, lift + st.h] }));
  const worldBody = move(body);
  limbShapes = limbShapes.map(move);
  const posed: PosedLimb[] = limbs.map((l, i) => {
    const lowest = lowestOf(limbShapes[i]);
    return { id: l.id, deltaDeg: deltas[i], angleDeg: l.mobility.restDeg + deltas[i], restDeg: l.mobility.restDeg, minDeg: l.mobility.minDeg, maxDeg: l.mobility.maxDeg, foot: feet.has(l.id), shapes: limbShapes[i], lowest, contact: lowest <= sm.contactTol };
  });
  const all = [...worldBody, ...limbShapes.flat()];
  const contacts = [...(lowestOf(worldBody) <= sm.contactTol ? ['core'] : []), ...posed.filter((p) => p.contact).map((p) => p.id)];
  const hitbox = activeHitbox(a, plan, st.combat, st.x, lift + st.h, st.facing !== plan.facing);
  return { x: st.x, lift: lift + st.h, body: worldBody, limbs: posed, shapes: all, lowest: lowestOf(all), contacts, hitbox };
}
