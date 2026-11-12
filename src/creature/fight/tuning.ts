/**
 * Números de la pelea (juego, no física real). Todo lo que se calibra está acá; el motor (`engine.ts`) no tiene números sueltos.
 * Unidades: metros, segundos, kg, radianes. La simulación corre a 60 pasos por segundo.
 */
export const FIGHT = {
  dt: 1 / 60,

  // ── Formato (chat de mecánicas): 1 vs 1, al mejor de 3 rounds, 90 s, vida 100. Empate exacto = ronda extra. ──
  hp: 100,
  roundsToWin: 2,
  roundSeconds: 90,
  /** Cuadros de "ROUND N · ¡A PELEAR!", de cámara lenta del KO y de cartel de fin de round. */
  introFrames: 110,
  koFrames: 100,
  endFrames: 130,

  // ── Arena (sobre la mesa, alrededor del chizito) ──
  arenaHalf: 0.15,
  /** rad: los luchadores se enfrentan con la cara hacia el rival, girados esto hacia la cámara (3/4 claro, como el arte clave: se ven las caras). */
  stanceYaw: 0.7,
  /** rad: cuánto puede girar una pierna para apoyar en la postura. */
  stanceMax: 0.9,
  startGap: 0.15,

  // ── Pesos (gramos), tabla de la realidad del chat de mecánicas. El palito de la selva usa la masa del intérprete. ──
  massGrams: {
    chizito: 3.3,
    palito: 0.4,
    escarbadientes: 0.2,
    'escarbadientes:espadita': 0.6,
    'palito-selva': 1.1,
    papita: 1,
    nacho: 1.5,
    aceituna: 4,
    chupetin: 0.3,
    'chupetin-caramelo': 4.7,
    default: 0.5,
  },
  /** Golpes que aguanta cada escudo antes de saltar (propuesta del chat de mecánicas). */
  shieldHits: { papita: 2, nacho: 6 },
  /** m: una vara ATRAVIESA el chizito (queda fija: girarla lo rompería) si asoma al menos esto del otro lado. */
  throughMin: 0.004,
  /** m: lo que asoma menos que esto (p. ej. un palito clavado al 90 %) no es extremidad: no llega a nada, es solo peso. */
  minReach: 0.01,
  /** Gramos que carga cada pierna según su pieza: si la criatura pesa más que lo que cargan sus piernas, camina lento y no salta. */
  legCarryGrams: { palito: 4, escarbadientes: 2.5, 'palito-selva': 6, default: 3 },
  /**
   * Cada tipo de pierna: FUERZA (empuja el salto) y RAPIDEZ (la marcha y lo que tarda en agacharse para saltar). Palito de la
   * selva: lento pero fuerte; escarbadientes: rápido pero débil. Más piernas suman fuerza, pero el peso la reparte.
   */
  legKind: {
    palito: { power: 1, quick: 1 },
    escarbadientes: { power: 0.6, quick: 1.35 },
    'palito-selva': { power: 1.6, quick: 0.7 },
    zanahoria: { power: 1.25, quick: 1 },
    default: { power: 1, quick: 1 },
  },
  /** Las piernas se acomodan contra la inclinación del cuerpo (fracción): la criatura se para SOBRE ellas. */
  legPlant: 0.85,

  /** `yaw`: el brócoli se planta más de frente que la criatura (≈ 60°, como en el arte clave): su cara se tiene que leer. */
  broccoli: { bodyGrams: 6, carrotGrams: 1, carrotCarryGrams: 6, yaw: 1.05 },

  // ── Cuerpo ──
  /** m/s²: gravedad de juego (más flotante que la real, para que los saltos se lean). */
  gravity: 3.4,
  /** m/s: caminar con piernas que cargan justo su peso. */
  walkSpeed: 0.1,
  massRef: 0.006,
  /** Velocidad ∝ (lo que cargan las piernas / masa)^esto, acotado. Sin piernas: (massRef / masa)^massSpeedExp. */
  carrySpeedExp: 0.8,
  massSpeedExp: 0.5,
  speedClamp: [0.15, 1.3] as const,
  /** Factor de velocidad según cantidad de piernas: 0 (se arrastra), 1 (salta en una pata), 2+ (camina). */
  legSpeed: [0.38, 0.8, 1] as const,
  groundAccel: 1.6,
  airAccel: 0.5,
  /**
   * m/s: velocidad del salto (↑) = jumpSpeed · √(fuerza de las piernas / gramos / jumpRef), acotada. Solo con piernas, y si
   * cargan al menos `jumpMinCarry` de la masa. Antes de despegar se agacha `squat` cuadros (más con piernas lentas).
   */
  jumpSpeed: 0.56,
  jumpRef: 0.4,
  jumpClamp: [0.3, 0.85] as const,
  jumpMinCarry: 0.6,
  squat: { base: 3, slow: 5 },
  /** Saltito de una sola pierna al avanzar. */
  hopSpeed: 0.26,
  hopRest: 7,
  /** El cuerpo rebota apenas al caer. */
  landBounce: 0.12,
  /** m: si venía apoyado y se despega menos que esto (por inclinarse), vuelve a apoyar. */
  stickMax: 0.005,

  // ── Equilibrio y contrapeso (inclinación del cuerpo sobre su apoyo) ──
  /** Rigidez del "querer estar derecho", relativa a peso × altura de referencia. */
  balanceK: 1.4,
  balanceZeta: 0.32,
  /** m: altura de referencia del centro de masa. */
  balanceH: 0.025,
  /** Cuánto inclina el contrapeso (centro de masa corrido del apoyo). */
  leanGain: 0.35,
  /** Cuánto vuelca cuando el centro de masa queda FUERA del apoyo. */
  tipGain: 3,
  /** m: cuánto cuenta como máximo el centro de masa fuera del apoyo. */
  tipMax: 0.004,
  /** Cuánto empuja al cuerpo el giro de una extremidad (reacción). */
  reactGain: 0.7,
  maxTilt: 0.85,
  /** m: lo que está hasta esta altura sobre lo más bajo cuenta como apoyo. */
  supportBand: 0.004,

  // ── Articulaciones (motor PD con torque limitado por la inercia de cada extremidad) ──
  /** rad/s: frecuencia natural de cada fase y amortiguación. */
  joint: {
    rest: { wn: 26, zeta: 0.42 },
    windup: { wn: 34, zeta: 0.75 },
    strike: { wn: 70, zeta: 0.3 },
    recover: { wn: 22, zeta: 0.38 },
    guard: { wn: 34, zeta: 0.6 },
  },
  /** Torque máximo = tau0 · (I / I0)^tauExp: una extremidad pesada tiene más "músculo", pero no tanto como su inercia. */
  tau0: 9e-5,
  I0: 3.3e-7,
  tauExp: 0.55,
  /** El golpe usa más torque que el resto. */
  strikeBoost: 1.6,
  /** Frenar puede usar este múltiplo del torque. */
  brakeBoost: 3,
  /** rad: cuánto pasa de largo el golpe más allá de apuntar al rival. */
  overshoot: 0.38,
  windup: 0.55,
  windupHeavy: 0.8,
  /** Cuadros: mínimo y máximo de la carga, máximo del golpe y de la recuperación. */
  windMin: 3,
  windMax: 16,
  strikeMax: 22,
  recoverMax: 34,
  /** Cuadros entre dos golpes seguidos (y nunca dos a la vez). */
  strikeGap: 5,
  /** Cuadros sin poder golpear después de acertar. */
  hitLock: 6,
  /**
   * Errar: lo que se movió sigue de largo. Cuadros sin poder golpear ni cubrirse = base + k · (masa de la extremidad / masa del
   * chizito); el giro que traía pasa al cuerpo (`transfer`) y lo arrastra hacia adelante (`lurch`); si se inclina más que
   * `stumbleTilt`, trastabilla. Una aceituna puede pesar más que el chizito.
   */
  whiff: { base: 10, k: 26, max: 75, transfer: 0.9, lurch: 0.3, lurchBase: 0.05, slack: 12 },
  stumbleTilt: 0.45,
  stumbleFrames: 26,
  /** rad/s: hasta que el cuerpo no se bambolea menos que esto, no vuelve a golpear después de pifiar. */
  stableW: 0.8,
  /** Carga del golpe: cuadros = k · (masa extremidad / masa chizito − free). Temblor mientras carga (rad). */
  charge: { k: 26, free: 0.3, tremble: 0.05 },
  /**
   * Golpe de cuerpo entero con una pieza fija (chupetín): se inclina atrás (`back`), y de golpe adelante (`fwd`) con más rigidez
   * (`stiff`); pega mientras gira más rápido que `activeW`. Es lento pero fuerte: daño × `dmgMul`, con tope `maxDmg` por golpe. Al pifiar el torso sigue girando (`whiffSpin`). Pifiar cuesta `whiffMul` veces más y lo tira (`whiffKick`).
   */
  swing: { back: 0.5, fwd: 0.75, stiff: 6, backStiff: 3.2, activeW: 1.6, windFrames: 7, maxCharge: 9, strikeFrames: 20, chargeMul: 1.3, massShare: 0.85, dmgMul: 1.8, maxDmg: 18, whiffSpin: 1.6, whiffMul: 1.1, whiffKick: 1.7, lunge: 0.22 },
  /** Escudo de frente: si está a menos de `shieldFront` del frente no se mueve; a más de `shieldBack`, se da vuelta. */
  shieldFront: 0.35,
  shieldBack: 2.2,
  /** Cuadros que se recuerda un botón apretado antes de poder golpear. */
  buffer: 9,
  /** m/s de envión del cuerpo al SOLTAR el golpe (no al cargarlo: mientras carga, el peso va atrás). */
  lunge: 0.12,
  /** Inclinación (rad) del cuerpo: el peso va atrás al cargar y adelante al soltar (piña); al revés para patear. */
  bodyWind: 0.1,
  bodyThrow: 0.16,
  /** Al pifiar el brazo sigue de largo: rad de más (+ k · masa extremidad / masa chizito) durante `frames`. */
  follow: { angle: 0.55, k: 0.35, frames: 14 },
  /** Al acertar, el que pega frena contra el otro: m/s hacia atrás por (masa efectiva / su masa). */
  impactBack: 0.5,
  /**
   * Giro del torso (rad) al pegar con el cuerpo entero: el hombro que pega va atrás al cargar y adelante al soltar (piña); la
   * cadera gira menos en una patada. `rate` = qué tan rápido sigue al objetivo (1/s).
   */
  twist: { arm: 0.3, kick: 0.15, swing: 0.95, wind: 0.6, rate: { strike: 16, windup: 9, rest: 6 }, min: -0.5, max: 2.2 },
  /** Pies bajo el centro de masa: cuánto corrigen las piernas apoyadas (normal / mientras otra patea) y hasta cuánto (rad). */
  support: { rest: 0.25, kick: 0.9, max: 0.45 },
  /** Ángulo de la marcha (rad) y de las piernas al agacharse. */
  gait: 0.42,
  /** rad: cuánto se levanta (hacia afuera) la pierna que da el paso; la otra queda pisando. */
  gaitLift: 0.65,
  crouch: 0.62,
  /** Las piernas abren el paso cada `stride` metros recorridos (por metro de pierna). */
  strideK: 2.2,

  // ── Golpe y daño ──
  /** m/s: por debajo de esto el contacto no lastima (apoyar no es pegar). */
  minHitSpeed: 0.14,
  /**
   * Daño = dmgK · (masa efectiva [g])^dmgMassExp · (velocidad [m/s])^dmgSpeedExp. La velocidad pesa más que la masa: lo que no se
   * puede mover rápido (o una criatura que casi no se mueve) pega poco aunque pese mucho.
   */
  dmgK: 12,
  dmgMassExp: 0.4,
  dmgSpeedExp: 1.3,
  dmgClamp: [1, 30] as const,
  kindMul: { light: 1, cut: 0.75, heavy: 1.1, shield: 0.6 },
  hitPad: 0.0015,
  /** m entre los cuerpos (los muñones cortos no alcanzan a tocar). */
  bodyGap: 0.004,
  /** Guardia: la cubren los BRAZOS (si el golpe toca un brazo levantado). Fracción de daño que pasa, cuadros de bloqueo. */
  chip: 0.15,
  blockstun: 10,
  guardReady: 0.55,
  /** Escudo: fracción del daño que pasa al cuerpo. */
  shieldPass: 0.3,
  /** Aturdimiento: cuadros = base + k · daño. Los pesados además llenan el mareo. */
  hitstun: { base: 9, k: 0.9 },
  dizzyMax: 38,
  dizzyFrames: 90,
  dizzyDecay: 0.06,
  /** Sangrado del corte: vida por segundo, cuadros que dura, y cuántos a la vez. */
  bleed: { dps: 1.6, frames: 180, max: 3 },
  /** Empujón: m/s por (kg·m/s del golpe / kg del rival), acotado. */
  knockback: 2.4,
  kbClamp: [0.1, 0.62] as const,
  kbUp: 0.28,
  /** Giro que da un golpe al cuerpo del rival (arriba del centro de masa lo echa para atrás). */
  hitTilt: 70,
  /** La extremidad que pega rebota. */
  recoil: 0.35,
  /** Cuadros de congelamiento al impacto (da peso al golpe). */
  hitstop: { base: 4, k: 0.4, max: 15 },
  /** Un combo cuenta si el golpe llega antes de esta cantidad de cuadros del anterior. */
  comboWindow: 50,
  /**
   * Combinaciones (encadenar después de ACERTAR, dentro de `window` cuadros; la siguiente sale sin carga y sin esperar el
   * castigo): UNO-DOS (piña + piña con otro brazo, 2+ brazos), RÁFAGA (tercera piña, 3+ brazos), PIÑA Y PATADA (piña + patada,
   * 2+ piernas para quedar parado en una), CONTRA (piña justo después de bloquear con la guardia). `mul` = daño.
   */
  chain: {
    window: 26,
    counterWindow: 22,
    mul: { 'UNO-DOS': 1.15, 'RÁFAGA': 1.3, 'PIÑA Y PATADA': 1.25, CONTRA: 1.35 } as Record<string, number>,
  },
} as const;

/** Rival: cuán bien juega el brócoli en cada nivel. */
export const AI_LEVELS = [
  { reaction: 26, guard: 0.22, aggression: 0.035, jump: 0.002, retreat: 0.2, chain: 0 },
  { reaction: 16, guard: 0.42, aggression: 0.06, jump: 0.004, retreat: 0.3, chain: 0.04 },
  { reaction: 9, guard: 0.62, aggression: 0.09, jump: 0.006, retreat: 0.35, chain: 0.09 },
] as const;
