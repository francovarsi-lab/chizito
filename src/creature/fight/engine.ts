import type { V3 } from '../types';
import type { FighterModel, HitKind, MassPoint } from './fighter';
import { qAxis, qConj, qFromTo, QI, qIntegrate, qMul, qNorm, qRot, qToVec, type Q } from './quat';
import { FIGHT, JELLY, POWERS, type PowerKind } from './tuning';
import { MOVE_REST, MOVES, type LimbTag } from './moves';
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
  /** Poder especial (flanco): solo con la barra de PODER llena. */
  power?: boolean;
  /** Cuadrante que se MANTIENE apretado (null: ninguno). Sin el campo no hay golpe rápido / cargado (la máquina, Z/X). */
  quadHeld?: Quad | null;
  /** Ataque hecho a mano (rivales, `moves.ts`). */
  move?: string;
}

export const IDLE: FightInput = { x: 0 };

type Phase = 'rest' | 'windup' | 'strike' | 'recover';

export interface LimbState {
  q: Q;
  /** Noqueado: la pose floja final, calculada una vez al caer (ver `koSettle`). */
  koQ?: Q | null;
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
  /** Daño × esto: un golpe repetido con el mismo botón se ve venir y pega menos. */
  worn: number;
  /** Cuadros que se mantuvo el botón (−1: no se sigue), su cuadrante y si ya se soltó. */
  hold: number;
  holdQuad: Quad | null;
  released: boolean;
  /** Daño × esto (rápido 0,6; cargado hasta 1,6) y si rompe la guardia (carga completa). */
  power: number;
  breaker: boolean;
  /** Golpe especial: gancho (levanta) o barrida (derriba). */
  move: Move;
}

export type Move = 'normal' | 'upper' | 'sweep';

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
  swing: { k: number; sign: 1 | -1; t0?: number; held?: boolean } | null;
  /** Se cubre con un escudo: inclinación (rad) para ponerlo de frente; `turned` = se dio vuelta para mostrar la espalda. */
  shieldPose: { tilt: number; turned: boolean } | null;
  buffer: { kind: 'arm' | 'kick' | 'air'; t: number; quad?: Quad; move?: Move } | null;
  /** Por cuadrante: cuál toca la próxima vez (de a una). */
  nextQ: Record<Quad, number>;
  gait: number;
  hopCool: number;
  shields: Record<string, number>;
  broken: string[];
  ko: boolean;
  combo: number;
  lastHit: number;
  /** Cuadro del último golpe RECIBIDO (para el poder de rearmarse). */
  lastHurt: number;
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
  /** Barra de PODER (0..max) y el poder en curso: fase y cuadros. */
  meter: number;
  pw: { kind: PowerKind; phase: 'wind' | 'go'; t: number; hit: boolean; short?: boolean } | null;
  /** rad: vuelta de carnero al rodar (solo se dibuja; vuelve a 0 en una vuelta entera). */
  roll: number;
  /** rad: vuelta entera sobre sí mismo (0..2π) después de pifiar con el chupetín, hacia `whirlDir` (el lado del golpe). */
  whirl: number;
  whirlDir: 1 | -1;
  /** La vuelta sigue el MISMO movimiento del golpe: arranca con la velocidad que traía el torso (rad/s) y frena parejo hasta
   *  completar la vuelta (`whirlD` rad, `whirlA` rad/s²). */
  whirlV: number;
  whirlD: number;
  whirlA: number;
  /** rad/s del giro del torso (para que la vuelta continúe con la misma velocidad). */
  twistV: number;
  /** Golpes seguidos sin pausa (marcan un ritmo que se ve venir: pegan menos y el rival los ataja). */
  repeat: number;
  lastStrikeF: number;
  /** Desproporción: todo lo clavado / el cuerpo, menos 0,6 (0 si no hay). Pesa en todo: marcha, salto, carga, pifie. */
  heavyLoad: number;
  /** Gelatina: golpes recibidos seguidos y cuadros desde el último. */
  jellyN: number;
  /** Coraza que le falta (quinoa, después de tirar granos): 0..1, se rearma sola. */
  armorLoss: number;
  /** Cuadrante mantenido este paso (undefined: la entrada no lo informa). */
  held: Quad | null | undefined;
  /** Pasito: doble toque de flecha (último toque y su dirección), cuadros que le quedan, dirección. */
  lastX: number;
  tapDir: number;
  tapT: number;
  dash: number;
  dashDir: number;
  /** Cuadros invulnerable (pasito atrás, al levantarse). */
  inv: number;
  /** Cuadros desde que apretó la guardia (atajada justa) y si la tenía apretada el paso anterior. */
  guardT: number;
  guardIn: boolean;
  /** Bloqueos recientes (cuadro de cada uno) y cuadros de guardia rota. */
  blocks: number[];
  guardBreak: number;
  /** Derribado (cuadros) y golpes recibidos en el aire después de un gancho (−1: no está en el aire por un gancho). */
  down: number;
  juggle: number;
  /** Muralla (súper con escudos): cuadros sin retroceder ni quedar aturdido. Nube: cuadros pifiando más (golpes × blind). */
  wall: number;
  blind: number;
  blindMul: number;
  /** E apretada durante el congelamiento del impacto (el remate se aprieta justo ahí): cuadros que se recuerda. */
  pwBuf: number;
  /** Ataque hecho a mano en curso: cuadro y qué ventanas ya pegaron. */
  mv: { id: string; t: number; hit: boolean[] } | null;
}

/** Un proyectil (granos de quinoa). */
export interface Shot {
  id: number;
  by: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  /** Carozo: recto (sin gravedad) y marea. */
  kind?: PowerKind;
}

/** Zona que queda en la tabla (la nube de queso del súper): daño por segundo a quien esté adentro. */
/** Montoncito de granos en la tabla (quinoa reventada): si la quinoa lo pisa o pasan `life` cuadros, se lo reabsorbe. */
export interface Pile {
  id: number;
  x: number;
  n: number;
  t: number;
}

/** Cáscara de huevo tirada en la tabla (las del poder que caen al piso): queda a la vista y al que la pisa le saca vida. */
export interface Trap {
  id: number;
  x: number;
  by: 0 | 1;
  life: number;
}

/** RAÍCES del brócoli: primero se agrieta la tabla bajo el rival (`t` < delay, se ve venir) y después brotan. */
export interface Root {
  id: number;
  x: number;
  by: 0 | 1;
  t: number;
}

export interface Zone {
  x: number;
  y: number;
  r: number;
  life: number;
  by: 0 | 1;
  kind: 'nube' | 'olor';
  /** Ya mareó a alguien que entró (una vez por nube). */
  dazed?: boolean;
}

export type FightEvent =
  | { type: 'hit'; by: 0 | 1; at: [number, number]; damage: number; kind: HitKind; blocked: boolean; shield: boolean; shieldPiece: string | null; piece: string; speed: number; combo: number; heavy: boolean; chain: string | null }
  | { type: 'shieldBreak'; who: 0 | 1; piece: string; at: [number, number]; vel: [number, number] }
  | { type: 'swing'; who: 0 | 1; limb: number; heavy: boolean }
  | { type: 'whiff'; who: 0 | 1; heavy: boolean; lock: number }
  | { type: 'jump' | 'land' | 'dizzy' | 'ko' | 'stumble' | 'parry' | 'guardBreak' | 'down' | 'dash' | 'launch'; who: 0 | 1 }
  | { type: 'round'; round: number }
  | { type: 'fight' }
  | { type: 'roundEnd'; winner: 0 | 1 | 'draw'; reason: 'ko' | 'time' }
  | { type: 'matchEnd'; winner: 0 | 1 }
  | { type: 'power'; who: 0 | 1; kind: PowerKind; phase: 'wind' | 'go'; use?: 'remate' | 'super' }
  | { type: 'move'; who: 0 | 1; id: string; tell: string }
  | { type: 'grains'; who: 0 | 1; at: [number, number]; n: number; pile: number; x: number }
  | { type: 'absorb'; who: 0 | 1; at: [number, number] }
  | { type: 'reabsorb' | 'scatter'; who: 0 | 1; pile: number }
  | { type: 'powerHit'; by: 0 | 1; kind: PowerKind; at: [number, number]; damage: number; blocked: boolean }
  | { type: 'trap'; who: 0 | 1; x: number; step: boolean }
  | { type: 'roots'; who: 0 | 1; x: number; hit: boolean }


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
  /** Proyectiles en el aire. */
  shots: Shot[];
  zones: Zone[];
  piles: Pile[];
  traps: Trap[];
  roots: Root[];
  nextShot: number;
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
/** Hacia dónde girar el torso para llevar el hombro de `pivot` hacia el rival (signo de la derivada de fwd respecto del giro). */
const shoulderSign = (f: FighterState, pivot: V3): 1 | -1 => (-pivot[0] * f.ys - f.facing * pivot[2] * f.yc >= 0 ? 1 : -1);

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
    limbs: model.limbs.map((_, i) => ({ q: stance[i], w: [0, 0, 0], phase: 'rest', t: 0, axis: [0, 0, 1], windup: 0, target: 0, phi: 0, landed: false, active: false, slack: 0, charge: 0, follow: 0, combo: null, worn: 1, hold: -1, holdQuad: null, released: false, power: 1, breaker: false, move: 'normal' })),
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
    lastHurt: -999,
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
    meter: 0,
    pw: null,
    roll: 0,
    whirl: 0,
    whirlDir: 1,
    whirlV: 0,
    whirlD: 0,
    whirlA: 0,
    twistV: 0,
    repeat: 0,
    lastStrikeF: -999,
    heavyLoad: 0,
    jellyN: 0,
    armorLoss: 0,
    held: undefined,
    lastX: 0,
    tapDir: 0,
    tapT: -999,
    dash: 0,
    dashDir: 0,
    inv: 0,
    guardT: 999,
    guardIn: false,
    blocks: [],
    guardBreak: 0,
    down: 0,
    juggle: -1,
    wall: 0,
    blind: 0,
    blindMul: 1,
    pwBuf: 0,
    mv: null,
  };
  // Desproporción (el chupetín pesa más que el chizito entero): marcha, salto y giros más pesados. Pocos gramos, pero la
  // proporción manda: una extremidad que pesa más que el cuerpo lo arrastra.
  // Cuenta TODO lo clavado (no sólo la pieza más pesada): dos chupetines pesan el doble que uno y se tiene que notar.
  // Las piernas articuladas no cuentan: son las que cargan.
  const legMass = legs.reduce((sum, k) => sum + model.limbs[k].mass, 0);
  f.heavyLoad = Math.max(0, (model.mass - model.bodyMass - legMass) / model.bodyMass - 0.6);
  f.speed /= 1 + 0.7 * f.heavyLoad;
  f.jump = f.jump / (1 + f.heavyLoad);
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
    shots: [],
    zones: [],
    piles: [],
    traps: [],
    roots: [],
    nextShot: 1,
  };
  return m;
}

function resetRound(m: Match): void {
  // La barra de poder se guarda de un round al otro (como en los juegos de pelea).
  const meters = m.f.map((f) => f.meter);
  m.f = [makeFighter(m.f[0].model, -FIGHT.startGap / 2, 1), makeFighter(m.f[1].model, FIGHT.startGap / 2, -1)];
  m.f.forEach((f, i) => (f.meter = meters[i]));
  m.shots = [];
  m.zones = [];
  m.piles = [];
  m.traps = [];
  m.roots = [];
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
      // Noqueado es un cadáver: cae el cuerpo sobre la tabla; las extremidades flojas no lo apuntalan (quedan tiradas encima).
      if (!p.inside && !f.broken.includes(p.piece) && !f.ko) low = Math.min(low, w[1] - p.r * 0.5);
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

/** Punto (local, en su pose actual) que está más abajo en el mundo: sobre él pivota el cuerpo apoyado. */
function contactPoint(f: FighterState): V3 | null {
  let best: V3 | null = null;
  let lo = Infinity;
  const test = (v: V3, r: number): void => {
    const y = toWorld(f, v)[1] - r;
    if (y < lo) {
      lo = y;
      best = v;
    }
  };
  for (const b of f.model.body) {
    test(b.a, b.r);
    test(b.b, b.r);
  }
  if (!f.ko) f.model.limbs.forEach((l, k) => {
    for (const p of l.points) if (!p.inside && !f.broken.includes(p.piece)) test(posed(f.limbs[k].q, l.pivot, p.p), p.r * 0.5);
  });
  return best;
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

function startStrike(m: Match, i: 0 | 1, k: number, kind: 'arm' | 'kick' | 'air', combo: string | null = null, move: Move = 'normal'): void {
  const f = m.f[i];
  const foe = m.f[1 - i];
  const l = f.model.limbs[k];
  const s = f.limbs[k];
  const d0 = l.dir;
  // Hacia dónde: el centro del rival visto desde la articulación (local), siempre hacia adelante.
  let tx = (foe.x - f.x) * f.facing - fwd(f, l.pivot);
  // Gancho: apunta arriba del rival (sube por debajo); barrida: a los pies.
  let ty = foe.y + (move === 'upper' ? 0.03 : move === 'sweep' ? -0.022 : kind === 'kick' ? -0.012 : 0.004) - f.y - l.pivot[1];
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
  // Piña = GANCHO de afuera hacia adentro, igual con los dos brazos (pedido del usuario: ni de arriba hacia abajo ni de adentro
  // hacia afuera): gira alrededor de la vertical, con un poco de inclinación hacia el rival para no pasarle por arriba.
  const hd: V3 = [d0[0], 0, d0[2]];
  const hT: V3 = [T[0], 0, T[2]];
  const hook = !f.model.moves && kind === 'arm' && move === 'normal' && lenv(hd) > 0.3 * lenv(d0);
  if (hook) {
    const yc = crossv(hd, hT)[1];
    // Ya apunta al rival (o casi): entra desde su propio lado (afuera), según de qué lado del cuerpo está el hombro.
    const sg = Math.abs(yc) > 0.05 * lenv(hd) * lenv(hT) ? Math.sign(yc) : -Math.sign(l.pivot[2] || d0[2] || 1);
    const v: V3 = [0, sg, 0];
    const c = sn > 1e-6 ? scl(axis, 1 / sn) : v;
    axis = dotv(c, v) > 0 ? normv(addv(scl(v, 0.75), scl(c, 0.25))) : v;
    const pr = (u: V3): V3 => sub(u, scl(axis, dotv(u, axis)));
    const a0 = pr(d0), a1 = pr(T);
    let ang = Math.atan2(dotv(crossv(a0, a1), axis), dotv(a0, a1));
    if (ang < 0) ang += Math.PI * 2;
    target = Math.min(ang, Math.PI * 1.2) + FIGHT.overshoot;
    windup = Math.min(windup, Math.max(target - (heavy ? FIGHT.sweepHeavy : FIGHT.sweep), -FIGHT.windupCap));
  } else if (sn < 0.25 && cs > 0) {
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
  } else {
    target = Math.atan2(sn, cs) + FIGHT.overshoot;
    // MISMO RECORRIDO para todos los brazos: con la guardia de 3/4 un hombro queda adelante (le salía un jab corto) y el otro
    // atrás (un golpe largo). El de adelante se carga más atrás hasta completar el mismo arco: los dos cargan y pegan parecido.
    if (kind !== 'kick') windup = Math.min(windup, Math.max(target - (heavy ? FIGHT.sweepHeavy : FIGHT.sweep), -FIGHT.windupCap));
  }
  s.axis = normv(axis);
  s.windup = windup;
  s.target = target;
  s.phi = phiOf(s);
  s.w = [0, 0, 0];
  s.move = move;
  s.hold = -1;
  s.holdQuad = null;
  s.released = false;
  s.power = 1;
  s.breaker = false;
  s.phase = 'windup';
  s.t = 0;
  s.landed = false;
  s.active = false;
  s.follow = 0;
  s.combo = combo;
  // Lo pesado se carga: cuanto más pesa frente al chizito, más tarda (y más tiempo queda expuesto a que le corten la carga).
  // El chupetín carga echándose atrás (se ve): con tope, para que llegue a salir. En una combinación no hay carga.
  const ratio = (l.mass / f.model.bodyMass) * (l.rigid ? FIGHT.swing.chargeMul : 1);
  // Cuanto más cargada va la criatura (`heavyLoad`), más le cuesta revolear lo fijo: el tope de la carga sube con el peso total.
  s.charge = combo ? 0 : Math.min(l.rigid ? Math.round(FIGHT.swing.maxCharge * (1 + FIGHT.swing.loadCharge * f.heavyLoad)) : 99, Math.round(FIGHT.charge.k * Math.max(0, ratio - FIGHT.charge.free)));
  if (combo) s.windup *= 0.5;
  if (combo === 'CONTRA') f.counter = 0;
  if (l.rigid) {
    // Pieza fija: no gira sola; se balancea la criatura entera. Si la masa está arriba del centro, hacia adelante.
    let cy = 0;
    for (const p of l.points) cy += p.m * p.p[1];
    f.swing = { k, sign: cy >= 0 ? 1 : -1 };
  }
  f.strikeCool = Math.max(f.strikeCool, FIGHT.strikeGap);
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
  const lock = Math.min(W.max * mul, Math.round((W.base + W.k * (l.mass / f.model.bodyMass)) * mul * (1 + 0.4 * f.heavyLoad)));
  if (!(l.rigid && f.swing)) f.lock = Math.max(f.lock, lock);
  if (l.rigid && f.swing) {
    // El chupetín pesa más que el chizito: al no encontrar nada, el peso lo arrastra y da una VUELTA ENTERA sobre sí mismo,
    // desestabilizado (se tambalea y queda expuesto hasta frenar).
    // Es el MISMO movimiento que sigue (no uno nuevo): el torso continúa para el lado que giraba, con la velocidad que traía, y
    // frena parejo hasta completar la vuelta entera.
    f.wt += f.swing.sign * FIGHT.whirl.wobble;
    f.whirlDir = (Math.sign(f.twist) || shoulderSign(f, l.pivot)) as 1 | -1;
    f.whirlD = Math.PI * 2 - Math.abs(f.twist);
    // UN solo movimiento: la vuelta sigue a la velocidad del golpe y apenas afloja al final (`whirl.end` de esa velocidad); antes
    // frenaba hasta casi pararse y se leía como otro movimiento. Queda expuesto lo que dura la vuelta, ni un cuadro más.
    f.whirlV = Math.max(Math.abs(f.twistV), FIGHT.whirl.minSpeed);
    const vEnd = f.whirlV * FIGHT.whirl.end;
    f.whirlA = (f.whirlV * f.whirlV - vEnd * vEnd) / (2 * f.whirlD);
    if (f.whirl <= 0) f.whirl = 1e-4;
    // La vuelta ES el castigo: queda expuesto lo que dura, sin quedarse quieto después (pedido del usuario).
    const spin = Math.ceil((2 * f.whirlD) / (f.whirlV + vEnd) / dt) + Math.round(FIGHT.whirl.after * (1 + 0.5 * f.heavyLoad));
    f.stun = Math.max(f.stun, spin);
    f.lock = Math.max(f.lock, spin);
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

/**
 * Inclinación de reposo de un cuerpo caído: desde la actual, hacia donde baja el centro de masa, hasta el primer mínimo (rueda
 * cuesta abajo y se queda en el primer pozo, como un objeto de verdad). Mide la altura del centro de masa sobre el punto más bajo.
 */
/**
 * Pose de una extremidad SIN rigidez (noqueado): cae hacia la tabla desde su articulación, todo lo que la altura le deja (no
 * apuntala el cuerpo), abierta hacia donde ya apuntaba. `up` = el "arriba" del mundo en el marco del luchador inclinado.
 */
function limp(f: FighterState, k: number, tilt = f.tilt, hAt?: number): Q {
  const l = f.model.limbs[k];
  const fa = fwdAxis(f);
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  const up: V3 = [-sn * fa[0], c, -sn * fa[2]];
  let flat = sub(l.dir, scl(up, dotv(l.dir, up)));
  // Apuntaba derecho arriba o abajo: cae a lo largo del cuerpo.
  if (lenv(flat) < 0.2) flat = sub([0, l.dir[1] >= 0 ? 1 : -1, 0], scl(up, (l.dir[1] >= 0 ? 1 : -1) * up[1]));
  flat = normv(flat);
  const h = hAt ?? toWorld(f, l.pivot)[1];
  const droop = Math.asin(clamp((h - 0.004) / Math.max(l.reach, 1e-3), 0, 1));
  return qFromTo(l.dir, normv(sub(scl(flat, Math.cos(droop)), scl(up, Math.sin(droop)))));
}

/**
 * Noqueado = cadáver: cada extremidad va DERECHO a su pose floja final (la del cuerpo ya acostado, ±90°), sin fuerza ni
 * vueltas: se calcula una vez al caer y se llega con una caída que sólo frena (nunca se pasa ni se acomoda en el piso).
 */
function koSettle(f: FighterState, k: number): void {
  const s = f.limbs[k];
  if (!s.koQ) {
    const T = (Math.sign(Math.abs(f.tilt) > 0.05 ? f.tilt : f.wt || -1) * Math.PI) / 2;
    const yOf = (p: V3): number => -fwd(f, p) * Math.sin(T) + p[1] * Math.cos(T);
    let low = Infinity;
    for (const b of f.model.body) for (const e of [b.a, b.b]) low = Math.min(low, yOf(e) - b.r);
    s.koQ = limp(f, k, T, yOf(f.model.limbs[k].pivot) - low);
  }
  const a = s.q, b = s.koQ;
  const sg = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const t = 0.14;
  s.q = qNorm([a[0] + (sg * b[0] - a[0]) * t, a[1] + (sg * b[1] - a[1]) * t, a[2] + (sg * b[2] - a[2]) * t, a[3] + (sg * b[3] - a[3]) * t]);
  s.w = [0, 0, 0];
}

// ───────────────────────── Poderes ─────────────────────────

/**
 * Daño que de verdad entra según el cuerpo del que recibe: la coraza (huevo blandito ×1,25, quinoa ×0,6, menos coraza si tiró
 * granos) y la gelatina del huevo (los golpes seguidos rebotan y pegan cada vez menos).
 */
/**
 * Le pegaron: se le corta el golpe en curso. La CARGA del chupetín no se pierde (pedido del usuario: "se anula la carga"): queda
 * en pausa mientras está aturdido y sigue después. Lo que ya estaba girando (fase de golpe) sí se corta.
 */
function interrupt(b: FighterState): void {
  let kept = false;
  b.limbs.forEach((q, k) => {
    // Aguanta UN golpe (la carga queda en pausa); el segundo golpe durante la misma carga sí la corta.
    if (q.phase === 'windup' && b.model.limbs[k].rigid && b.swing?.k === k && !b.swing.held && FIGHT.swing.poiseHits > 0) kept = b.swing.held = true;
    else if (q.phase === 'windup' || q.phase === 'strike') {
      q.phase = 'recover';
      q.t = 0;
    }
  });
  if (!kept) b.swing = null;
}

function soak(m: Match, b: FighterState, dmg: number): number {
  let mul = ((b.model.armorMul ?? 1) + b.armorLoss) * (b.model.jelly && b.hp < FIGHT.phase2 ? FIGHT.phase2Mul : 1);
  if (b.model.jelly) {
    b.jellyN = m.frame - b.lastHurt < JELLY.window ? b.jellyN + 1 : 0;
    mul *= Math.max(JELLY.min, 1 - JELLY.step * b.jellyN);
  }
  return dmg * mul;
}

/** Un poder (o un grano) le pega a `1 − i`. Se puede bloquear con la guardia de frente. */
function powerHit(m: Match, i: 0 | 1, kind: PowerKind, at: [number, number], dmg: number, o: { kb: number; up: number; stun: number; dizzy?: number; blocked?: boolean }): void {
  const a = m.f[i];
  const b = m.f[1 - i];
  const dir = Math.sign(b.x - a.x) || a.facing;
  const fromFront = dir === -b.facing;
  const blocked = o.blocked ?? (b.guard >= FIGHT.guardReady && b.grounded && b.arms.length > 0 && fromFront);
  const d = soak(m, b, dmg * (blocked ? FIGHT.chip * 2 : 1));
  b.hp = Math.max(0, b.hp - d);
  b.lastHurt = m.frame;
  b.meter = Math.min(FIGHT.power.max, b.meter + d * FIGHT.power.onHurt);
  b.vx = dir * o.kb * (blocked ? 0.45 : 1) * (b.wall > 0 ? 0 : 1);
  if (blocked) b.block = Math.max(b.block, FIGHT.blockstun);
  else if (b.wall > 0) b.chain = null;
  else {
    b.vy = Math.max(b.vy, o.up);
    if (o.up > 0) b.grounded = false;
    b.stun = Math.max(b.stun, o.stun);
    b.chain = null;
    b.buffer = null;
    b.mv = null;
    b.squat = 0;
    interrupt(b);
    if (o.dizzy) {
      b.dizzyT = o.dizzy;
      b.stun = Math.max(b.stun, o.dizzy);
      m.events.push({ type: 'dizzy', who: (1 - i) as 0 | 1 });
    }
    b.wt += (fromFront ? -1 : 1) * Math.min(4, 10 * o.kb);
  }
  m.hitstop = Math.max(m.hitstop, o.stun > 10 ? 7 : 2);
  m.events.push({ type: 'powerHit', by: i, kind, at, damage: d, blocked });
}

/** Avanza el poder en curso: primero se carga (se ve venir) y después actúa. */
function stepPower(m: Match, i: 0 | 1): void {
  const f = m.f[i];
  const foe = m.f[1 - i];
  const pw = f.pw!;
  pw.t++;
  if (f.ko || m.phase !== 'fight') {
    f.pw = null;
    return;
  }
  const gap = Math.abs(foe.x - f.x);
  const center: [number, number] = [f.x + f.facing * 0.02, f.y + 0.02];
  const sm = 1;
  if (pw.phase === 'wind') {
    if (pw.t < POWERS[pw.kind].wind) return;
    pw.phase = 'go';
    pw.t = 0;
    m.events.push({ type: 'power', who: i, kind: pw.kind, phase: 'go' });
    if (pw.kind === 'raices') {
      // Apunta donde está parado el rival AHORA: tiene `delay` cuadros (la tabla se agrieta) para salirse o saltar.
      m.roots.push({ id: m.nextShot++, x: foe.x, by: i, t: 0 });
    } else if (pw.kind === 'nube' || pw.kind === 'olor') {
      const P = POWERS[pw.kind];
      const zone: Zone = { x: f.x + f.facing * 0.035, y: f.y + 0.02, r: P.r, life: P.life, by: i, kind: pw.kind };
      m.zones.push(zone);
      // OLOR A PATA: además del olor que queda, el primer golpe de aire marea al que esté adentro (la guardia no tapa la nariz).
      // La nube y el olor MAREAN de entrada al que está adentro (la guardia no tapa la nariz): queda atontado un rato.
      if (Math.abs(foe.x - (f.x + f.facing * 0.035)) < P.r * 1.8 && !foe.ko && (zone.dazed = true)) powerHit(m, i, pw.kind, [foe.x, foe.y + 0.03], P.dmg, { kb: 0.06, up: 0, stun: 20, dizzy: P.dizzy, blocked: false });
    } else if (pw.kind === 'carozo') {
      const P = POWERS.carozo;
      m.shots.push({ id: m.nextShot++, by: i, x: center[0], y: foe.y + 0.02, vx: f.facing * P.speed, vy: 0, r: P.r, dmg: P.dmg * sm, life: P.life, kind: 'carozo' });
    } else if (pw.kind === 'muralla') {
      f.wall = POWERS.muralla.frames;
    } else if (pw.kind === 'trompo') {
      // La vuelta entera del chupetín, pero a propósito: tres vueltas parejas.
      const P = POWERS.trompo;
      f.whirlDir = f.facing;
      f.whirlD = Math.PI * 6;
      f.whirlV = f.whirlD / (P.go * dt);
      f.whirlA = 0;
      f.whirl = 1e-4;
    }
    if (pw.kind === 'queso') {
      const P = POWERS.queso;
      const cx = f.x + f.facing * P.ahead;
      if (Math.abs(foe.x - cx) < P.reach && Math.abs(foe.y - f.y) < 0.05) {
        const guard = foe.guard >= FIGHT.guardReady && foe.grounded && foe.arms.length > 0;
        powerHit(m, i, 'queso', [cx, f.y + 0.025], P.dmg * sm, { kb: 0.08, up: 0, stun: guard ? 0 : 20, dizzy: guard ? 0 : P.dizzy, blocked: guard });
      }
    } else if (pw.kind === 'arbolitos') {
      // LLUVIA: los ramitos salen disparados para arriba desde la copa y caen sobre el rival, repartidos en una franja (cada uno
      // con su tiro parabólico exacto: tiempo de vuelo distinto, así llueven de a poco).
      const P = POWERS.arbolitos;
      const top = Math.max(...f.model.body.map((b) => Math.max(b.a[1], b.b[1]) + b.r));
      const x0 = f.x + f.facing * 0.005;
      const y0 = f.y + top * 0.9;
      const g = G * 0.6;
      for (let n = 0; n < P.n; n++) {
        const u = ((n * 7) % P.n) / (P.n - 1);
        const xt = foe.x + (u - 0.5) * P.rain;
        const T = 0.55 + 0.35 * (((n * 5) % 7) / 6);
        const yt = foe.y + 0.015;
        m.shots.push({ id: m.nextShot++, by: i, x: x0, y: y0, vx: (xt - x0) / T, vy: (yt - y0 + 0.5 * g * T * T) / T, r: P.r, dmg: P.dmg * sm, life: P.life, kind: 'arbolitos' });
      }
    } else if (pw.kind === 'cascaras') {
      // Cáscaras: el huevo se descascara a lo bruto y las tira en abanico, en arco (con gravedad) hacia el rival; las que no pegan
      // quedan en la tabla (`stepShots`).
      const P = POWERS.cascaras;
      const top = Math.max(...f.model.body.map((b) => Math.max(b.a[1], b.b[1]) + b.r));
      const x0 = f.x + f.facing * 0.01;
      const y0 = f.y + top * 0.6;
      const base = Math.atan2(foe.y + 0.04 - y0, foe.x - x0) + f.facing * 0.35;
      for (let n = 0; n < P.n; n++) {
        const a = base + (n / (P.n - 1) - 0.5) * P.spread * f.facing;
        const sp = P.speed * (0.85 + 0.3 * ((n * 7) % 5) / 4);
        m.shots.push({ id: m.nextShot++, by: i, x: x0, y: y0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: P.r, dmg: P.dmg * sm, life: P.life, kind: pw.kind });
      }
    } else if (pw.kind === 'avalancha') {
      // Avalancha: una ola de granos que corre por la TABLA hacia el rival; se esquiva saltando.
      const P = POWERS.avalancha;
      for (let n = 0; n < P.n; n++) {
        m.shots.push({ id: m.nextShot++, by: i, x: f.x + f.facing * (0.015 + 0.004 * (n % 7)), y: P.r + 0.004 * ((n * 5) % 3), vx: f.facing * P.speed * (0.9 + 0.2 * ((n * 3) % 4) / 3), vy: 0, r: P.r, dmg: P.dmg * sm, life: P.life, kind: 'avalancha' });
      }
    } else if (pw.kind === 'metralla') {
      const P = POWERS.metralla;
      // Los granos salen del puño de adelante, en abanico hacia el rival, y caen con la gravedad.
      const k = f.arms[0];
      const pts = k !== undefined ? f.cur[k] : null;
      const x0 = pts ? pts[pts.length - 2] : center[0];
      const y0 = pts ? pts[pts.length - 1] : center[1];
      const base = Math.atan2(foe.y + 0.022 - y0, foe.x - x0) + f.facing * 0.12;
      for (let n = 0; n < P.n; n++) {
        const a = base + (n / (P.n - 1) - 0.5) * P.spread * f.facing;
        const sp = P.speed * (0.85 + 0.3 * ((n * 7) % 5) / 4);
        m.shots.push({ id: m.nextShot++, by: i, x: x0, y: y0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: P.r, dmg: P.dmg * sm, life: P.life });
      }
      f.armorLoss = P.armorLoss;
    }
    return;
  }
  if (pw.kind === 'rodada') {
    const P = POWERS.rodada;
    if (!pw.hit) {
      f.vx = f.facing * P.speed;
      f.roll += (P.speed / 0.02) * dt;
      const ra = Math.max(...f.model.body.map((b) => b.r));
      const rb = Math.max(...foe.model.body.map((b) => b.r));
      // Si el otro saltó, el huevo pasa por abajo.
      if (gap < ra + rb + 0.008 && (foe.grounded || foe.air < 4) && Math.sign(foe.x - f.x) === f.facing) {
        pw.hit = true;
        powerHit(m, i, 'rodada', [f.x + f.facing * ra, f.y + ra], P.dmg * sm, { kb: P.kb, up: 0.25, stun: P.stun });
        f.vx = -f.facing * 0.15;
        pw.t = Math.max(pw.t, P.go - 10);
      }
      if (Math.abs(f.x) >= FIGHT.arenaHalf - 1e-4) pw.t = Math.max(pw.t, P.go - 10);
    }
  }
  // Golpes en tiempos fijos (trompo: 3 vueltas; acupuntura: 5 pinchazos) si el rival está al alcance.
  if (pw.kind === 'trompo' || pw.kind === 'acupuntura') {
    const P = POWERS[pw.kind];
    if (P.hits.includes(pw.t) && gap < P.reach && Math.abs(foe.y - f.y) < 0.06) {
      powerHit(m, i, pw.kind, [(f.x + foe.x) / 2, f.y + 0.025], P.dmg * sm, { kb: pw.kind === 'trompo' ? POWERS.trompo.kb : 0.03, up: 0, stun: P.stun });
    }
  }
  if (pw.t >= POWERS[pw.kind].go) f.pw = null;
}

/** Nombres de la extremidad k para las claves: por lado ('armR') y por posición frente al rival ('armF' adelante, 'armB' atrás). */
function tagsOf(f: FighterState, k: number): LimbTag[] {
  const l = f.model.limbs[k];
  const role = l.role === 'leg' ? 'leg' : 'arm';
  const mates = f.model.limbs.map((_, j) => j).filter((j) => (f.model.limbs[j].role === 'leg' ? 'leg' : 'arm') === role);
  const front = mates.reduce((a, b) => (fwd(f, f.model.limbs[a].pivot) >= fwd(f, f.model.limbs[b].pivot) ? a : b));
  return [`${role}${l.side}`, `${role}${k === front ? 'F' : 'B'}`] as LimbTag[];
}

/** Pose de la extremidad k en el cuadro actual del ataque: interpola entre claves (suave); sin clave, su reposo. */
function movePose(f: FighterState, k: number): Q {
  const mv = MOVES[f.mv!.id];
  const l = f.model.limbs[k];
  const tags = tagsOf(f, k);
  const t = f.mv!.t;
  const rest: Q = l.role === 'leg' && f.stance[k] ? f.stance[k] : QI();
  const dirOf = (key: (typeof mv.keys)[number]): V3 => {
    const v = key.limbs?.[tags[0]] ?? key.limbs?.[tags[1]];
    if (!v) return qRot(rest, l.dir);
    // x = hacia el rival (con el giro hacia la cámara), y = arriba, z = hacia afuera de su lado (en profundidad).
    const F = fwdAxis(f), D = gaitAxis(f);
    const out = Math.sign(dotv(l.pivot, D)) || (l.side === 'L' ? 1 : -1);
    return normv(addv(addv(scl(F, v[0]), [0, v[1], 0]), scl(D, v[2] * out)));
  };
  let a = mv.keys[0], b = mv.keys[mv.keys.length - 1];
  for (const key of mv.keys) {
    const has = key.limbs && (key.limbs === MOVE_REST || tags.some((g) => key.limbs![g]));
    if (key.t <= t && has) a = key;
    if (key.t >= t && has) { b = key; break; }
  }
  const span = b.t - a.t;
  const e0 = span > 0 ? clamp((t - a.t) / span, 0, 1) : 1;
  const e = e0 * e0 * (3 - 2 * e0);
  const d0 = dirOf(a), d1 = dirOf(b);
  return qFromTo(l.dir, normv(addv(scl(d0, 1 - e), scl(d1, e))));
}

/** Avanza el ataque hecho a mano: impulsos de las claves, fases (para que el otro lo lea) y ventanas de golpe. */
function stepMove(m: Match, i: 0 | 1): void {
  const f = m.f[i];
  const b = m.f[1 - i];
  const mv = MOVES[f.mv!.id];
  const t = ++f.mv!.t;
  for (const key of mv.keys) if (key.t === t) {
    if (key.vx) f.vx = f.facing * key.vx;
    if (key.vy) { f.vy = key.vy; f.grounded = false; }
    if (key.wt) f.wt += key.wt;
    if (key.inv) f.inv = Math.max(f.inv, key.inv);
    if (key.dx) f.x = clamp(f.x + f.facing * key.dx, -FIGHT.arenaHalf, FIGHT.arenaHalf);
  }
  const live = mv.hits.findIndex((h) => t >= h.from && t <= h.to);
  const tags = new Set(mv.hits.flatMap((h) => h.with));
  f.limbs.forEach((s, k) => {
    s.active = false;
    if (!tagsOf(f, k).some((g) => tags.has(g))) return;
    s.phase = live >= 0 ? 'strike' : t < mv.hits[mv.hits.length - 1].to ? 'windup' : 'recover';
    s.t = t;
  });
  if (live >= 0 && !f.mv!.hit[live] && !b.ko && b.inv <= 0 && b.down <= 0) {
    const h = mv.hits[live];
    const bodies = b.model.body.map((sh) => { const A = toWorld(b, sh.a), B = toWorld(b, sh.b); return { A, B, r: sh.r }; });
    let at: [number, number] | null = null;
    for (const w of h.with) {
      if (w === 'body') {
        for (const mine of f.model.body) {
          const A = toWorld(f, mine.a), B = toWorld(f, mine.b);
          for (const o of bodies) if (segSegD(A[0], A[1], B[0], B[1], o.A[0], o.A[1], o.B[0], o.B[1]) < mine.r + o.r + 0.004) at = [(A[0] + o.A[0]) / 2, (A[1] + o.A[1]) / 2];
        }
        continue;
      }
      f.model.limbs.forEach((l, k) => {
        if (!tagsOf(f, k).includes(w)) return;
        const c = f.cur[k];
        l.points.forEach((p, j) => {
          if (p.inside) return;
          const x = c[2 * j], y = c[2 * j + 1];
          for (const o of bodies) if (segD(x, y, o.A[0], o.A[1], o.B[0], o.B[1]) < o.r + p.r) at = [x, y];
        });
      });
    }
    // Lo bajo pasa por arriba si el otro saltó.
    if (at && mv.guard === 'low' && !b.grounded) at = null;
    if (at) {
      f.mv!.hit[live] = true;
      moveHit(m, i, mv, at);
    }
  }
  if (t >= mv.total) {
    f.mv = null;
    for (const s of f.limbs) if (s.phase !== 'rest') { s.phase = 'recover'; s.t = FIGHT.recoverMax - 6; }
  }
}

/** Un ataque hecho a mano toca al rival: guardia (bloquea, se rompe o no sirve), atajada, daño, aturdimiento y empujón. */
function moveHit(m: Match, i: 0 | 1, mv: (typeof MOVES)[string], at: [number, number]): void {
  const a = m.f[i];
  const b = m.f[1 - i];
  const dir = Math.sign(b.x - a.x) || a.facing;
  const guarding = b.guard >= FIGHT.guardReady && b.grounded && (b.arms.length > 0 || !!b.shieldPose) && dir === -b.facing && mv.guard !== 'low';
  if (guarding && b.guardT <= FIGHT.parry.window) {
    a.lock = Math.max(a.lock, FIGHT.parry.open);
    a.mv = null;
    b.meter = Math.min(FIGHT.power.max, b.meter + FIGHT.parry.meter);
    m.events.push({ type: 'parry', who: (1 - i) as 0 | 1 });
    m.hitstop = Math.max(m.hitstop, 4);
    return;
  }
  const blocked = guarding && mv.guard === 'block';
  if (guarding && mv.guard === 'break') {
    b.guardBreak = FIGHT.guardBreak.frames;
    m.events.push({ type: 'guardBreak', who: (1 - i) as 0 | 1 });
  }
  const d = soak(m, b, mv.dmg * (blocked ? FIGHT.chip : 1));
  b.hp = Math.max(0, b.hp - d);
  b.lastHurt = m.frame;
  b.meter = Math.min(FIGHT.power.max, b.meter + d * FIGHT.power.onHurt);
  a.meter = Math.min(FIGHT.power.max, a.meter + d * FIGHT.power.onHit * (blocked ? FIGHT.power.blockedMul : 1));
  b.vx = dir * mv.kb * (blocked ? 0.45 : 1) * (b.wall > 0 ? 0 : 1);
  if (blocked) {
    b.block = Math.max(b.block, FIGHT.blockstun);
    b.counter = FIGHT.blockstun + FIGHT.chain.counterWindow;
  } else if (b.wall <= 0) {
    b.stun = Math.max(b.stun, mv.stun);
    b.chain = null;
    b.buffer = null;
    b.mv = null;
    b.squat = 0;
    interrupt(b);
    b.wt += (dir === -b.facing ? -1 : 1) * Math.min(4, 10 * mv.kb);
    if (mv.down && b.grounded) {
      b.down = mv.down;
      m.events.push({ type: 'down', who: (1 - i) as 0 | 1 });
    }
  }
  m.hitstop = Math.max(m.hitstop, blocked ? 3 : 5);
  m.events.push({ type: 'hit', by: i, at, damage: d, kind: 'light', blocked, shield: false, shieldPiece: null, piece: mv.id, speed: 1, combo: 1, heavy: mv.dmg >= 9, chain: null });
}

/** Granos en la tabla: la quinoa los reabsorbe al pisarlos (o solos, al rato) y recupera vida; un golpe al ras los dispersa. */
function stepPiles(m: Match): void {
  const G2 = FIGHT.grains;
  for (let n = m.piles.length - 1; n >= 0; n--) {
    const p = m.piles[n];
    p.t++;
    const found = m.f.findIndex((f) => f.model.absorb);
    if (found < 0) { m.piles.splice(n, 1); continue; }
    const qi = found as 0 | 1;
    const q = m.f[qi], o = m.f[1 - qi];
    // Un golpe al ras de la tabla sobre el montón lo desparrama (fuera de la tabla).
    let scattered = false;
    o.limbs.forEach((s, k) => {
      if (scattered || s.phase !== 'strike') return;
      const c = o.cur[k];
      for (let j = 0; j < c.length; j += 2) if (c[j + 1] < G2.sweepH && Math.abs(c[j] - p.x) < G2.sweepR) scattered = true;
    });
    if (scattered) {
      m.piles.splice(n, 1);
      m.events.push({ type: 'scatter', who: qi, pile: p.id });
    } else if (!q.ko && (Math.abs(q.x - p.x) < G2.pickR || p.t >= G2.life)) {
      q.hp = Math.min(FIGHT.hp, q.hp + p.n * G2.back);
      m.piles.splice(n, 1);
      m.events.push({ type: 'reabsorb', who: qi, pile: p.id });
    }
  }
}

/** Lo que hay en la tabla: cáscaras que se pisan y raíces que brotan. */
function stepGround(m: Match): void {
  const P = POWERS.cascaras;
  for (let n = m.traps.length - 1; n >= 0; n--) {
    const t = m.traps[n];
    const b = m.f[1 - t.by];
    // Se pisa con un pie apoyado (o con el cuerpo, si se arrastra) justo encima.
    let step = false;
    if (!b.ko && b.grounded && b.inv <= 0) {
      b.model.limbs.forEach((l, k) => {
        if (step || l.role !== 'leg') return;
        const arr = b.cur[k];
        l.points.forEach((q, j) => {
          if (!q.inside && arr[2 * j + 1] < q.r + 0.003 && Math.abs(arr[2 * j] - t.x) < q.r + P.trapR) step = true;
        });
      });
      if (!b.legs.length && Math.abs(b.x - t.x) < P.trapR * 2) step = true;
    }
    if (step) {
      powerHit(m, t.by, 'cascaras', [t.x, 0.004], P.trapDmg, { kb: 0.03, up: 0, stun: P.trapStun, blocked: false });
      m.traps.splice(n, 1);
      m.events.push({ type: 'trap', who: t.by, x: t.x, step: true });
    } else if (--t.life <= 0) m.traps.splice(n, 1);
  }
  const R = POWERS.raices;
  for (let n = m.roots.length - 1; n >= 0; n--) {
    const r = m.roots[n];
    if (++r.t === R.delay) {
      const b = m.f[1 - r.by];
      // Saltando se esquiva; parado encima, lo agarran: queda clavado al piso un rato.
      const hit = !b.ko && b.grounded && b.inv <= 0 && Math.abs(b.x - r.x) < R.r;
      if (hit) {
        powerHit(m, r.by, 'raices', [r.x, 0.01], R.dmg, { kb: 0, up: 0, stun: R.hold, blocked: false });
        b.vx = 0;
      }
      m.events.push({ type: 'roots', who: r.by, x: r.x, hit });
    }
    if (r.t >= R.delay + R.show) m.roots.splice(n, 1);
  }
}

/** Zonas en la tabla: daño por segundo y el rival pifia más mientras está adentro. */
function stepZones(m: Match): void {
  for (let n = m.zones.length - 1; n >= 0; n--) {
    const z = m.zones[n];
    const b = m.f[1 - z.by];
    if (!b.ko && Math.abs(b.x - z.x) < z.r && Math.abs(b.y - z.y) < z.r) {
      b.hp = Math.max(0, b.hp - soak(m, b, POWERS[z.kind].dps * dt));
      b.blind = Math.max(b.blind, 2);
      b.blindMul = POWERS[z.kind].blind;
      // Entrar al olor también marea (una vez por nube): queda quieto, atontado.
      if (!z.dazed && b.stun <= 0) {
        z.dazed = true;
        b.dizzyT = POWERS[z.kind].dizzy;
        b.stun = Math.max(b.stun, POWERS[z.kind].dizzy);
        m.events.push({ type: 'dizzy', who: (1 - z.by) as 0 | 1 });
      }
    }
    if (--z.life <= 0) m.zones.splice(n, 1);
  }
}

/** Granos en el aire: caen con la gravedad y pegan al tocar el cuerpo del rival (o rebotan en su guardia). */
function stepShots(m: Match): void {
  for (let n = m.shots.length - 1; n >= 0; n--) {
    const sh = m.shots[n];
    if (sh.kind !== 'carozo' && sh.kind !== 'avalancha') sh.vy -= G * 0.6 * dt;
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    const b = m.f[1 - sh.by];
    let hit = false;
    if (!b.ko) {
      for (const c of b.model.body) {
        const A = toWorld(b, c.a);
        const B = toWorld(b, c.b);
        if (segD(sh.x, sh.y, A[0], A[1], B[0], B[1]) < c.r + sh.r) hit = true;
      }
      // La avalancha corre al ras: barre las PIERNAS (si no, pasaba por debajo del cuerpo).
      if (sh.kind === 'avalancha' && !hit) b.model.limbs.forEach((l, k) => {
        const arr = b.cur[k];
        l.points.forEach((p, j) => {
          if (!p.inside && Math.hypot(arr[2 * j] - sh.x, arr[2 * j + 1] - sh.y) < p.r + sh.r + 0.002) hit = true;
        });
      });
    }
    if (hit) {
      const blocked = b.guard >= FIGHT.guardReady && b.grounded && b.arms.length > 0 && Math.sign(sh.vx) === -b.facing;
      if (sh.kind === 'carozo') powerHit(m, sh.by, 'carozo', [sh.x, sh.y], sh.dmg, { kb: 0.2, up: 0, stun: 12, dizzy: POWERS.carozo.dizzy, blocked });
      else powerHit(m, sh.by, sh.kind ?? 'metralla', [sh.x, sh.y], sh.dmg, { kb: sh.kind === 'arbolitos' ? 0.015 : 0.05, up: 0, stun: sh.kind === 'arbolitos' ? 2 : 5, blocked });
    }
    // Las cáscaras que no pegan caen y QUEDAN en la tabla (a la vista): el que las pisa se lastima.
    if (!hit && sh.kind === 'cascaras' && sh.y < 0 && Math.abs(sh.x) < FIGHT.arenaHalf) {
      const P = POWERS.cascaras;
      if (m.traps.length >= P.maxTraps) m.traps.shift();
      m.traps.push({ id: m.nextShot++, x: sh.x, by: sh.by, life: P.trapLife });
      m.events.push({ type: 'trap', who: sh.by, x: sh.x, step: false });
    }
    if (hit || --sh.life <= 0 || sh.y < 0 || Math.abs(sh.x) > FIGHT.arenaHalf + 0.05) m.shots.splice(n, 1);
  }
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
  if (fighting && !f.ko && !f.pw) f.meter = Math.min(FIGHT.power.max, f.meter + FIGHT.power.passive * dt);
  if (f.armorLoss > 0) f.armorLoss = Math.max(0, f.armorLoss - POWERS.metralla.armorLoss / POWERS.metralla.regrow);
  if (f.inv > 0) f.inv--;
  if (f.wall > 0) f.wall--;
  if (f.blind > 0) f.blind--;
  if (f.guardBreak > 0) f.guardBreak--;
  if (f.down > 0 && --f.down === 0) f.inv = FIGHT.getUpInv;
  if (f.juggle >= 0 && f.grounded && f.vy <= 0) f.juggle = -1;
  const canAct = fighting && !f.ko && f.stun <= 0 && f.block <= 0 && f.down <= 0;
  const input = canAct ? inp : IDLE;
  const busy = !!f.pw || !!f.mv || f.limbs.some((s) => s.phase === 'windup' || s.phase === 'strike');
  f.held = input === IDLE ? (inp.quadHeld === undefined ? undefined : null) : input.quadHeld;
  // Atajada justa: cuadros desde que se APRETÓ la guardia.
  f.guardT = input.guard && !f.guardIn ? 0 : f.guardT + 1;
  f.guardIn = !!input.guard;
  // Pasito: doble toque de flecha (en el motor, con el historial de la entrada).
  if (input.x !== 0 && f.lastX === 0) {
    if (input.x === f.tapDir && m.frame - f.tapT <= FIGHT.dash.taps && f.grounded && !busy && f.dash <= 0) {
      f.dash = FIGHT.dash.frames;
      f.dashDir = input.x;
      if (input.x === -f.facing) f.inv = Math.max(f.inv, FIGHT.dash.backInv);
      f.tapDir = 0;
      m.events.push({ type: 'dash', who: i });
    } else {
      f.tapDir = input.x;
      f.tapT = m.frame;
    }
  }
  f.lastX = input.x;

  // Mira siempre al rival (como en los juegos de pelea): giro de 180°, no espejo.
  const toFoeRaw: 1 | -1 = foe.x >= f.x ? 1 : -1;
  // Escudo en la espalda: se da vuelta y le muestra la papita al rival.
  const toFoe: 1 | -1 = f.shieldPose?.turned ? (-toFoeRaw as 1 | -1) : toFoeRaw;
  if (!f.ko && f.grounded && !busy && f.whirl <= 0 && toFoe !== f.facing && Math.abs(foe.x - f.x) > 0.004) {
    f.facing = toFoe;
    f.turnT = 0;
    f.tilt = -f.tilt;
    f.wt = -f.wt;
  }

  // Cubrirse: con un escudo (papita, nacho) si le queda alguno; si no, con los brazos. No mientras paga un golpe.
  const shield = liveShield(f);
  const guardHeld = !!input.guard && f.grounded && f.lock <= 0 && f.guardBreak <= 0 && (f.arms.length > 0 || !!shield);
  f.shieldPose = guardHeld && shield ? shieldPose(f, shield) : null;
  const crouchHeld = (!!input.down && f.grounded && !guardHeld) || f.squat > 0 || (f.pw?.kind === 'rodada' && f.pw.phase === 'wind');
  f.guard += ((guardHeld ? 1 : 0) - f.guard) * 0.22;
  f.crouch += ((crouchHeld ? 1 : 0) - f.crouch) * (f.squat > 0 ? 0.45 : 0.2);
  if (input.punch) f.buffer = { kind: f.grounded ? 'arm' : 'air', t: FIGHT.buffer };
  // ↓ + brazo = GANCHO, ↓ + pierna = BARRIDA.
  if (input.quad) f.buffer = { kind: input.quad[1] === 'L' ? 'kick' : f.grounded ? 'arm' : 'air', t: FIGHT.buffer, quad: input.quad, move: input.down && f.grounded ? (input.quad[1] === 'L' ? 'sweep' : 'upper') : 'normal' };
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
  // Ataque hecho a mano (rivales): arranca con su aviso.
  if (input.move && MOVES[input.move] && !busy && f.grounded && f.lock <= 0) {
    f.mv = { id: input.move, t: 0, hit: [] };
    f.buffer = null;
    m.events.push({ type: 'move', who: i, id: input.move, tell: MOVES[input.move].tell });
  }
  if (f.mv) stepMove(m, i);
  // Huevo en fase 2 (se rajó): ataca un 20 % más rápido (un paso extra cada 4).
  if (f.mv && f.model.jelly && f.hp < FIGHT.phase2 && m.frame % 4 === 0) stepMove(m, i);
  // Un golpe por vez: no arranca otro mientras uno carga o pega, ni mientras paga el anterior (salvo una combinación, que sigue
  // el impulso del golpe que acertó).
  if (f.buffer && canAct && !busy && !f.wobbly && f.guard < 0.3 && f.squat <= 0) {
    const combo = comboFor(f, f.buffer.kind);
    if ((f.strikeCool <= 0 && f.lock <= 0) || combo) {
      const k = pickLimb(f, f.buffer.kind, !!combo, f.buffer.quad);
      if (k >= 0) {
        // Pegar sin parar (golpe tras golpe, con el botón que sea) marca un ritmo que el rival lee: cada golpe seguido pega menos
        // y lo ataja más (ver `FIGHT.repeat`). Parar un momento lo evita. Encadenar después de acertar no suma, pero tampoco lo
        // borra (antes lo borraba: golpe, UNO-DOS, golpe… pegaba siempre entero aporreando).
        f.repeat = m.frame - f.lastStrikeF < FIGHT.repeat.window ? f.repeat + (combo ? 0 : 1) : 0;
        f.lastStrikeF = m.frame;
        startStrike(m, i, k, f.buffer.kind, combo, f.model.limbs[k].rigid ? 'normal' : f.buffer.move);
        f.limbs[k].worn = Math.max(FIGHT.repeat.min, 1 - FIGHT.repeat.step * f.repeat) * (f.blind > 0 ? f.blindMul : 1);
        // Golpe rápido / cargado: se sigue cuánto se mantiene el botón (sólo con cuadrante y si la entrada lo informa).
        if (f.buffer.quad && f.held !== undefined && !combo && !f.model.limbs[k].rigid) {
          f.limbs[k].hold = 0;
          f.limbs[k].holdQuad = f.buffer.quad;
        }
        f.buffer = null;
      }
    }
  }

  // ── Poder especial ──
  const U = FIGHT.powerUse;
  const wantPw = !!inp.power || f.pwBuf > 0;
  if (f.pwBuf > 0) f.pwBuf--;
  if (wantPw && canAct && f.model.power && f.grounded && f.squat <= 0 && !f.pw) {
    // La barra tiene DOS mitades. TU CHIZITO: con media barra, OLOR A PATA; con la barra llena, la CALESITA DEL DOLOR (tres
    // vueltas que pegan). Justo después de acertar sale como REMATE (cancela la vuelta del golpe).
    // Los rivales tienen un solo poder, con la barra llena.
    const mine = f.model.power === 'queso';
    const remate = !!f.chain && f.chain.t > 0;
    const full = f.meter >= FIGHT.power.max;
    const halfKind = mine ? 'olor' : f.model.power2;
    if ((full || (halfKind && f.meter >= U.half)) && (remate || !busy)) {
      f.meter -= full ? FIGHT.power.max : U.half;
      if (remate) {
        f.lock = 0;
        for (const q of f.limbs) if (q.phase !== 'rest') { q.phase = 'recover'; q.t = FIGHT.recoverMax; }
      }
      const kind = full ? (mine ? 'trompo' : f.model.power) : halfKind!;
      f.pw = { kind, phase: 'wind', t: 0, hit: false };
      f.buffer = null;
      f.pwBuf = 0;
      m.events.push({ type: 'power', who: i, kind, phase: 'wind', use: full ? 'super' : 'remate' });
    }
  }
  if (f.pw) stepPower(m, i);
  // La vuelta de carnero termina en una vuelta entera (así queda parado, no de cabeza).
  if (f.roll !== 0 && f.pw?.phase !== 'go') {
    const end = Math.ceil(f.roll / (Math.PI * 2) - 1e-6) * Math.PI * 2;
    f.roll = Math.min(end, f.roll + 14 * dt);
    if (f.roll >= end) f.roll = 0;
  }

  // ── Articulaciones ──
  const moving = Math.abs(f.vx) > 0.01 && f.grounded;
  const gaitAmp = moving ? FIGHT.gait * clamp(Math.abs(f.vx) / Math.max(f.speed, 1e-3), 0.3, 1) : 0;
  const legLen = f.legs.length ? f.legs.reduce((s, k) => s + M.limbs[k].reach, 0) / f.legs.length : 0.02;
  f.gait += (Math.abs(f.vx) * dt * Math.PI * 2) / (FIGHT.strideK * legLen);
  let react = 0;
  M.limbs.forEach((l, k) => {
    const s = f.limbs[k];
    if (f.ko) return koSettle(f, k);
    s.koQ = null;
    if (f.mv) {
      // Ataque hecho a mano: la pose sale de las claves (el PD no interviene).
      const q = movePose(f, k);
      s.w = scl(qToVec(qMul(q, qConj(s.q))), 1 / dt);
      s.q = q;
      return;
    }
    if (l.rigid) {
      // El chupetín y lo que atraviesa no giran solos: si pegan, pega el cuerpo entero (ver la inclinación más abajo).
      // Aturdido con la carga del chupetín: la carga queda en pausa (no avanza ni se pierde).
      if (s.phase !== 'rest' && !(s.phase === 'windup' && f.stun > 0)) s.t++;
      // El chupetín acompaña el golpe con un gesto corto (atrás al cargar, adelante al soltar): se ve con CUÁL pega.
      if (!l.through) {
        const G = FIGHT.swing.gesture;
        const a = s.phase === 'windup' ? -G.back * Math.min(1, s.t / FIGHT.swing.windFrames) : s.phase === 'strike' ? -G.back + (G.back + G.fwd) * Math.min(1, s.t / G.frames) : s.phase === 'recover' ? G.fwd * Math.max(0, 1 - s.t / 14) : 0;
        const q = a ? qAxis(s.axis, a) : QI();
        s.w = scl(qToVec(qMul(q, qConj(s.q))), 1 / dt);
        s.q = q;
      }
      if (s.phase === 'windup' && s.t >= FIGHT.swing.windFrames + s.charge) {
        s.phase = 'strike';
        s.t = 0;
        if (f.swing) f.swing.t0 = f.twist;
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
    const guided = (goal: number, g: { wn: number; zeta: number }, boost = 1, ahead = 1.5): void => {
      const lead = clamp(goal, s.phi - 1.5, s.phi + ahead);
      react += drive(f, k, qAxis(s.axis, lead), g, boost);
    };
    if (s.phase === 'windup') {
      const H = FIGHT.hold;
      if (s.hold >= 0 && !s.released) {
        if (f.held === s.holdQuad) s.hold++;
        else {
          s.released = true;
          // Soltó enseguida: golpe RÁPIDO (carga corta, pega menos). Lo pesado no tiene rápido.
          if (s.hold < H.quick && l.kind !== 'heavy') {
            s.power = H.quickMul;
            s.windup *= H.quickArc;
          }
        }
      }
      const charging = s.hold >= 0 && !s.released && s.hold < H.max;
      // Mientras carga, la extremidad tiembla apenas (se está "endureciendo").
      react += drive(f, k, qAxis(s.axis, clamp(s.windup, s.phi - 1.5, s.phi + 1.5) + (s.charge || charging ? Math.sin(s.t * 1.7) * FIGHT.charge.tremble : 0)), FIGHT.joint.windup);
      if (!charging && ((Math.abs(s.phi - s.windup) < 0.12 && s.t >= FIGHT.windMin + s.charge) || s.t > FIGHT.windMax + s.charge)) {
        // Lo mantuvo: golpe CARGADO, de 1 a 1,6 según cuánto; la carga completa rompe la guardia.
        if (s.hold >= H.quick) {
          s.power = 1 + (H.fullMul - 1) * clamp((s.hold - H.quick) / (H.max - H.quick), 0, 1);
          s.breaker = s.hold >= H.max;
        }
        s.phase = 'strike';
        s.t = 0;
        // Al soltar el peso va adelante: el cuerpo acompaña la piña (una patada empuja menos: se para en la otra pierna).
        f.vx += f.facing * FIGHT.lunge * (f.grounded ? 1 : 0.3) * (1 - f.crouch) * (l.role === 'leg' ? 0.5 : 1);
      }
      return;
    }
    if (s.phase === 'strike') {
      // Activo según dónde ESTABA al empezar el paso: el paso que cruza el final del arco también cuenta (el contacto es barrido).
      const phi0 = s.phi;
      // UN movimiento: el golpe apunta desde el principio más allá del objetivo (lo que seguiría de largo si pifia), así no frena
      // en el final del arco para después volver a arrancar; si no tocó nada, pifió apenas pasa el punto de impacto.
      const through = FIGHT.follow.angle + FIGHT.follow.k * (l.mass / M.bodyMass);
      guided(s.target + through, FIGHT.joint.strike, FIGHT.strikeBoost, (s.target - s.windup) / FIGHT.strikeMinFrames);
      s.active = !s.landed && phi0 < s.target - 0.12 && s.t < FIGHT.strikeMax;
      if (!s.active) endStrike(m, i, k);
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
    if (f.down > 12 || f.pw?.phase === 'go' && f.pw.kind === 'rodada') {
      // Noqueado (o hecho bola para rodar): las extremidades se aflojan y caen pegadas al cuerpo (a lo largo de su eje), así queda acostado sobre la
      // mesa y no apuntalado en el aire por varas rígidas. Las de arriba hacia arriba, las de abajo hacia abajo, apenas abiertas.
      const along = l.dir[1] >= 0 ? 1 : -1;
      const out = normv([l.dir[0] * 0.25, along, l.dir[2] * 0.25]);
      target = qFromTo(l.dir, out);
      g = FIGHT.joint.recover;
    }
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
      // Paso de verdad: la pierna que va hacia adelante se LEVANTA (gira hacia afuera, un contoneo) y el cuerpo queda sobre la
      // otra, que sí pisa. Sin esto los dos pies se deslizaban apoyados como tijeras y parecía un títere colgado.
      if (gaitAmp > 0 && f.air <= 5 && f.legs.length >= 2) {
        const ph = f.gait + (n % 2) * Math.PI;
        const lift = FIGHT.gaitLift * Math.max(0, Math.cos(ph)) * (gaitAmp / FIGHT.gait);
        const fa = fwdAxis(f);
        const ga = gaitAxis(f);
        const side = Math.sign(dotv(l.pivot, ga)) || (n % 2 ? 1 : -1);
        const out = Math.sign(dotv(rot(qAxis(fa, 1), [0, -1, 0]), ga)) || 1;
        target = qMul(qAxis(fa, side * out * lift), target);
      }
    } else if (M.stance && l.role === 'arm' && s.phase === 'rest' && f.guard <= 0.02 && !f.shieldPose && f.pw?.kind === 'metralla') {
      // Metralla: el brazo de adelante se va atrás (carga) y se estira hacia el rival al tirar los granos.
      const lead = f.arms.indexOf(k) === 0;
      const want = f.pw.phase === 'wind' ? addv(scl(fwdAxis(f), lead ? -0.6 : 0.4), [0, lead ? 0.8 : 0.3, 0]) : addv(scl(fwdAxis(f), 1), [0, lead ? 0.15 : 0.5, 0]);
      target = qFromTo(l.dir, normv(want));
      g = f.pw.phase === 'wind' ? FIGHT.joint.windup : FIGHT.joint.strike;
    } else if (M.stance && l.role === 'arm' && s.phase === 'rest' && f.guard <= 0.02 && !f.shieldPose) {
      // Guardia de boxeador cuando no pega (EL BROCOLOCO: se mueve como una persona): el brazo de adelante al frente y abajo de la
      // cara, el de atrás más alto, cerca; respira (sube y baja apenas) y se mece con el paso.
      const n = f.arms.indexOf(k);
      const lead = n % 2 === 0;
      const dep = dotv(l.dir, gaitAxis(f));
      // Respira solo mientras pelea: terminado el round queda quieto (si no, parecía colgado de un hilo).
      const breath = fighting ? 0.06 * Math.sin(m.frame * 0.07 + n) + 0.05 * Math.sin(f.gait) : 0;
      // La quinoa (brazos cortos y gordos) va como un gorila: puños ABAJO y adelante, colgando (arriba parecían orejas y adelante
      // de la cara se la tapaban todo el tiempo).
      const [fw, up] = M.absorb ? [lead ? 0.8 : 0.55, lead ? -0.45 : -0.6] : [lead ? 0.8 : 0.45, lead ? 0.45 : 0.8];
      const want = normv(addv(addv(scl(fwdAxis(f), fw), [0, up + breath, 0]), scl(gaitAxis(f), dep * 0.5)));
      target = qFromTo(l.dir, want);
      g = FIGHT.joint.guard;
    } else if (l.role === 'arm' && f.guard > 0.02 && s.phase === 'rest' && !f.shieldPose) {
      // Guardia: los brazos se cruzan DELANTE del cuerpo en diagonal (uno arriba, tapando la cabeza, y otro abajo), así son
      // ellos los que reciben el golpe. Lo que pase por fuera de los brazos, pega.
      const n = f.arms.indexOf(k);
      // Delante de lo que más sobresale del cuerpo hacia el rival (con el 3/4, la copa del brócoli asoma más que el tallo), pero
      // PEGADOS al cuerpo: con brazos largos (el huevo) quedaban lejos y abiertos y no se leía que se cubría.
      const gx = Math.max(...M.body.map((b) => Math.max(fwd(f, b.a), fwd(f, b.b)) + b.r)) + (M.moves ? 0.008 : l.reach * 0.3);
      // JUNTOS delante de la cara y el pecho (uno a la altura de la cara, el otro del pecho, cruzados): se lee que se cubre.
      const top = Math.max(...M.body.map((b) => Math.max(b.a[1], b.b[1]) + b.r));
      // Los rivales (marco con el piso en y = 0) recogen los brazos delante de la cara y el pecho; con los brazos largos del huevo
      // uno quedaba arriba de la cabeza y el otro en el piso. Tu chizito sigue con la diagonal (cubre de la cabeza a las piernas).
      const gy = M.moves ? (n % 2 === 0 ? top * 0.88 : top * 0.6) : l.pivot[1] + l.reach * (n % 2 === 0 ? 0.8 : -0.4);
      const gq = qFromTo(l.dir, normv(addv(scl(fwdAxis(f), Math.max(gx - fwd(f, l.pivot), l.reach * 0.25)), [0, gy - l.pivot[1], 0])));
      target = slerpI(gq, f.guard);
      g = FIGHT.joint.guard;
    } else if (f.air > 5 && l.role === 'arm') target = qAxis(gaitAxis(f), 0.3);
    react += drive(f, k, target, g);
  });

  // Apoyado, el cuerpo PIVOTA sobre lo que toca la mesa (la pierna de apoyo): al girar o inclinarse, ese punto no se desliza
  // (antes giraba alrededor de su centro y los pies patinaban, como colgado de un cable).
  const pin = f.grounded ? contactPoint(f) : null;
  const pinOff = pin ? toWorld(f, pin)[0] - f.x : 0;

  // ── Torso: gira con el golpe (el hombro que pega va atrás al cargar y adelante al soltar) ──
  {
    const base = M.yaw ?? FIGHT.stanceYaw;
    const T = FIGHT.twist;
    let want = 0;
    let rate: number = T.rate.rest;
    // Con una pieza fija (chupetín) gira el cuerpo entero, mucho más: es lo que se ve del golpe.
    const sk = f.limbs.findIndex((q) => q.phase === 'windup' || q.phase === 'strike');
    if (sk >= 0 && !f.ko) {
      const l = M.limbs[sk];
      // Hacia dónde girar para llevar ESE hombro hacia el rival: derivada de fwd(pivote) respecto del giro.
      const sg = shoulderSign(f, l.pivot);
      // El hombro de atrás (con la guardia de 3/4 queda más lejos del rival) gira más, para llegar igual de lejos que el de adelante.
      const back = l.role === 'arm' && shoulderSign(f, l.pivot) * Math.sign(base) < 0;
      const amt = l.rigid ? T.swing : l.role === 'leg' ? T.kick : back ? T.armBack : T.arm;
      // Los DOS hombros giran al pegar: el de atrás va adelante con el golpe; el de adelante se echa atrás al cargar y vuelve.
      // Los DOS hombros giran igual de sentido: atrás al cargar y adelante al soltar (antes el de adelante giraba al revés y el
      // golpe parecía venir "de allá hacia acá"). El de adelante gira menos: ya está cerca del rival.
      const front = l.role === 'arm' && !l.rigid && !back;
      want = f.limbs[sk].phase === 'windup' ? -sg * (front ? T.armWind : amt * T.wind) : sg * (front ? T.armFwd : amt);
      // Lo fijo gira alrededor de la cara de frente (giro 0), no de la guardia de 3/4: si no, el hombro de adelante llega antes.
      if (l.rigid) want -= base;
      rate = f.limbs[sk].phase === 'windup' ? T.rate.windup : T.rate.strike;
    }
    const tw0 = f.twist;
    if (f.whirl > 0) {
      // La vuelta del chupetín: el torso queda donde estaba y suma el giro, que frena parejo hasta cerrar la vuelta.
      f.whirl += f.whirlV * dt;
      f.whirlV = Math.max(FIGHT.whirl.minSpeed * FIGHT.whirl.end, f.whirlV - f.whirlA * dt);
      if (f.whirl >= f.whirlD) {
        f.whirl = 0;
        f.twist = 0;
      }
    } else if (sk >= 0 && M.limbs[sk].rigid && f.limbs[sk].phase === 'strike' && !f.ko) {
      // El balanceo con el chupetín gira a velocidad pareja (es el peso que arrastra); si llega al final sin tocar, pifió.
      const d = want - f.twist;
      const stepA = FIGHT.swing.turnSpeed * dt;
      f.twist += Math.sign(d) * Math.min(Math.abs(d), stepA);
      if (Math.abs(d) <= stepA && !f.limbs[sk].landed) {
        // Llegó al final del giro sin tocar nada: en el MISMO cuadro pasa a la vuelta, con la velocidad que traía y lo que le
        // sobraba de este paso (sin frenar ni arrancar de nuevo).
        f.twistV = Math.sign(d) * FIGHT.swing.turnSpeed;
        endStrike(m, i, sk);
        f.whirl = Math.max(1e-4, stepA - Math.abs(d));
      }
    } else f.twist += (want - f.twist) * Math.min(1, rate * dt);
    if (!(f.whirl > 0 && tw0 === f.twist)) f.twistV = (f.twist - tw0) / dt;
    f.yaw = f.whirl > 0 || f.swing ? base + f.twist + (f.whirl > 0 ? f.whirlDir * f.whirl : 0) : clamp(base + f.twist, T.min, T.max);
    f.yc = Math.cos(f.yaw);
    f.ys = Math.sin(f.yaw);
  }

  // ── Cuerpo: avanzar ──
  const wantVx = canAct ? input.x * f.speed * (1 - 0.65 * f.guard) * (1 - f.crouch) : 0;
  const acc = f.grounded ? FIGHT.groundAccel : FIGHT.airAccel;
  if (f.grounded || input.x !== 0) f.vx += clamp(wantVx - f.vx, -acc * dt, acc * dt);
  if (f.dash > 0) {
    f.dash--;
    f.vx = f.dashDir * FIGHT.dash.dist / (FIGHT.dash.frames * dt);
  }
  // Una pierna: avanza a saltitos.
  if (f.legs.length === 1 && f.grounded && canAct && input.x !== 0 && f.hopCool <= 0 && !busy) {
    f.vy = FIGHT.hopSpeed;
    f.grounded = false;
    f.hopCool = FIGHT.hopRest;
  }
  // Noqueado cae PESADO (con la gravedad de juego, flotante, y la cámara lenta del KO parecía que flotaba).
  if (!f.grounded) f.vy -= G * dt * (f.ko ? FIGHT.koFall : 1);
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
  if (f.down > 0) {
    // Derribado por una barrida: se va de espaldas (−) los primeros cuadros y se endereza al final.
    const target = f.down > 12 ? -1.2 : 0;
    const K = W * FIGHT.balanceH * 3;
    tau = -K * (f.tilt - target) - 2 * 0.8 * Math.sqrt(K * f.It) * f.wt;
  } else if (f.ko) {
    // Noqueado: cae y RUEDA hasta quedar quieto donde su centro de masa queda más bajo (lo que haría la gravedad), apoyado en lo
    // que de verdad toca la mesa: el cuerpo, una aceituna, un palito. Antes quedaba frenado a 86° y apuntalado en el aire.
    // El primer medio segundo se desploma (las piernas ya no lo sostienen); después rueda hasta su reposo.
    // Cae ACOSTADO (de espaldas o de frente, hacia donde ya se iba), no de cabeza sobre su parte más pesada.
    const target = (Math.sign(Math.abs(f.tilt) > 0.05 ? f.tilt : f.wt || -1) * Math.PI) / 2;
    const K = W * FIGHT.balanceH * 3 * FIGHT.koFall;
    tau = -K * (f.tilt - target) - 2 * 0.7 * Math.sqrt(K * f.It) * f.wt;
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
    // Enderezarse necesita apoyo: en el aire nada lo sostiene (sin esto flotaba como colgado de un cable); solo el aire frena el giro.
    if (f.grounded) tau += -K * k * (f.tilt - aim) - 2 * FIGHT.balanceZeta * Math.sqrt(K * k * f.It) * f.wt;
    else tau += -0.3 * Math.sqrt(K * f.It) * f.wt;
  }
  tau += FIGHT.reactGain * react;
  f.wt += (tau / f.It) * dt;
  f.tilt += f.wt * dt;
  const lim = f.ko ? 3 : f.shieldPose ? Math.PI * 0.95 : FIGHT.maxTilt;
  if (Math.abs(f.tilt) > lim) {
    f.tilt = Math.sign(f.tilt) * lim;
    if (f.wt * f.tilt > 0) f.wt = 0;
  }
  if (pin) f.x -= toWorld(f, pin)[0] - f.x - pinOff;
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

/** Distancia entre los segmentos pq y ab (mundo 2D): 0 si se cruzan. */
function segSegD(px: number, py: number, qx: number, qy: number, ax: number, ay: number, bx: number, by: number): number {
  const side = (ox: number, oy: number, ux: number, uy: number, vx: number, vy: number): number => (ux - ox) * (vy - oy) - (uy - oy) * (vx - ox);
  if (side(px, py, qx, qy, ax, ay) * side(px, py, qx, qy, bx, by) < 0 && side(ax, ay, bx, by, px, py) * side(ax, ay, bx, by, qx, qy) < 0) return 0;
  return Math.min(segD(px, py, ax, ay, bx, by), segD(qx, qy, ax, ay, bx, by), segD(ax, ay, px, py, qx, qy), segD(bx, by, px, py, qx, qy));
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
    // Invulnerable: pasito atrás, derribado, levantándose, o ya recibió los 3 golpes en el aire después de un gancho.
    if (a.ko || b.ko || b.inv > 0 || b.down > 0 || (b.juggle >= FIGHT.upper.juggle.length && !b.grounded)) continue;
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
        // Contacto BARRIDO: se mide el camino del punto en este paso (de dónde estaba a dónde está), no sólo dónde quedó. Un
        // golpe rápido recorre más de 2 cm por cuadro y atravesaba al rival sin tocarlo.
        const ox = a.prev[k][2 * j];
        const oy = a.prev[k][2 * j + 1];
        const reach = p.r + FIGHT.hitPad;
        const blocker = blockers.find((q) => segD(q.x, q.y, ox, oy, px, py) < q.r + reach);
        let shield: string | null = null;
        if (!blocker) for (const sp of shields) if (segD(sp.x, sp.y, ox, oy, px, py) < sp.r + reach) shield = sp.piece;
        const body = !blocker && !shield && bodies.some((q) => segSegD(ox, oy, px, py, q.ax, q.ay, q.bx, q.by) < q.r + reach);
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
  // Un brazo con aceituna pega PESADO toque con la parte que toque (antes, si rozaba el palito, salía un golpe liviano).
  const kind: HitKind = p.kind === 'shield' || l.kind === 'heavy' ? l.kind : p.kind;
  // Pega con su pieza más fuerte (un brazo con aceituna es un brazo de aceituna: más lento, pega más; orden fijo, ver
  // `pieceDmg`), por lo que ya recorrió el golpe (apoyar no es pegar); las piernas, un poco más.
  const D = FIGHT.pieceDmg;
  let base = 0;
  for (const q of l.points) if (!q.inside) base = Math.max(base, D[q.tier] ?? D.default);
  const travel = l.rigid ? Math.abs(a.twist - (a.swing?.t0 ?? a.twist)) / FIGHT.dmgTwist : (s.phi - s.windup) / FIGHT.dmgArc;
  let dmg = base * clamp(travel, FIGHT.dmgTravel[0], FIGHT.dmgTravel[1]) * (l.role === 'leg' ? FIGHT.legMul : 1);
  const chain = s.combo;
  // Cadena: la CONTRA premia; el resto pega 100 / 90 / 80 / 70 % (piso 50 %).
  if (chain === 'CONTRA') dmg *= FIGHT.chain.mul.CONTRA;
  else if (chain) dmg *= Math.max(FIGHT.chain.floor, 1 - FIGHT.chain.scale * (a.chain?.n ?? 1));
  dmg *= s.worn * s.power;
  // En el aire después de un gancho: 100 / 80 / 60 %.
  if (b.juggle >= 0 && !b.grounded) dmg *= FIGHT.upper.juggle[Math.min(b.juggle, FIGHT.upper.juggle.length - 1)];
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
  // Quinoa: lo rápido se hunde en los granos (40 %, sin aturdir, el brazo queda trabado); lo cargado o pesado la REVIENTA.
  const absorbed = !!b.model.absorb && blockedBy === null && !shield && s.power < FIGHT.grains.burstPower && kind !== 'heavy' && !l.rigid;
  if (absorbed) {
    dmg *= FIGHT.grains.absorb;
    a.lock = Math.max(a.lock, FIGHT.hitLock + FIGHT.grains.stuck);
    m.events.push({ type: 'absorb', who: (1 - i) as 0 | 1, at: [px, py] });
  } else if (b.model.absorb && blockedBy === null) {
    const n = Math.max(1, Math.round(dmg));
    const pile: Pile = { id: m.nextShot++, x: clamp(b.x - a.facing * (FIGHT.grains.spill + 0.006 * (n % 3)), -FIGHT.arenaHalf, FIGHT.arenaHalf), n, t: 0 };
    m.piles.push(pile);
    m.events.push({ type: 'grains', who: (1 - i) as 0 | 1, at: [px, py], n, pile: pile.id, x: pile.x });
  }
  let parry = false;
  if (blocked && b.guardT <= FIGHT.parry.window) {
    // ATAJADA justa: no pasa nada de daño, el que pegó queda abierto y el que atajó gana poder.
    parry = true;
    dmg = 0;
    a.lock = Math.max(a.lock, FIGHT.parry.open);
    b.meter = Math.min(FIGHT.power.max, b.meter + FIGHT.parry.meter);
    m.events.push({ type: 'parry', who: (1 - i) as 0 | 1 });
  } else if (blocked) {
    // GUARDIA ROTA: carga completa, chupetín, o 4 bloqueos en 3 s.
    b.blocks = b.blocks.filter((t) => m.frame - t < FIGHT.guardBreak.window);
    b.blocks.push(m.frame);
    if (s.breaker || l.rigid || b.blocks.length >= FIGHT.guardBreak.blocks) {
      b.guardBreak = FIGHT.guardBreak.frames;
      b.blocks = [];
      m.events.push({ type: 'guardBreak', who: (1 - i) as 0 | 1 });
    }
  }
  if (blocked) {
    if (!parry) dmg *= FIGHT.chip;
    b.block = FIGHT.blockstun;
    // Bloqueó: si suelta la guardia y pega enseguida, sale una CONTRA.
    b.counter = FIGHT.blockstun + FIGHT.chain.counterWindow;
    // Pegarle a una guardia rebota: el que pegó queda un instante sin poder seguir (y el otro tiene su CONTRA).
    a.lock = Math.max(a.lock, FIGHT.blockedLock);
    a.chain = null;
  } else if (absorbed) {
    a.chain = null;
  } else {
    // Acertó: el impulso sigue (combinaciones). Al que recibe se le corta la suya y el salto que estaba por dar.
    a.chain = { n: (a.chain && a.chain.t > 0 ? a.chain.n : 0) + 1, last: l.role === 'leg' && !l.rigid ? 'kick' : 'arm', t: FIGHT.chain.window };
    b.chain = null;
    b.squat = 0;
    b.stun = b.wall > 0 ? 0 : Math.round(FIGHT.hitstun.base + FIGHT.hitstun.k * dmg);
    if (b.wall <= 0) interrupt(b);
    b.buffer = null;
    b.mv = null;
    if (kind === 'heavy') {
      b.dizzy += dmg;
      if (b.dizzy >= FIGHT.dizzyMax) {
        b.dizzy = 0;
        b.stun = FIGHT.dizzyFrames;
        b.dizzyT = FIGHT.dizzyFrames;
        m.events.push({ type: 'dizzy', who: (1 - i) as 0 | 1 });
      }
    }
    // Un golpe gastado por aporrear (`worn`) no llega a cortar: el sangrado premia el golpe limpio, no el ritmo ciego.
    if (kind === 'cut' && s.worn >= FIGHT.bleed.minWorn && b.bleed.length < FIGHT.bleed.max) b.bleed.push(FIGHT.bleed.frames);
    if (b.juggle >= 0 && !b.grounded) b.juggle++;
    if (s.move === 'sweep' && b.grounded) {
      b.down = FIGHT.sweepDown;
      m.events.push({ type: 'down', who: (1 - i) as 0 | 1 });
    }
  }
  dmg = soak(m, b, dmg);
  b.hp = Math.max(0, b.hp - dmg);
  b.lastHurt = m.frame;
  a.meter = Math.min(FIGHT.power.max, a.meter + dmg * FIGHT.power.onHit * (blocked ? FIGHT.power.blockedMul : 1));
  b.meter = Math.min(FIGHT.power.max, b.meter + dmg * FIGHT.power.onHurt);
  // Empujón (con lo que pesa el rival) y giro del cuerpo según la altura del golpe.
  const kb = clamp((FIGHT.knockback * mEff * speed) / b.model.mass, FIGHT.kbClamp[0], FIGHT.kbClamp[1]) * (blocked ? 0.45 : 1) * (chain === 'RÁFAGA' ? 1.4 : 1);
  b.vx = a.facing * kb * (b.wall > 0 ? 0 : 1);
  // El que pega frena en seco contra el otro (acción y reacción): pierde el envión y rebota apenas. Al pifiar, en cambio, sigue.
  if (a.vx * a.facing > 0) a.vx = 0;
  a.vx -= a.facing * clamp((FIGHT.impactBack * mEff * speed) / a.model.mass, 0.015, 0.08);
  // El huevo (gelatina) sale rebotando con un golpe cargado: no conviene perseguirlo.
  if (!blocked && b.model.jelly && s.power >= 1.3) {
    b.vx *= FIGHT.bounce.kb;
    b.vy = Math.max(b.vy, FIGHT.bounce.up);
  }
  if (!blocked) {
    b.vy = Math.max(b.vy, kb * FIGHT.kbUp);
    b.grounded = false;
    if (s.move === 'upper' && b.juggle < 0) {
      b.vy = FIGHT.upper.lift;
      b.juggle = 0;
      m.events.push({ type: 'launch', who: (1 - i) as 0 | 1 });
    }
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
  m.events.push({ type: 'hit', by: i, at: [px, py], damage: dmg, kind, blocked, shield: !!shield, shieldPiece: shield, piece: p.piece, speed, combo: a.combo, heavy: kind === 'heavy', chain: blocked ? null : chain });
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
      if (q) f.buffer = { kind: q[1] === 'L' ? 'kick' : f.grounded ? 'arm' : 'air', t: FIGHT.buffer, quad: q, move: inputs[i].down && f.grounded ? (q[1] === 'L' ? 'sweep' : 'upper') : 'normal' };
      if (inputs[i].kick) f.buffer = { kind: 'kick', t: FIGHT.buffer };
      if (inputs[i].power) f.pwBuf = FIGHT.buffer;
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
    stepShots(m);
    stepZones(m);
    stepGround(m);
    stepPiles(m);
    for (const f of m.f) {
      // Rearmarse (quinoa): si hace rato que no le pegan, los granos vuelven a su lugar y recupera vida.
      const rg = f.model.regen;
      if (rg && !f.ko && m.frame - f.lastHurt > rg.delay) f.hp = Math.min(FIGHT.hp, f.hp + rg.hps * dt);
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
    // Terminó el round: nadie sigue pegando (el golpe que venía se corta y los brazos vuelven).
    if (m.phase === 'ko') {
      m.shots = [];
      m.zones = [];
      m.roots = [];
    }
    if (m.phase === 'ko') for (const f of m.f) {
      f.pw = null;
      f.mv = null;
      f.buffer = null;
      f.chain = null;
      for (const q of f.limbs) if (q.phase === 'windup' || q.phase === 'strike') {
        q.phase = 'recover';
        q.t = 0;
      }
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
