import { bounds2D } from '../math/shapes2d';
import type { CreatureAnalysis, Shape2D, V2 } from '../types';

/** m por unidad del boceto (1 unidad ≈ 100 px): el brazo mide ≈ 2,9 cm, como el de la criatura de referencia. */
export const BROCCOLI_K = 0.021;

/** Extremidades del brócoli (boceto 2D, de frente a la cámara): de dónde salen (dentro del tronco) y adónde llegan. */
export const SKETCH = {
  armL: { arm: true, from: [-0.24, 2.29], to: [-1.44, 1.61] },
  armR: { arm: true, from: [0.24, 2.29], to: [1.44, 1.61] },
  legL: { arm: false, from: [-0.16, 1.53], to: [-0.38, 0.05] },
  legR: { arm: false, from: [0.16, 1.53], to: [0.38, 0.05] },
} as const;
export type SketchName = keyof typeof SKETCH;

/**
 * El análisis del brócoli: parte del de la criatura vegetal de referencia (`veg`: dos brazos y dos piernas; de ahí salen los golpes,
 * la velocidad, la defensa y los rangos de giro) y le pone la GEOMETRÍA del brócoli del boceto (cuerpo, brazos y piernas de zanahoria).
 * `base` debe venir hecho con `facing` = `pf`. Devuelve también qué extremidad del análisis es cada una del boceto.
 */
export function broccoliAnalysis(base: CreatureAnalysis): { an: CreatureAnalysis; ids: Record<SketchName, string> } {
  const an = structuredClone(base);
  const pf = an.profile2D.facing;
  const K = BROCCOLI_K;
  const mapped = (p: readonly number[]): V2 => [p[0] * K, p[1] * K];
  const raw = (p: readonly number[]): V2 => [p[0] * K * pf, p[1] * K];
  const feet = new Set(an.support.feet);
  // Adelante = el lado al que mira (en el boceto, x·pf > 0). Se empareja por orden de adelante hacia atrás.
  const byFront = (names: SketchName[]): SketchName[] => names.sort((a, b) => SKETCH[b].from[0] * pf - SKETCH[a].from[0] * pf);
  const arms = byFront((Object.keys(SKETCH) as SketchName[]).filter((n) => SKETCH[n].arm));
  const legs = byFront((Object.keys(SKETCH) as SketchName[]).filter((n) => !SKETCH[n].arm));
  const sortLimbs = (ls: typeof an.limbs) => [...ls].sort((a, b) => b.profile.pivot[0] - a.profile.pivot[0]);
  const vegArms = sortLimbs(an.limbs.filter((l) => !feet.has(l.id)));
  const vegLegs = sortLimbs(an.limbs.filter((l) => feet.has(l.id)));
  if (vegArms.length !== 2 || vegLegs.length !== 2) throw new Error('la criatura de referencia del brócoli debe tener 2 brazos y 2 piernas');
  const ids = {} as Record<SketchName, string>;
  const pairs: [typeof an.limbs[number], SketchName][] = [...vegArms.map((l, i) => [l, arms[i]] as [typeof an.limbs[number], SketchName]), ...vegLegs.map((l, i) => [l, legs[i]] as [typeof an.limbs[number], SketchName])];
  const shapesAll: Shape2D[] = [];
  for (const [l, name] of pairs) {
    const s = SKETCH[name];
    ids[name] = l.id;
    const pr = raw(s.from);
    const tr = raw(s.to);
    const rest = (Math.atan2(tr[1] - pr[1], tr[0] - pr[0]) * 180) / Math.PI;
    const wMin = l.mobility.restDeg - l.mobility.minDeg;
    const wMax = l.mobility.maxDeg - l.mobility.restDeg;
    l.profile.pivot = pr;
    l.profile.tip = tr;
    l.profile.inDepth = false;
    l.length = Math.hypot(tr[0] - pr[0], tr[1] - pr[1]);
    l.mobility = { ...l.mobility, restDeg: rest, minDeg: rest - wMin, maxDeg: rest + wMax, droops: false };
    const group = an.profile2D.groups.find((g) => g.owner === l.id);
    const shape: Shape2D = { kind: 'capsule', a: mapped(s.from), b: mapped(s.to), r: (s.arm ? 0.08 : 0.05) * K };
    if (group) {
      group.shapes = [shape];
      group.pivot = mapped(s.from);
    }
    shapesAll.push(shape);
  }
  const core = an.profile2D.groups.find((g) => g.owner === 'core');
  const coreShapes: Shape2D[] = [
    { kind: 'capsule', a: mapped([0, 1.5]), b: mapped([0, 2.7]), r: 0.34 * K }, // tronco
    { kind: 'capsule', a: mapped([-0.4, 3.2]), b: mapped([0.45, 3.2]), r: 0.5 * K }, // copa
  ];
  if (core) core.shapes = coreShapes;
  shapesAll.push(...coreShapes);
  an.profile2D.origin = [0, 0];
  an.profile2D.bounds = bounds2D(shapesAll);
  an.mass.comProfile = [0, 2.2 * K];
  // El alcance de los golpes del análisis sigue al largo real de la extremidad que pega.
  for (const a of an.actions) {
    const limb = a.limbId ? an.limbs.find((l) => l.id === a.limbId) : undefined;
    if (limb) a.reach = limb.length;
  }
  return { an, ids };
}
