import type { V3 } from '../types';
import type { FighterModel, HitKind, MassPoint } from './fighter';
import { qAxis, qConj, qFromTo, QI, qIntegrate, qMul, qToVec, type Q } from './quat';
import { FIGHT } from './tuning';
import type { Quad } from '../zones';

/**
 * Motor de la pelea (TypeScript puro, sin three.js, determinista): un solo motor para el jugador y el rival.
 *
 * Cuerpo: 2D en el plano de la pelea (x, y) + inclinación (gira alrededor de la profundidad). Las extremidades giran en 3D
 * alrededor de su punto de clavado con un motor PD de torque limitado: una extremidad pesada (aceituna, chupetín) tarda más en
 * arrancar y en volver, pero pega con más momento. El cuerpo recibe la reacción de cada giro y se inclina hacia donde está el
 * peso (contrapeso). El daño sale de la masa efectiva y la velocidad real del punto que toca.
 */
export interface FightInput {
  /** Dirección de la flecha en el MUNDO (−1 izquierda, +1 derecha). */
  x: -1 | 0 | 1;
  /** Salto (flanco: solo el paso en que se apretó). */
  up?: boolean;
  /** Agacharse (mantenido). */
  down?: boolean;
  /** Piña: el brazo siguiente (flanco). En el aire, en picada. */
  punch?: boolean;
  /** Patada: la pierna más adelantada (flanco). */
  kick?: boolean;
  /** Guardia (mantenida): los brazos se cruzan delante del cuerpo. */
  guard?: boolean;
  /**
   * Botón de un cuadrante (flanco): brazo izquierdo/derecho o pierna izquierda/derecha, como se ve el chizito al armarlo. Si en
   * ese cuadrante hay varias extremidades, cada toque usa la siguiente (de a una); cada cuadrante va por su lado.
   */
  quad?: Quad;
}

export const IDLE: FightInput = { x: 0 };

type Phase = 'rest' | 'windup' | 'strike' | 'recover';

export interface LimbState {
  q: Q;
  /** rad/s, marco local. */
  w: V3;
  phase: Phase;
  t: number;
  /** Plan del golpe: eje (local), ángulo de carga y ángulo final, a lo largo de ese eje. */
  axis: V3;
  windup: number;
  target: number;
  /** Ángulo recorrido a lo largo del eje (seguido paso a paso para no tomar el camino corto equivocado). */
  phi: number;
  landed: boolean;
  active: boolean;
  /** Cuadros con el freno flojo (erró: lo que se movió sigue de largo). */
  slack: number;
  /** Cuadros de carga del golpe (lo pesado se "endurece" antes de soltarlo; si le pegan mientras carga, lo pierde). */
  charge: number;
  /** Pifió: cuadros que el brazo sigue de largo más allá del objetivo antes de volver. */
  follow: number;
  /** Combinación a la que pertenece este golpe (UNO-DOS, RÁFAGA…) o null. */
  combo: string | null;
}

export interface FighterState {
  model: FighterModel;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** rad: + = la parte de arriba hacia su frente. */
  tilt: number;
  wt: number;
  facing: 1 | -1;
  /** Cuadros desde que se dio vuelta (el render anima el giro de 180°). */
  turnT: number;
  grounded: boolean;
  /** Cuadros seguidos en el aire (las piernas se recogen recién después de unos cuantos). */
  air: number;
  hp: number;
  stun: number;
  block: number;
  dizzy: number;
  dizzyT: number;
  bleed: number[];
  /** 0..1 */
  guard: number;
  crouch: number;
  limbs: LimbState[];
  nextArm: number;
  strikeCool: number;
  /** Cuadros sin poder golpear ni cubrirse (pagando un golpe errado o acertado). */
  lock: number;
  /** Erró y quedó desestabilizado: no vuelve a golpear hasta estabilizarse; si se inclina de más, trastabilla (una vez). */
  wobbly: boolean;
  /** Golpe de cuerpo entero con una pieza fija (chupetín): hacia dónde se balancea (+1 adelante, −1 atrás). */
  swing: { k: number; sign: 1 | -1 } | null;
  /** Se cubre con un escudo: inclinación (rad) para ponerlo de frente; `turned` = se dio vuelta para mostrar la espalda. */
  shieldPose: { tilt: number; turned: boolean } | null;
  buffer: { kind: 'arm' | 'kick' | 'air'; t: number; quad?: Quad } | null;
  /** Por cuadrante: cuál toca la próxima vez (de a una). */
  nextQ: Record<Quad, number>;
  gait: number;
  hopCool: number;
  shields: Record<string, number>;
  broken: string[];
  ko: boolean;
  combo: number;
  lastHit: number;
  /** Apoyo actual en x local (para el contrapeso). */
  support: [number, number] | null;
  /** Posiciones de mundo de los puntos de cada extremidad (x, y intercalados): este paso y el anterior. */
  cur: Float64Array[];
  prev: Float64Array[];
  /** Fijos a la vista: velocidad, salto, etc. */
  speed: number;
  jump: number;
  legs: number[];
  arms: number[];
  /** kg·m² alrededor del centro de masa (para la inclinación). */
  It: number;
  /** Postura de cada pierna: girada para que TODAS apoyen (las largas se abren, las cortas se estiran). */
  stance: Q[];
  /** Piernas fijas (chupetín o vara que atraviesa, abajo y hacia el piso): apoyan y patean con el cuerpo entero. */
  pegs: number[];
  /** Cuadros que le quedan agachándose antes de saltar; `squatN` = cuánto tarda según sus piernas. */
  squat: number;
  squatN: number;
  /** Cadena de golpes acertados (para las combinaciones): cuántos, de qué tipo el último y cuadros para seguirla. */
  chain: { n: number; last: 'arm' | 'kick'; t: number } | null;
  /** Cuadros en que una piña sale como CONTRA (después de bloquear con la guardia). */
  counter: number;
  /** rad: giro hacia la cámara (base del modelo + torso), con su coseno y seno. */
  yaw: number;
  /** rad: giro del torso al pegar (se suma al del modelo). */
  twist: number;
  /** Centro de masa hacia el rival (marco local, del paso anterior): las piernas apoyadas ponen el pie debajo. */
  comX: number;
  yc: number;
  ys: number;
}

export type FightEvent =
  | { type: 'hit'; by: 0 | 1; at: [number, number]; damage: number; kind: HitKind; blocked: boolean; shield: boolean; piece: string; speed: number; combo: number; heavy: boolean; chain: string | null }
  | { type: 'shieldBreak'; who: 0 | 1; piece: string; at: [number, number]; vel: [number, number] }
  | { type: 'swing'; who: 0 | 1; limb: number; heavy: boolean }
  | { type: 'whiff'; who: 0 | 1; heavy: boolean; lock: number }
  | { type: 'jump' | 'land' | 'dizzy' | 'ko' | 'stumble'; who: 0 | 1 }
  | { type: 'round'; round: number }
  | { type: 'fight' }
  | { type: 'roundEnd'; winner: 0 | 1 | 'draw'; reason: 'ko' | 'time' }
  | { type: 'matchEnd'; winner: 0 | 1 };

export interface Match {
  frame: number;
  round: number;
  wins: [number, number];
  /** Cuadros que le quedan al round. */
  timer: number;
  phase: 'intro' | 'fight' | 'ko' | 'end' | 'over';
  phaseT: number;
  f: [FighterState, FighterState];
  events: FightEvent[];
  hitstop: number;
  roundWinner: 0 | 1 | 'draw' | null;
  winner: 0 | 1 | null;
}

const dt = FIGHT.dt;
const G = FIGHT.gravity;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dotv = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossv = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lenv = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const normv = (a: V3): V3 => {
  const l = lenv(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Rotación de `v` por `q` (inline de qRot para el bucle caliente). */
function rot(q: Q, v: V3): V3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Punto de una extremidad (local, en reposo) llevado a su pose actual (local). */
const posed = (q: Q, pivot: V3, p: V3): V3 => addv(pivot, rot(q, sub(p, pivot)));

// Perfil 3D: el frente de la criatura (la cara que marca la F en el constructor) mira al rival, girado `stanceYaw` hacia la
// cámara (guardia de 3/4). Al cambiar de lado gira de verdad 180°: lo que daba a la cámara pasa a quedar del otro lado.
// Cada luchador tiene su giro (`f.yaw`: el de su modelo, más el giro del torso al pegar).
/** Coordenada "hacia el rival" de un punto (o dirección) local. */
const fwd = (f: FighterState, p: V3): number => p[0] * f.yc - f.facing * p[2] * f.ys;
/** Eje "hacia el rival" en el marco local. */
const fwdAxis = (f: FighterState): V3 => [f.yc, 0, -f.facing * f.ys];
/** Eje de la marcha (perpendicular al avance y a la vertical), en el marco local. */
const gaitAxis = (f: FighterState): V3 => [f.facing * f.ys, 0, f.yc];

function makeFighter(model: FighterModel, x: number, facing: 1 | -1): FighterState {
  // Solo lo articulado camina o pega; lo rígido (chupetín, varas que atraviesan) es peso y apoyo.
  const legs = model.limbs.map((l, i) => (l.role === 'leg' && !l.rigid ? i : -1)).filter((i) => i >= 0);
  const pegs = model.limbs.map((l, i) => (l.role === 'leg' && l.rigid ? i : -1)).filter((i) => i >= 0);
  // Brazos en orden "brazo 1, brazo 2…": del más adelantado al más atrasado.
  // Los brazos fijos (chupetín, lo que atraviesa) también pegan, pero con el cuerpo entero.
  const arms = model.limbs
    .map((l, i) => (l.role === 'arm' ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => model.limbs[b].pivot[0] + model.limbs[b].dir[0] * model.limbs[b].reach - (model.limbs[a].pivot[0] + model.limbs[a].dir[0] * model.limbs[a].reach));
  const legLen = legs.length ? legs.reduce((s, i) => s + model.limbs[i].reach, 0) / legs.length : 0.02;
  // Las piernas tienen que poder con el peso: si cargan menos que la masa, camina lento; muy cargadas, ni saltan.
  const carry = legs.reduce((s, i) => s + model.limbs[i].carry, 0) / model.mass;
  const massF = legs.length
    ? clamp(Math.pow(carry, FIGHT.carrySpeedExp), FIGHT.speedClamp[0], FIGHT.speedClamp[1])
    : clamp(Math.pow(FIGHT.massRef / model.mass, FIGHT.massSpeedExp), FIGHT.speedClamp[0], FIGHT.speedClamp[1]);
  const legF = FIGHT.legSpeed[Math.min(2, legs.length)] * (legs.length ? clamp(Math.pow(legLen / 0.022, 0.35), 0.75, 1.25) : 1);
  // Cada pierna empuja según su pieza: la rapidez promedio manda en la marcha; la fuerza total frente al peso, en el salto.
  const quick = legs.length ? legs.reduce((s, i) => s + model.limbs[i].quick, 0) / legs.length : 1;
  const power = legs.reduce((s, i) => s + model.limbs[i].power, 0);
  const jump = legs.length && carry >= FIGHT.jumpMinCarry ? clamp(FIGHT.jumpSpeed * Math.sqrt(power / (model.mass * 1000) / FIGHT.jumpRef), FIGHT.jumpClamp[0], FIGHT.jumpClamp[1]) : 0;
  // Postura: el piso queda a la altura que alcanza la pierna más corta (o apenas bajo el cuerpo); cada pierna gira hacia abajo
  // o hacia afuera lo justo para tocarlo. Así se para sobre todas, no sobre la más larga.
  const stance: Q[] = model.limbs.map(() => QI());
  if (legs.length) {
    const bottom = Math.min(...model.body.map((b) => Math.min(b.a[1], b.b[1]) - b.r));
    const ground = Math.min(Math.max(...legs.map((k) => model.limbs[k].pivot[1] - model.limbs[k].reach)), bottom - 0.001);
    for (const k of legs) {
      const l = model.limbs[k];
      const axis = crossv(l.dir, [0, -1, 0]);
      if (lenv(axis) < 1e-6) continue;
      const a0 = Math.acos(clamp(-l.dir[1], -1, 1));
      const a = Math.acos(clamp((l.pivot[1] - ground) / l.reach, -1, 1));
      stance[k] = qAxis(normv(axis), clamp(a0 - a, -FIGHT.stanceMax, FIGHT.stanceMax));
    }
  }
  let It = model.bodyMass * (0.6 * 0.025 * 0.025);
  for (const l of model.limbs) for (const p of l.points) It += p.m * (p.p[0] * p.p[0] + p.p[1] * p.p[1]);
  for (const p of model.armor) It += p.m * (p.p[0] * p.p[0] + p.p[1] * p.p[1]);
  const f: FighterState = {
    model,
    x,
    y: 0.04,
    vx: 0,
    vy: 0,
    tilt: 0,
    wt: 0,
    facing,
    turnT: 99,
    grounded: false,
    air: 0,
    hp: FIGHT.hp,
    stun: 0,
    block: 0,
    dizzy: 0,
    dizzyT: 0,
    bleed: [],
    guard: 0,
    crouch: 0,
    limbs: model.limbs.map((_, i) => ({ q: stance[i], w: [0, 0, 0], phase: 'rest', t: 0, axis: [0, 0, 1], windup: 0, target: 0, phi: 0, landed: false, active: false, slack: 0, charge: 0, follow: 0, combo: null })),
    nextArm: 0,
    strikeCool: 0,
    lock: 0,
    wobbly: false,
    swing: null,
    shieldPose: null,
    buffer: null,
    nextQ: { LA: 0, RA: 0, LL: 0, RL: 0 },
    gait: 0,
    hopCool: 0,
    shields: { ...model.shields },
    broken: [],
    ko: false,
    combo: 0,
    lastHit: -999,
    support: null,
    cur: model.limbs.map((l) => new Float64Array(l.points.length * 2)),
    prev: model.limbs.map((l) => new Float64Array(l.points.length * 2)),
    speed: FIGHT.walkSpeed * massF * legF * quick,
    jump,
    legs,
    arms,
    It,
    stance,
    pegs,
    squat: 0,
    squatN: Math.round(FIGHT.squat.base + FIGHT.squat.slow * Math.max(0, 1 / quick - 0.75)),
    chain: null,
    counter: 0,
    yaw: model.yaw ?? FIGHT.stanceYaw,
    twist: 0,
    comX: 0,
    yc: Math.cos(model.yaw ?? FIGHT.stanceYaw),
    ys: Math.sin(model.yaw ?? FIGHT.stanceYaw),
  };
  // Apoyarlo en el piso antes del primer cuadro.
  settle(f);
  f.prev = f.cur.map((a) => a.slice());
  return f;
}

/** Empieza una pelea: el jugador (0) a la izquierda mirando a la derecha, el rival (1) a la derecha. */
export function createMatch(models: [FighterModel, FighterModel]): Match {
  const m: Match = {
    frame: 0,
    round: 1,
    wins: [0, 0],
    timer: FIGHT.roundSeconds * 60,
    phase: 'intro',
    phaseT: 0,
    f: [makeFighter(models[0], -FIGHT.startGap / 2, 1), makeFighter(models[1], FIGHT.startGap / 2, -1)],
    events: [{ type: 'round', round: 1 }],
    hitstop: 0,
    roundWinner: null,
    winner: null,
  };
  return m;
}

function resetRound(m: Match): void {
  m.f = [makeFighter(m.f[0].model, -FIGHT.startGap / 2, 1), makeFighter(m.f[1].model, FIGHT.startGap / 2, -1)];
  m.timer = FIGHT.roundSeconds * 60;
  m.phase = 'intro';
  m.phaseT = 0;
  m.roundWinner = null;
  m.events.push({ type: 'round', round: m.round });
}

// ───────────────────────── Geometría de mundo ─────────────────────────

/** Local (sin girar extremidades) → mundo 2D, con la inclinación y el lado al que mira. */
function toWorld(f: FighterState, p: V3): [number, number] {
  const c = Math.cos(f.tilt);
  const s = Math.sin(f.tilt);
  const fx = fwd(f, p);
  const x = fx * c + p[1] * s;
  const y = -fx * s + p[1] * c;
  return [f.x + f.facing * x, f.y + y];
}

/** Recalcula los puntos de mundo y apoya el cuerpo en el piso (lo más bajo toca y = 0). Devuelve si aterrizó. */
function settle(f: FighterState, stick = false): boolean {
  const M = f.model;
  let low = Infinity;
  for (const b of M.body) {
    for (const e of [b.a, b.b]) low = Math.min(low, toWorld(f, e)[1] - b.r);
  }
  for (const p of M.armor) if (!f.broken.includes(p.piece)) low = Math.min(low, toWorld(f, p.p)[1] - p.r * 0.5);
  M.limbs.forEach((l, k) => {
    const q = f.limbs[k].q;
    const arr = f.cur[k];
    l.points.forEach((p, j) => {
      const w = toWorld(f, posed(q, l.pivot, p.p));
      arr[2 * j] = w[0];
      arr[2 * j + 1] = w[1];
      if (!p.inside && !f.broken.includes(p.piece)) low = Math.min(low, w[1] - p.r * 0.5);
    });
  });
  let landed = false;
  const wasAir = !f.grounded;
  // `stick`: venía apoyado y no está saltando: baja hasta tocar (equivale a girar sobre el punto de apoyo, no sobre el centro).
  if (low < 0 || (stick && low < FIGHT.stickMax)) {
    f.y -= low;
    for (const arr of f.cur) for (let j = 1; j < arr.length; j += 2) arr[j] -= low;
    if (f.vy < 0) {
      landed = wasAir && f.vy < -0.15;
      f.vy = f.vy < -0.3 ? -f.vy * FIGHT.landBounce : 0;
    }
    f.grounded = true;
  } else f.grounded = low < 0.0015;
  // Apoyo (x local, SIN inclinación: si no, la propia inclinación cambia el apoyo y se realimenta): lo más bajo del cuerpo.
  if (f.grounded) {
    const pts: [number, number][] = [];
    for (const b of M.body) for (const e of [b.a, b.b]) pts.push([fwd(f, e), e[1] - b.r]);
    M.limbs.forEach((l, k) => {
      const q = f.limbs[k].q;
      for (const p of l.points) {
        if (p.inside || f.broken.includes(p.piece)) continue;
        const v = posed(q, l.pivot, p.p);
        pts.push([fwd(f, v), v[1] - p.r * 0.5]);
      }
    });
    const lowY = Math.min(...pts.map((p) => p[1]));
    const touch = pts.filter((p) => p[1] < lowY + FIGHT.supportBand).map((p) => p[0]);
    f.support = [Math.min(...touch), Math.max(...touch)];
  } else f.support = null;
  return landed;
}

/** Inercia de una extremidad alrededor del eje `a` (local, unitario) que pasa por su pivote, en la pose `q`. */
function inertia(f: FighterState, k: number, a: V3): number {
  const l = f.model.limbs[k];
  const ar = rot(qConj(f.limbs[k].q), a); // el eje llevado al marco de reposo
  let I = 0;
  for (const p of l.points) {
    const r = sub(p.p, l.pivot);
    const c = crossv(r, ar);
    I += p.m * dotv(c, c);
  }
  return Math.max(I, 1e-9);
}

/** Motor de una articulación: lleva `q` hacia `target` con frecuencia `wn` y amortiguación `zeta`, sin pasar el torque máximo. */
function drive(f: FighterState, k: number, target: Q, gains: { wn: number; zeta: number }, boost = 1): number {
  const s = f.limbs[k];
  const e = qToVec(qMul(target, qConj(s.q)));
  const a: V3 = [
    gains.wn * gains.wn * e[0] - 2 * gains.zeta * gains.wn * s.w[0],
    gains.wn * gains.wn * e[1] - 2 * gains.zeta * gains.wn * s.w[1],
    gains.wn * gains.wn * e[2] - 2 * gains.zeta * gains.wn * s.w[2],
  ];
  const al = lenv(a);
  if (al < 1e-12) return 0;
  const I = inertia(f, k, scl(a, 1 / al));
  // Frenar cuesta menos que arrancar (músculo + rozamiento del agujero): el golpe se corta en seco y no da la vuelta.
  // Después de errar el freno queda flojo: lo que se movió sigue de largo.
  const braking = dotv(a, s.w) < 0 && s.slack <= 0 ? FIGHT.brakeBoost : 1;
  const tauMax = FIGHT.tau0 * Math.pow(I / FIGHT.I0, FIGHT.tauExp) * boost * braking;
  const k2 = Math.min(1, tauMax / I / al);
  const acc = scl(a, k2);
  s.w = addv(s.w, scl(acc, dt));
  s.q = qIntegrate(s.q, s.w, dt);
  s.phi += dotv(s.w, s.axis) * dt;
  // Reacción sobre el cuerpo: solo la componente que inclina (alrededor de la profundidad del plano de la pelea).
  return I * dotv(acc, gaitAxis(f));
}

/** Ángulo recorrido a lo largo del eje del golpe (proyección de la rotación actual). */
const phiOf = (s: LimbState): number => dotv(qToVec(s.q), s.axis);

// ───────────────────────── Golpes ─────────────────────────

function startStrike(m: Match, i: 0 | 1, k: number, kind: 'arm' | 'kick' | 'air', combo: string | null = null): void {
  const f = m.f[i];
  const foe = m.f[1 - i];
  const l = f.model.limbs[k];
  const s = f.limbs[k];
  const d0 = l.dir;
  // Hacia dónde: el centro del rival visto desde la articulación (local), siempre hacia adelante.
  let tx = (foe.x - f.x) * f.facing - fwd(f, l.pivot);
  let ty = foe.y + (kind === 'kick' ? -0.012 : 0.004) - f.y - l.pivot[1];
  if (kind === 'air') ty -= Math.abs(tx) * 0.9;
  tx = Math.max(tx, Math.abs(ty) * 0.35 + 0.004);
  // Hacia el rival en 3D: la dirección de avance (con la postura de 3/4) y la altura.
  const T = normv(addv(scl(fwdAxis(f), tx), [0, ty, 0]));
  let axis = crossv(d0, T);
  const sn = lenv(axis);
  const cs = dotv(d0, T);
  const heavy = l.kind === 'heavy';
  let target: number;
  let windup = -(heavy ? FIGHT.windupHeavy : FIGHT.windup);
  if (sn < 0.25 && cs > 0) {
    // Ya apunta al rival: hachazo de arriba hacia abajo.
    axis = crossv(d0, [0, -1, 0]);
    if (lenv(axis) < 1e-6) axis = [0, 0, -1];
    target = 0.5;
    windup = -1.05;
  } else if (sn < 0.25) {
    // Apunta para atrás: pasa por arriba (mazazo).
    axis = crossv(d0, [0, 1, 0]);
    if (lenv(axis) < 1e-6) axis = [0, 0, -1];
    target = Math.PI + FIGHT.overshoot * 0.5;
    windup = -0.3;
  } else target = Math.atan2(sn, cs) + FIGHT.overshoot;
  s.axis = normv(axis);
  s.windup = windup;
  s.target = target;
  s.phi = phiOf(s);
  s.w = [0, 0, 0];
  s.phase = 'windup';
  s.t = 0;
  s.landed = false;
  s.active = false;
  s.follow = 0;
  s.combo = combo;
  // Lo pesado se carga: cuanto más pesa frente al chizito, más tarda (y más tiempo queda expuesto a que le corten la carga).
  // El chupetín carga echándose atrás (se ve): con tope, para que llegue a salir. En una combinación no hay carga.
  const ratio = (l.mass / f.model.bodyMass) * (l.rigid ? FIGHT.swing.chargeMul : 1);
  s.charge = combo ? 0 : Math.min(l.rigid ? FIGHT.swing.maxCharge : 99, Math.round(FIGHT.charge.k * Math.max(0, ratio - FIGHT.charge.free)));
  if (combo) s.windup *= 0.5;
  if (combo === 'CONTRA') f.counter = 0;
  if (l.rigid) {
    // Pieza fija: no gira sola; se balancea la criatura entera. Si la masa está arriba del centro, hacia adelante.
    let cy = 0;
    for (const p of l.points) cy += p.m * p.p[1];
    f.swing = { k, sign: cy >= 0 ? 1 : -1 };
  }
  f.strikeCool = FIGHT.strikeGap;
  m.events.push({ type: 'swing', who: i, limb: k, heavy });
}

const ready = (s: LimbState): boolean => s.phase === 'rest' || (s.phase === 'recover' && s.t > 7);

/**
 * Qué combinación sería el próximo golpe de este tipo (o null). Solo se encadena después de ACERTAR (el otro queda aturdido y el
 * impulso sigue): con otro brazo (UNO-DOS), una tercera piña si hay 3 brazos (RÁFAGA), una patada parado en otra pierna (PIÑA Y
 * PATADA); y una piña justo después de bloquear (CONTRA).
 */
function comboFor(f: FighterState, kind: 'arm' | 'kick' | 'air'): string | null {
  if (kind === 'arm' && f.counter > 0 && f.arms.length) return 'CONTRA';
  const c = f.chain;
  if (!c || c.t <= 0) return null;
  const arms = f.arms.filter((k) => !f.model.limbs[k].rigid).length;
  if (kind === 'arm' && c.last === 'arm') return c.n === 1 && arms >= 2 ? 'UNO-DOS' : c.n >= 2 && c.n < arms ? 'RÁFAGA' : null;
  if (kind === 'kick' && c.last === 'arm' && f.legs.length >= 2) return 'PIÑA Y PATADA';
  return null;
}

/**
 * Con el botón de un cuadrante: la siguiente extremidad lista de ESE cuadrante (de a una; cada cuadrante lleva su cuenta). Sin
 * cuadrante (la máquina, Z/X): piña = el brazo siguiente; patada = la pierna lista más adelantada. Sin brazos no hay piña, sin
 * piernas no hay patada.
 */
function pickLimb(f: FighterState, kind: 'arm' | 'kick' | 'air', chained = false, quad?: Quad): number {
  const L = f.model.limbs;
  if (quad) {
    const side = quad[0] as 'L' | 'R';
    // Una pierna fija (chupetín abajo) patea con el cuerpo entero, pero necesita otra pierna para pararse (contrapeso).
    const pool = (kind === 'kick' ? (chained || !f.legs.length ? f.legs : [...f.legs, ...f.pegs]) : f.arms).filter((k) => L[k].side === side && !(chained && L[k].rigid));
    for (let n = 0; n < pool.length; n++) {
      const idx = (f.nextQ[quad] + n) % pool.length;
      if (!ready(f.limbs[pool[idx]])) continue;
      f.nextQ[quad] = idx + 1;
      return pool[idx];
    }
    return -1;
  }
  if (kind === 'kick') {
    const ahead = (k: number): number => fwd(f, L[k].pivot) + fwd(f, L[k].dir) * L[k].reach;
    // Una pierna fija (chupetín abajo) patea con el cuerpo entero, pero necesita otra pierna para pararse (contrapeso).
    const pool = chained || !f.legs.length ? f.legs : [...f.legs, ...f.pegs];
    const c = pool.filter((k) => ready(f.limbs[k])).sort((a, b) => ahead(b) - ahead(a));
    return c.length ? c[0] : -1;
  }
  for (let n = 0; n < f.arms.length; n++) {
    const idx = (f.nextArm + n) % f.arms.length;
    // En una combinación lo pesado fijo (chupetín) no entra: no se puede soltar tan rápido.
    if (chained && L[f.arms[idx]].rigid) continue;
    if (ready(f.limbs[f.arms[idx]])) {
      f.nextArm = idx + 1;
      return f.arms[idx];
    }
  }
  return -1;
}

/**
 * Terminó un golpe. Si erró, lo que se movió sigue de largo: el giro que traía pasa al cuerpo (lo inclina y lo arrastra), el
 * freno queda flojo un rato y la criatura pierde tiempo de reacción en proporción a lo que pesa la extremidad frente al chizito.
 */
function endStrike(m: Match, i: 0 | 1, k: number): void {
  const f = m.f[i];
  const l = f.model.limbs[k];
  const s = f.limbs[k];
  s.phase = 'recover';
  s.t = 0;
  s.active = false;
  if (s.landed) {
    f.lock = Math.max(f.lock, FIGHT.hitLock);
    f.swing = null;
    return;
  }
  const W = FIGHT.whiff;
  f.chain = null;
  const mul = l.rigid ? FIGHT.swing.whiffMul : 1;
  const lock = Math.min(W.max * mul, Math.round((W.base + W.k * (l.mass / f.model.bodyMass)) * mul));
  f.lock = Math.max(f.lock, lock);
  if (l.rigid && f.swing) {
    // El cuerpo entero sigue de largo con el peso: fuerza centrípeta sin nada que la frene.
    f.wt += f.swing.sign * FIGHT.swing.whiffKick;
  } else {
    const wAx = dotv(s.w, s.axis);
    const I = inertia(f, k, s.axis);
    f.wt += (W.transfer * I * wAx * dotv(s.axis, gaitAxis(f))) / f.It;
    f.vx += f.facing * (W.lurchBase + W.lurch * (l.mass / f.model.mass) * Math.abs(wAx) * l.reach);
    // No encontró nada que lo frene: el brazo sigue de largo, más cuanto más pesa.
    s.follow = FIGHT.follow.frames;
    s.target += FIGHT.follow.angle + FIGHT.follow.k * (l.mass / f.model.bodyMass);
  }
  s.slack = W.slack;
  f.wobbly = true;
  m.events.push({ type: 'whiff', who: i, heavy: l.kind === 'heavy' || l.rigid, lock });
  f.swing = null;
}

// ───────────────────────── Escudos ─────────────────────────

/** El escudo entero con más golpes por aguantar (o null). */
function liveShield(f: FighterState): string | null {
  let best: string | null = null;
  for (const [id, n] of Object.entries(f.shields)) if (n > 0 && !f.broken.includes(id) && (!best || n > f.shields[best])) best = id;
  return best;
}

/**
 * Cómo ponerse para cubrirse con ESE escudo: se mide dónde está (centro de sus puntos, en el plano de la pelea) y el cuerpo se
 * inclina lo necesario para dejarlo de frente: en la cabeza → inclina la cabeza hacia adelante; abajo → se pone de cabeza; en la
 * espalda → se da vuelta.
 */
function shieldPose(f: FighterState, id: string): { tilt: number; turned: boolean } {
  // Dónde está el escudo en el marco PROPIO de la criatura (x = su frente, y = arriba): no cambia al darse vuelta.
  let x = 0;
  let y = 0;
  let n = 0;
  const add = (p: V3): void => {
    x += p[0];
    y += p[1];
    n++;
  };
  for (const p of f.model.armor) if (p.piece === id) add(p.p);
  f.model.limbs.forEach((l, k) => l.points.forEach((p) => p.piece === id && add(posed(f.limbs[k].q, l.pivot, p.p))));
  if (!n) return { tilt: 0, turned: false };
  const a = Math.atan2(y / n, x / n);
  const turned = Math.abs(a) > FIGHT.shieldBack;
  // Inclinar +t lleva la parte de arriba hacia el frente: un punto a ángulo a pasa a a − t. De frente: t = a; de espaldas (dado
  // vuelta, el rival queda atrás, a ±π): t = a ∓ π.
  const t = turned ? a - Math.PI * Math.sign(a) : a;
  return { tilt: Math.abs(t) < FIGHT.shieldFront ? 0 : clamp(t, -Math.PI * 0.9, Math.PI * 0.9), turned };
}

// ───────────────────────── Paso de un luchador ─────────────────────────

function stepFighter(m: Match, i: 0 | 1, inp: FightInput): void {
  const f = m.f[i];
  const foe = m.f[1 - i];
  const M = f.model;
  const fighting = m.phase === 'fight';
  if (f.stun > 0) f.stun--;
  if (f.block > 0) f.block--;
  if (f.strikeCool > 0) f.strikeCool--;
  if (f.lock > 0) f.lock--;
  // Después de pifiar no alcanza con esperar: tiene que volver a estabilizarse (dejar de bambolearse) para poder golpear.
  if (f.wobbly && f.lock === 0 && Math.abs(f.wt) < FIGHT.stableW) f.wobbly = false;
  if (f.hopCool > 0) f.hopCool--;
  if (f.counter > 0) f.counter--;
  if (f.chain && --f.chain.t <= 0) f.chain = null;
  if (f.dizzyT > 0) f.dizzyT--;
  f.dizzy = Math.max(0, f.dizzy - FIGHT.dizzyDecay);
  f.turnT++;
  if (f.buffer && --f.buffer.t <= 0) f.buffer = null;
  const canAct = fighting && !f.ko && f.stun <= 0 && f.block <= 0;
  const input = canAct ? inp : IDLE;
  const busy = f.limbs.some((s) => s.phase === 'windup' || s.phase === 'strike');

  // Mira siempre al rival (como en los juegos de pelea): giro de 180°, no espejo.
  const toFoeRaw: 1 | -1 = foe.x >= f.x ? 1 : -1;
  // Escudo en la espalda: se da vuelta y le muestra la papita al rival.
  const toFoe: 1 | -1 = f.shieldPose?.turned ? (-toFoeRaw as 1 | -1) : toFoeRaw;
  if (!f.ko && f.grounded && !busy && toFoe !== f.facing && Math.abs(foe.x - f.x) > 0.004) {
    f.facing = toFoe;
    f.turnT = 0;
    f.tilt = -f.tilt;
    f.wt = -f.wt;
  }

  // Cubrirse: con un escudo (papita, nacho) si le queda alguno; si no, con los brazos. No mientras paga un golpe.
  const shield = liveShield(f);
  const guardHeld = !!input.guard && f.grounded && f.lock <= 0 && (f.arms.length > 0 || !!shield);
  f.shieldPose = guardHeld && shield ? shieldPose(f, shield) : null;
  const crouchHeld = (!!input.down && f.grounded && !guardHeld) || f.squat > 0;
  f.guard += ((guardHeld ? 1 : 0) - f.guard) * 0.22;
  f.crouch += ((crouchHeld ? 1 : 0) - f.crouch) * (f.squat > 0 ? 0.45 : 0.2);
  if (input.punch) f.buffer = { kind: f.grounded ? 'arm' : 'air', t: FIGHT.buffer };
  if (input.quad) f.buffer = { kind: input.quad[1] === 'L' ? 'kick' : f.grounded ? 'arm' : 'air', t: FIGHT.buffer, quad: input.quad };
  if (input.kick) f.buffer = { kind: 'kick', t: FIGHT.buffer };
  // Saltar necesita piernas que aguanten el peso (`f.jump` es 0 si no). Primero se agacha (las piernas lentas tardan más) y
  // recién ahí despega: el salto se lee y se puede castigar.
  if (input.up && f.grounded && !guardHeld && f.jump > 0 && f.squat <= 0 && !busy) f.squat = f.squatN;
  if (f.squat > 0 && --f.squat === 0 && f.grounded && !f.ko) {
    f.vy = f.jump;
    f.vx += input.x * f.speed * 0.4;
    f.grounded = false;
    m.events.push({ type: 'jump', who: i });
  }
  // Un golpe por vez: no arranca otro mientras uno carga o pega, ni mientras paga el anterior (salvo una combinación, que sigue
  // el impulso del golpe que acertó).
  if (f.buffer && canAct && !busy && !f.wobbly && f.guard < 0.3 && f.squat <= 0) {
    const combo = comboFor(f, f.buffer.kind);
    if ((f.strikeCool <= 0 && f.lock <= 0) || combo) {
      const k = pickLimb(f, f.buffer.kind, !!combo, f.buffer.quad);
      if (k >= 0) {
        startStrike(m, i, k, f.buffer.kind, combo);
        f.buffer = null;
      }
    }
  }

  // ── Articulaciones ──
  const moving = Math.abs(f.vx) > 0.01 && f.grounded;
  const gaitAmp = moving ? FIGHT.gait * clamp(Math.abs(f.vx) / Math.max(f.speed, 1e-3), 0.3, 1) : 0;
  const legLen = f.legs.length ? f.legs.reduce((s, k) => s + M.limbs[k].reach, 0) / f.legs.length : 0.02;
  f.gait += (Math.abs(f.vx) * dt * Math.PI * 2) / (FIGHT.strideK * legLen);
  let react = 0;
  M.limbs.forEach((l, k) => {
    const s = f.limbs[k];
    if (l.rigid) {
      // El chupetín y lo que atraviesa no giran: si pegan, pega el cuerpo entero (ver la inclinación más abajo).
      if (s.phase !== 'rest') s.t++;
      if (s.phase === 'windup' && s.t >= FIGHT.swing.windFrames + s.charge) {
        s.phase = 'strike';
        s.t = 0;
        // Se tira con el cuerpo entero hacia el rival.
        f.vx += f.facing * FIGHT.swing.lunge * (f.grounded ? 1 : 0.3);
      } else if (s.phase === 'strike') {
        s.active = !s.landed && s.t < FIGHT.swing.strikeFrames && Math.abs(f.wt) > FIGHT.swing.activeW;
        if (s.t >= FIGHT.swing.strikeFrames || s.landed) endStrike(m, i, k);
      } else if (s.phase === 'recover' && s.t > FIGHT.recoverMax) s.phase = 'rest';
      return;
    }
    s.t++;
    if (s.slack > 0) s.slack--;
    // Golpe y vuelta: se sigue el ángulo a lo largo del eje del golpe con un objetivo que avanza delante del ángulo actual,
    // así un mazazo de 200° va por arriba (y vuelve por arriba) en vez de tomar el atajo.
    const guided = (goal: number, g: { wn: number; zeta: number }, boost = 1): void => {
      const lead = clamp(goal, s.phi - 1.5, s.phi + 1.5);
      react += drive(f, k, qAxis(s.axis, lead), g, boost);
    };
    if (s.phase === 'windup') {
      // Mientras carga, la extremidad tiembla apenas (se está "endureciendo").
      react += drive(f, k, qAxis(s.axis, clamp(s.windup, s.phi - 1.5, s.phi + 1.5) + (s.charge ? Math.sin(s.t * 1.7) * FIGHT.charge.tremble : 0)), FIGHT.joint.windup);
      if ((Math.abs(s.phi - s.windup) < 0.12 && s.t >= FIGHT.windMin + s.charge) || s.t > FIGHT.windMax + s.charge) {
        s.phase = 'strike';
        s.t = 0;
        // Al soltar el peso va adelante: el cuerpo acompaña la piña (una patada empuja menos: se para en la otra pierna).
        f.vx += f.facing * FIGHT.lunge * (f.grounded ? 1 : 0.3) * (1 - f.crouch) * (l.role === 'leg' ? 0.5 : 1);
      }
      return;
    }
    if (s.phase === 'strike') {
      guided(s.target, FIGHT.joint.strike, FIGHT.strikeBoost);
      s.active = !s.landed && s.phi < s.target - 0.12 && s.t < FIGHT.strikeMax;
      if (!s.active && (dotv(s.w, s.axis) < 1 || s.t >= FIGHT.strikeMax || s.landed)) endStrike(m, i, k);
      return;
    }
    if (s.phase === 'recover' && s.follow > 0) {
      // Pifió: sigue de largo con el freno flojo, y recién después vuelve.
      s.follow--;
      guided(s.target, FIGHT.joint.recover);
      return;
    }
    if (s.phase === 'recover' && Math.abs(s.phi) > 0.45 && s.t < FIGHT.recoverMax) {
      guided(0, FIGHT.joint.recover);
      return;
    }
    s.active = false;
    if (s.phase === 'recover' && s.t > FIGHT.recoverMax) s.phase = 'rest';
    let target: Q = QI();
    let g: { wn: number; zeta: number } = s.phase === 'recover' ? FIGHT.joint.recover : FIGHT.joint.rest;
    if (f.ko) target = qAxis(gaitAxis(f), l.role === 'leg' ? 0.5 : 1.2);
    else if (l.role === 'leg' && f.legs.length) {
      const n = f.legs.indexOf(k);
      const front = fwd(f, l.dir) >= 0 ? 1 : -1;
      let ang = gaitAmp * Math.sin(f.gait + (n % 2) * Math.PI) + front * FIGHT.crouch * f.crouch;
      if (f.air > 5) ang = front * 0.35 + (f.vy > 0 ? -0.15 : 0.1);
      // Parado sobre sus piernas: si el cuerpo se inclina, las piernas se acomodan para seguir apoyando debajo.
      else if (f.legs.length >= 2) {
        ang += FIGHT.legPlant * f.tilt;
        // Sostenerse: el pie apoyado va debajo del centro de masa (mucho más si otra pierna está pateando: se para en ésta).
        const kicking = f.legs.some((j) => j !== k && (f.limbs[j].phase === 'windup' || f.limbs[j].phase === 'strike'));
        const foot = fwd(f, posed(f.stance[k], l.pivot, addv(l.pivot, scl(l.dir, l.reach))));
        const gain = kicking ? FIGHT.support.kick : FIGHT.support.rest;
        if (s.phase === 'rest' || s.phase === 'recover') ang += clamp((gain * (f.comX - foot)) / l.reach, -FIGHT.support.max, FIGHT.support.max);
      }
      // Postura (todas las piernas apoyan) y, encima, el paso.
      target = qMul(qAxis(gaitAxis(f), ang), f.stance[k]);
    } else if (l.role === 'arm' && f.guard > 0.02 && s.phase === 'rest' && !f.shieldPose) {
      // Guardia: los brazos se cruzan DELANTE del cuerpo en diagonal (uno arriba, tapando la cabeza, y otro abajo), así son
      // ellos los que reciben el golpe. Lo que pase por fuera de los brazos, pega.
      const n = f.arms.indexOf(k);
      // Delante de lo que más sobresale del cuerpo hacia el rival (con el 3/4, la copa del brócoli asoma más que el tallo).
      const gx = Math.max(...M.body.map((b) => Math.max(fwd(f, b.a), fwd(f, b.b)) + b.r)) + l.reach * 0.3;
      // El de arriba tapa la cabeza (lo que más asoma con el 3/4: la copa del brócoli, la punta del chizito).
      const gy = l.pivot[1] + l.reach * (n % 2 === 0 ? 0.8 : -0.4);
      const gq = qFromTo(l.dir, normv(addv(scl(fwdAxis(f), Math.max(gx - fwd(f, l.pivot), l.reach * 0.25)), [0, gy - l.pivot[1], 0])));
      target = slerpI(gq, f.guard);
      g = FIGHT.joint.guard;
    } else if (f.air > 5 && l.role === 'arm') target = qAxis(gaitAxis(f), 0.3);
    react += drive(f, k, target, g);
  });

  // ── Torso: gira con el golpe (el hombro que pega va atrás al cargar y adelante al soltar) ──
  {
    const base = M.yaw ?? FIGHT.stanceYaw;
    const T = FIGHT.twist;
    let want = 0;
    let rate: number = T.rate.rest;
    const sk = f.limbs.findIndex((q, j) => !M.limbs[j].rigid && (q.phase === 'windup' || q.phase === 'strike'));
    if (sk >= 0 && !f.ko) {
      const l = M.limbs[sk];
      // Hacia dónde girar para llevar ESE hombro hacia el rival: derivada de fwd(pivote) respecto del giro.
      const d = -l.pivot[0] * f.ys - f.facing * l.pivot[2] * f.yc;
      const sg = Math.sign(d) || 1;
      const amt = l.role === 'leg' ? T.kick : T.arm;
      want = f.limbs[sk].phase === 'windup' ? -sg * amt * T.wind : sg * amt;
      rate = f.limbs[sk].phase === 'windup' ? T.rate.windup : T.rate.strike;
    }
    f.twist += (want - f.twist) * Math.min(1, rate * dt);
    f.yaw = clamp(base + f.twist, T.min, T.max);
    f.yc = Math.cos(f.yaw);
    f.ys = Math.sin(f.yaw);
  }

  // ── Cuerpo: avanzar ──
  const wantVx = canAct ? input.x * f.speed * (1 - 0.65 * f.guard) * (1 - f.crouch) : 0;
  const acc = f.grounded ? FIGHT.groundAccel : FIGHT.airAccel;
  if (f.grounded || input.x !== 0) f.vx += clamp(wantVx - f.vx, -acc * dt, acc * dt);
  // Una pierna: avanza a saltitos.
  if (f.legs.length === 1 && f.grounded && canAct && input.x !== 0 && f.hopCool <= 0 && !busy) {
    f.vy = FIGHT.hopSpeed;
    f.grounded = false;
    f.hopCool = FIGHT.hopRest;
  }
  if (!f.grounded) f.vy -= G * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;

  // ── Inclinación: equilibrio, contrapeso y reacción de los giros ──
  let comX = 0;
  M.limbs.forEach((l, k) => {
    const q = f.limbs[k].q;
    for (const p of l.points) if (!f.broken.includes(p.piece)) comX += p.m * fwd(f, posed(q, l.pivot, p.p));
  });
  for (const p of M.armor) if (!f.broken.includes(p.piece)) comX += p.m * fwd(f, p.p);
  comX /= M.mass;
  f.comX = comX;
  const W = M.mass * G;
  let tau = 0;
  if (f.ko) {
    tau = -W * FIGHT.balanceH * Math.sign(f.tilt || -1) * -1.2;
  } else {
    if (f.support && f.grounded) {
      const [lo, hi] = f.support;
      // Fuera del apoyo vuelca, pero acotado: se inclina mucho y no se cae (la cabeza no toca el mantel fuera del KO).
      const out = clamp(comX - clamp(comX, lo, hi), -FIGHT.tipMax, FIGHT.tipMax);
      tau += W * (out * FIGHT.tipGain + (comX - (lo + hi) / 2) * FIGHT.leanGain);
    } else if (f.legs.length === 0 && f.grounded && Math.abs(f.vx) > 0.005) {
      // Sin piernas: se arrastra meneándose.
      tau += W * FIGHT.balanceH * 0.5 * Math.sin(f.gait * 1.3);
    }
    const K = W * FIGHT.balanceH * FIGHT.balanceK * (f.stun > 0 ? 0.6 : 1);
    // A dónde quiere estar: derecho; cubriéndose con escudo, inclinado para ponerlo de frente; balanceando un chupetín, primero
    // hacia atrás (carga) y después de golpe hacia adelante.
    let aim = -0.12 * f.crouch + 0.1 * f.guard;
    let k = 1;
    if (f.shieldPose) aim = f.shieldPose.tilt * f.guard;
    // Anticipación: al cargar una piña el peso va atrás y al soltarla adelante, con el brazo; una patada, al revés.
    const sk = f.limbs.findIndex((q, j) => !M.limbs[j].rigid && (q.phase === 'windup' || q.phase === 'strike'));
    if (sk >= 0) {
      const sg = M.limbs[sk].role === 'leg' ? -1 : 1;
      aim += sg * (f.limbs[sk].phase === 'windup' ? -FIGHT.bodyWind : FIGHT.bodyThrow);
    }
    if (f.swing) {
      const sp = f.limbs[f.swing.k];
      if (sp.phase === 'windup') {
        aim = -f.swing.sign * FIGHT.swing.back;
        k = FIGHT.swing.backStiff;
      }
      if (sp.phase === 'strike') {
        aim = f.swing.sign * FIGHT.swing.fwd;
        k = FIGHT.swing.stiff;
      }
    }
    tau += -K * k * (f.tilt - aim) - 2 * FIGHT.balanceZeta * Math.sqrt(K * k * f.It) * f.wt;
  }
  tau += FIGHT.reactGain * react;
  f.wt += (tau / f.It) * dt;
  f.tilt += f.wt * dt;
  const lim = f.ko ? 1.5 : f.shieldPose ? Math.PI * 0.95 : FIGHT.maxTilt;
  if (Math.abs(f.tilt) > lim) {
    f.tilt = Math.sign(f.tilt) * lim;
    if (f.wt * f.tilt > 0) f.wt = 0;
  }
  // El peso que siguió de largo lo desestabilizó: trastabilla.
  if (f.wobbly && !f.ko && Math.abs(f.tilt) > FIGHT.stumbleTilt) {
    f.wobbly = false;
    f.stun = Math.max(f.stun, FIGHT.stumbleFrames);
    m.events.push({ type: 'stumble', who: i });
  }

  // ── Piso ──
  for (let k = 0; k < f.cur.length; k++) f.prev[k].set(f.cur[k]);
  const before = f.grounded;
  if (settle(f, before && f.vy <= 0.02) && !before) m.events.push({ type: 'land', who: i });
  f.air = f.grounded ? 0 : f.air + 1;
  if (f.grounded) {
    // Rozamiento con el mantel.
    if (wantVx === 0) f.vx *= 1 - Math.min(1, 6 * dt);
  }
  // Paredes de la arena.
  const lim2 = FIGHT.arenaHalf;
  if (Math.abs(f.x) > lim2) {
    f.x = Math.sign(f.x) * lim2;
    f.vx = 0;
  }
}

/** slerp desde la identidad. */
function slerpI(q: Q, t: number): Q {
  const v = qToVec(q);
  const a = lenv(v);
  return a < 1e-9 ? QI() : qAxis(scl(v, 1 / a), a * t);
}

// ───────────────────────── Contactos ─────────────────────────

/** Distancia de (px, py) al segmento ab (mundo 2D). */
function segD(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

/** Puntos escudo del rival todavía en pie (mundo). */
function shieldPoints(f: FighterState): { x: number; y: number; r: number; piece: string }[] {
  const out: { x: number; y: number; r: number; piece: string }[] = [];
  const M = f.model;
  for (const p of M.armor) {
    if (p.kind !== 'shield' || f.broken.includes(p.piece) || p.inside) continue;
    const w = toWorld(f, p.p);
    out.push({ x: w[0], y: w[1], r: p.r, piece: p.piece });
  }
  M.limbs.forEach((l, k) =>
    l.points.forEach((p: MassPoint, j) => {
      if (p.kind !== 'shield' || f.broken.includes(p.piece) || p.inside) return;
      out.push({ x: f.cur[k][2 * j], y: f.cur[k][2 * j + 1], r: p.r, piece: p.piece });
    }),
  );
  return out;
}

function comY(f: FighterState): number {
  return f.y;
}

function resolveHits(m: Match): void {
  for (const i of [0, 1] as const) {
    const a = m.f[i];
    const b = m.f[1 - i];
    if (a.ko || b.ko) continue;
    const bodies = b.model.body.map((sh) => {
      const A = toWorld(b, sh.a);
      const B = toWorld(b, sh.b);
      return { ax: A[0], ay: A[1], bx: B[0], by: B[1], r: sh.r };
    });
    const shields = shieldPoints(b);
    // Guardia física: lo que tapa son los brazos levantados, punto por punto (no un campo de fuerza).
    const blockers: { x: number; y: number; r: number; limb: number }[] = [];
    if (b.guard >= FIGHT.guardReady && b.grounded && !b.shieldPose) {
      for (const k of b.arms) {
        b.model.limbs[k].points.forEach((p, j) => {
          if (!p.inside) blockers.push({ x: b.cur[k][2 * j], y: b.cur[k][2 * j + 1], r: p.r, limb: k });
        });
      }
    }
    a.model.limbs.forEach((l, k) => {
      const s = a.limbs[k];
      if (!s.active || s.landed) return;
      for (let j = 0; j < l.points.length; j++) {
        const p = l.points[j];
        if (p.inside || a.broken.includes(p.piece)) continue;
        const px = a.cur[k][2 * j];
        const py = a.cur[k][2 * j + 1];
        const reach = p.r + FIGHT.hitPad;
        const blocker = blockers.find((q) => Math.hypot(px - q.x, py - q.y) < q.r + reach);
        let shield: string | null = null;
        if (!blocker) for (const sp of shields) if (Math.hypot(px - sp.x, py - sp.y) < sp.r + reach) shield = sp.piece;
        const body = !blocker && !shield && bodies.some((q) => segD(px, py, q.ax, q.ay, q.bx, q.by) < q.r + reach);
        if (!blocker && !shield && !body) continue;
        const vx = (px - a.prev[k][2 * j]) / dt - b.vx;
        const vy = (py - a.prev[k][2 * j + 1]) / dt - b.vy;
        const speed = Math.hypot(vx, vy);
        if (speed < FIGHT.minHitSpeed) continue;
        applyHit(m, i, k, j, px, py, speed, shield, blocker ? blocker.limb : null);
        return;
      }
    });
  }
}

function applyHit(m: Match, i: 0 | 1, k: number, j: number, px: number, py: number, speed: number, shield: string | null, blockedBy: number | null): void {
  const a = m.f[i];
  const b = m.f[1 - i];
  const l = a.model.limbs[k];
  const s = a.limbs[k];
  const p = l.points[j];
  // Masa efectiva en el punto de contacto: inercia alrededor del eje del golpe / distancia².
  const r = lenv(sub(p.p, l.pivot));
  const I = inertia(a, k, s.axis);
  const mEff = l.rigid ? l.mass * FIGHT.swing.massShare : clamp(I / Math.max(r * r, 1e-8), 0.2 * l.mass, l.mass);
  const kind: HitKind = p.kind === 'shield' ? l.kind : p.kind;
  // La velocidad manda más que la masa: algo pesado que apenas se mueve pega poco.
  let dmg = clamp(FIGHT.dmgK * Math.pow(mEff * 1000, FIGHT.dmgMassExp) * Math.pow(speed, FIGHT.dmgSpeedExp), FIGHT.dmgClamp[0], FIGHT.dmgClamp[1]) * FIGHT.kindMul[kind];
  const chain = s.combo;
  if (chain) dmg *= FIGHT.chain.mul[chain] ?? 1;
  const fromFront = Math.sign(a.x - b.x || 1) === b.facing;
  const blocked = blockedBy !== null;
  if (blocked) {
    // El brazo que tapó se lleva el golpe y se sacude.
    const bs = b.limbs[blockedBy];
    bs.w = [bs.w[0], bs.w[1], bs.w[2] + (py > b.y ? 1 : -1) * Math.min(30, speed * 12)];
  }
  if (shield) {
    dmg *= FIGHT.shieldPass;
    b.shields[shield] = (b.shields[shield] ?? 1) - 1;
    if (b.shields[shield] <= 0 && !b.broken.includes(shield)) {
      b.broken.push(shield);
      m.events.push({ type: 'shieldBreak', who: (1 - i) as 0 | 1, piece: shield, at: [px, py], vel: [a.facing * (0.15 + speed * 0.2), 0.25] });
    }
  }
  if (blocked) {
    dmg *= FIGHT.chip;
    b.block = FIGHT.blockstun;
    // Bloqueó: si suelta la guardia y pega enseguida, sale una CONTRA.
    b.counter = FIGHT.blockstun + FIGHT.chain.counterWindow;
    a.chain = null;
  } else {
    // Acertó: el impulso sigue (combinaciones). Al que recibe se le corta la suya y el salto que estaba por dar.
    a.chain = { n: (a.chain && a.chain.t > 0 ? a.chain.n : 0) + 1, last: l.role === 'leg' && !l.rigid ? 'kick' : 'arm', t: FIGHT.chain.window };
    b.chain = null;
    b.squat = 0;
    b.stun = Math.round(FIGHT.hitstun.base + FIGHT.hitstun.k * dmg);
    b.limbs.forEach((q) => {
      if (q.phase === 'windup' || q.phase === 'strike') {
        q.phase = 'recover';
        q.t = 0;
      }
    });
    b.buffer = null;
    b.swing = null; // si estaba cargando un balanceo, lo pierde
    if (kind === 'heavy') {
      b.dizzy += dmg;
      if (b.dizzy >= FIGHT.dizzyMax) {
        b.dizzy = 0;
        b.stun = FIGHT.dizzyFrames;
        b.dizzyT = FIGHT.dizzyFrames;
        m.events.push({ type: 'dizzy', who: (1 - i) as 0 | 1 });
      }
    }
    if (kind === 'cut' && b.bleed.length < FIGHT.bleed.max) b.bleed.push(FIGHT.bleed.frames);
  }
  b.hp = Math.max(0, b.hp - dmg);
  // Empujón (con lo que pesa el rival) y giro del cuerpo según la altura del golpe.
  const kb = clamp((FIGHT.knockback * mEff * speed) / b.model.mass, FIGHT.kbClamp[0], FIGHT.kbClamp[1]) * (blocked ? 0.45 : 1) * (chain === 'RÁFAGA' ? 1.4 : 1);
  b.vx = a.facing * kb;
  // El que pega frena en seco contra el otro (acción y reacción): pierde el envión y rebota apenas. Al pifiar, en cambio, sigue.
  if (a.vx * a.facing > 0) a.vx = 0;
  a.vx -= a.facing * clamp((FIGHT.impactBack * mEff * speed) / a.model.mass, 0.015, 0.08);
  if (!blocked) {
    b.vy = Math.max(b.vy, kb * FIGHT.kbUp);
    b.grounded = false;
  }
  const h = (py - comY(b)) / FIGHT.balanceH;
  b.wt += -FIGHT.hitTilt * kb * clamp(h, -1.5, 1.5) * (fromFront ? 1 : -1) * (blocked ? 0.3 : 1);
  s.w = scl(s.w, -FIGHT.recoil);
  s.landed = true;
  s.active = false;
  s.phase = 'recover';
  s.t = 0;
  a.lock = Math.max(a.lock, FIGHT.hitLock);
  a.combo = m.frame - a.lastHit < FIGHT.comboWindow && !blocked ? a.combo + 1 : 1;
  a.lastHit = m.frame;
  m.hitstop = Math.min(FIGHT.hitstop.max, Math.round(FIGHT.hitstop.base + FIGHT.hitstop.k * dmg));
  m.events.push({ type: 'hit', by: i, at: [px, py], damage: dmg, kind, blocked, shield: !!shield, piece: p.piece, speed, combo: a.combo, heavy: kind === 'heavy', chain: blocked ? null : chain });
}

/** Los cuerpos no se atraviesan (las extremidades sí pasan por delante y por detrás). */
function separate(m: Match): void {
  const [a, b] = m.f;
  const ra = Math.max(...a.model.body.map((s) => s.r));
  const rb = Math.max(...b.model.body.map((s) => s.r));
  const d = b.x - a.x;
  const gap = ra + rb + FIGHT.bodyGap;
  if (Math.abs(d) < gap && Math.abs(a.y - b.y) < 0.05) {
    const push = (gap - Math.abs(d)) / 2;
    const sgn = d >= 0 ? 1 : -1;
    a.x -= sgn * push;
    b.x += sgn * push;
  }
}

// ───────────────────────── Paso del match ─────────────────────────

/** Un paso (1/60 s). Muta `m` y deja los eventos de este paso en `m.events`. */
export function stepMatch(m: Match, inputs: [FightInput, FightInput]): void {
  m.events = [];
  if (m.hitstop > 0) {
    m.hitstop--;
    // Lo que se aprieta durante el congelamiento del impacto no se pierde: es justo cuando se encadena el golpe siguiente.
    m.f.forEach((f, i) => {
      if (m.phase !== 'fight' || f.ko) return;
      if (inputs[i].punch) f.buffer = { kind: f.grounded ? 'arm' : 'air', t: FIGHT.buffer };
      const q = inputs[i].quad;
      if (q) f.buffer = { kind: q[1] === 'L' ? 'kick' : f.grounded ? 'arm' : 'air', t: FIGHT.buffer, quad: q };
      if (inputs[i].kick) f.buffer = { kind: 'kick', t: FIGHT.buffer };
    });
    return;
  }
  m.frame++;
  m.phaseT++;
  if (m.phase === 'intro' && m.phaseT >= FIGHT.introFrames) {
    m.phase = 'fight';
    m.phaseT = 0;
    m.events.push({ type: 'fight' });
  }
  const play = m.phase === 'fight';
  stepFighter(m, 0, play ? inputs[0] : IDLE);
  stepFighter(m, 1, play ? inputs[1] : IDLE);
  separate(m);
  if (play) {
    resolveHits(m);
    for (const f of m.f) {
      for (let k = f.bleed.length - 1; k >= 0; k--) {
        f.hp = Math.max(0, f.hp - FIGHT.bleed.dps * dt);
        if (--f.bleed[k] <= 0) f.bleed.splice(k, 1);
      }
    }
    m.timer--;
    const dead = m.f.map((f) => f.hp <= 0);
    if (dead[0] || dead[1]) {
      m.phase = 'ko';
      m.phaseT = 0;
      m.f.forEach((f, i) => {
        if (dead[i]) {
          f.ko = true;
          f.wt = -3;
          m.events.push({ type: 'ko', who: i as 0 | 1 });
        }
      });
      m.roundWinner = dead[0] && dead[1] ? 'draw' : dead[0] ? 1 : 0;
    } else if (m.timer <= 0) {
      m.phase = 'ko';
      m.phaseT = FIGHT.koFrames; // sin cámara lenta
      const [h0, h1] = [m.f[0].hp, m.f[1].hp];
      m.roundWinner = Math.abs(h0 - h1) < 1e-9 ? 'draw' : h0 > h1 ? 0 : 1;
    }
  }
  if (m.phase === 'ko' && m.phaseT >= FIGHT.koFrames) {
    m.phase = 'end';
    m.phaseT = 0;
    const w = m.roundWinner ?? 'draw';
    if (w !== 'draw') m.wins[w]++;
    m.events.push({ type: 'roundEnd', winner: w, reason: m.f.some((f) => f.ko) ? 'ko' : 'time' });
  }
  if (m.phase === 'end' && m.phaseT >= FIGHT.endFrames) {
    const champ = m.wins.findIndex((w) => w >= FIGHT.roundsToWin);
    if (champ >= 0) {
      m.phase = 'over';
      m.phaseT = 0;
      m.winner = champ as 0 | 1;
      m.events.push({ type: 'matchEnd', winner: champ as 0 | 1 });
    } else {
      m.round++;
      resetRound(m);
    }
  }
}

/** Para el render: punto local de una extremidad en su pose actual (sin inclinación). */
export const posedPoint = posed;
