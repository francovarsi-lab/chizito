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
  // Amortiguado: parado sobre sus patas no se mece como colgado de un cable (antes 0,32).
  balanceZeta: 0.8,
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
    // Golpes que se leen (antes 70, después 54: la fase de golpe duraba 3 cuadros, un "flash").
    strike: { wn: 30, zeta: 0.3 },
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
  /** rad: arco total (carga + golpe) de una piña, igual para el brazo de adelante y el de atrás; tope de la carga hacia atrás. */
  sweep: 2.9,
  sweepHeavy: 3.1,
  windupCap: 1.6,
  /** Cuadros: mínimo y máximo de la carga, máximo del golpe y de la recuperación. */
  windMin: 9,
  /** El golpe no avanza más de arco / esto por cuadro: dura al menos estos cuadros (se ve). */
  strikeMinFrames: 6,
  windMax: 16,
  strikeMax: 22,
  recoverMax: 34,
  /** Cuadros entre dos golpes seguidos (y nunca dos a la vez). */
  strikeGap: 16,
  /** Golpes sin pausa (cada uno arranca antes de `window` cuadros del anterior): daño × (1 − step · seguidos), piso `min`. */
  repeat: { window: 75, step: 0.25, min: 0.35 },
  /** T3. Mantener el botón del cuadrante: soltar antes de `quick` = RÁPIDO (daño × quickMul, carga × quickArc); mantener =
   *  CARGADO (1 → fullMul hasta `max` cuadros; la carga completa rompe la guardia). */
  hold: { quick: 12, max: 30, quickMul: 0.6, quickArc: 0.6, fullMul: 1.6 },
  /** ↓ + brazo = GANCHO: levanta al rival; en el aire, hasta 3 golpes con este daño. */
  upper: { lift: 0.55, juggle: [1, 0.8, 0.6] as readonly number[] },
  /** ↓ + pierna = BARRIDA: derriba estos cuadros; al levantarse queda invulnerable `getUpInv`. */
  sweepDown: 40,
  /** Huevo: vida bajo la cual se raja (fase 2: recibe × phase2Mul y ataca 20 % más rápido); rebote con golpe cargado. */
  phase2: 40,
  phase2Mul: 1.04,
  bounce: { kb: 1.8, up: 0.35 },
  getUpInv: 10,
  /** Doble toque de flecha (dentro de `taps` cuadros) = PASITO de `dist` en `frames`; hacia atrás, invulnerable `backInv`. */
  dash: { taps: 12, frames: 10, dist: 0.03, backInv: 6 },
  /** ATAJADA: guardia apretada hasta `window` cuadros antes del impacto → sin daño, el otro abierto `open`, + `meter` de poder. */
  parry: { window: 6, open: 24, meter: 25 },
  /** GUARDIA ROTA: `blocks` bloqueos en `window` cuadros → `frames` sin poder cubrirse. */
  guardBreak: { blocks: 4, window: 180, frames: 40 },
  /** Cuadros sin poder seguir después de pegarle a una guardia. */
  blockedLock: 16,
  /** Cuadros sin poder golpear después de acertar. */
  hitLock: 9,
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
   * (`stiff`); pega mientras gira más rápido que `activeW`. Es lento y el que más pega (`pieceDmg.chupetin`). Pifiar cuesta `whiffMul` veces más y da la vuelta entera (`whirl`).
   */
  swing: { back: 0.5, fwd: 0.75, stiff: 6, backStiff: 3.2, activeW: 1.6, windFrames: 14, maxCharge: 30, loadCharge: 0.25, strikeFrames: 26, chargeMul: 2, turnSpeed: 9, massShare: 0.85, whiffMul: 1.1, lunge: 0.22 },
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
  twist: { arm: -0.2, armBack: 1.5, kick: 0.15, swing: 0.95, wind: 0.6, rate: { strike: 16, windup: 9, rest: 6 }, min: -0.9, max: 2.2 },
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
  /**
   * Daño base de cada pieza (pedido del usuario, de más a menos): chupetín > aceituna > palito de la selva > palito > espadita >
   * escarbadientes. Cada extremidad pega con su pieza más fuerte (un palito con una aceituna en la punta pega como aceituna). Las piernas pegan
   * `legMul` más (más fuerza). El daño se escala por el RECORRIDO del golpe al tocar (`dmgTravel`): apoyar el brazo no
   * es pegar. Rivales: su extremidad.
   */
  pieceDmg: {
    chupetin: 11.6,
    aceituna: 9.4,
    'palito-selva': 7.6,
    palito: 6.2,
    'escarbadientes:espadita': 5,
    escarbadientes: 4,
    papita: 4,
    nacho: 4.4,
    zanahoria: 6.2,
    huevo: 5.6,
    quinoa: 7.6,
    default: 5,
  } as Record<string, number>,
  legMul: 1.15,
  /** Daño × recorrido del golpe al tocar (rad recorridos desde la carga / `dmgArc`; lo fijo: giro del torso / `dmgTwist`), entre estos topes. */
  dmgTravel: [0.4, 1] as const,
  dmgArc: 1.4,
  dmgTwist: 0.6,
  /** m/s: por debajo de esto el contacto no lastima (apoyar no es pegar). */
  minHitSpeed: 0.14,
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
  /**
   * Chupetín que pifia: el peso lo arrastra y la criatura da una VUELTA ENTERA (360°) sobre sí misma, desestabilizada: `frames`
   * cuadros girando y `stun` cuadros sin poder hacer nada (queda expuesta).
   */
  whirl: { stun: 50, wobble: 1.2, minSpeed: 7, endSpeed: 1.2 },
  /**
   * PODER: barra que se llena pegando (daño × `onHit`), recibiendo (× `onHurt`) y de a poco sola. Llena, se suelta el poder del
   * luchador (ver `POWERS`).
   */
  power: { max: 100, onHit: 1.5, onHurt: 1, blockedMul: 0.4, passive: 0.3 },
  /** T4. Tres usos de la barra: REMATE (E justo después de acertar: cancela la vuelta y suelta el poder corto), ESCAPE (E mientras
   *  te pegan: estallido que separa), SÚPER (E con la barra llena). `short`: carga × wind, daño × dmg del poder corto. */
  powerUse: { half: 50, escapeKb: 0.6, escapeRange: 0.09, short: { wind: 0.35, dmg: 0.6 } },
  chain: {
    window: 26,
    counterWindow: 22,
    mul: { CONTRA: 1.35 } as Record<string, number>,
    /** Cada golpe de la cadena pega 10 % menos que el anterior (100 / 90 / 80 / 70), con piso. */
    scale: 0.1,
    floor: 0.5,
  },
} as const;

/**
 * Poderes (lógica de cada comida). Cuadros de carga (`wind`, se ve venir: se puede esquivar o cubrir) y de acción (`go`).
 *  queso    TU CHIZITO: NUBE DE QUESO, sopla el polvito naranja de su cáscara: marea al rival si está cerca.
 *  vapor    EL BROCOLOCO: VAPORAZO, el brócoli recién hervido larga vapor de la copa: quema y empuja lejos a quien esté pegado.
 *  rodada   HUEVO DURO: HUEVAZO RODANTE, se hace bola y rueda contra el rival (los huevos ruedan): se salta o se bloquea.
 *  metralla MONSTRUO DE QUINOA: METRALLA DE GRANOS, se arranca un puñado de granos y los tira en abanico; mientras le faltan, su
 *           coraza de granos protege menos (`armorLoss`) hasta rearmarse.
 */
export const POWERS = {
  queso: { name: 'NUBE DE QUESO', wind: 14, go: 26, reach: 0.075, ahead: 0.03, dmg: 4, dizzy: 80, guardDizzy: 0 },
  vapor: { name: '¡VAPORAZO!', wind: 24, go: 22, reach: 0.07, dmg: 9, kb: 0.55, stun: 30 },
  rodada: { name: '¡HUEVAZO RODANTE!', wind: 22, go: 48, speed: 0.4, dmg: 13, kb: 0.5, stun: 34 },
  metralla: { name: 'METRALLA DE GRANOS', wind: 20, go: 16, n: 7, speed: 0.6, spread: 0.55, dmg: 2.3, r: 0.0026, life: 80, armorLoss: 0.35, regrow: 240 },
  // Súper de TU CHIZITO según lo que armó (la pieza que más pega): nube que queda, trompo, carozo, acupuntura o muralla.
  nube: { name: '¡NUBE DE QUESO!', wind: 16, go: 20, life: 120, r: 0.045, dps: 2, blind: 0.7 },
  trompo: { name: '¡TROMPO!', wind: 18, go: 42, reach: 0.07, dmg: 6, hits: [8, 20, 32] as readonly number[], kb: 0.18, stun: 14 },
  carozo: { name: '¡CAROZAZO!', wind: 18, go: 10, speed: 0.55, dmg: 9, r: 0.004, life: 70, dizzy: 50 },
  acupuntura: { name: '¡ACUPUNTURA!', wind: 12, go: 34, reach: 0.06, dmg: 2.6, hits: [4, 10, 16, 22, 28] as readonly number[], stun: 8 },
  muralla: { name: '¡MURALLA!', wind: 10, go: 8, frames: 180 },
} as const;
export type PowerKind = keyof typeof POWERS;

/** Jalea del huevo: los golpes seguidos (dentro de `window` cuadros) rebotan en la gelatina y pegan menos. */
export const JELLY = { window: 36, step: 0.22, min: 0.45 };

/** Rival: cuán bien juega el brócoli en cada nivel. */
export const AI_LEVELS = [
  { reaction: 26, guard: 0.22, aggression: 0.035, jump: 0.002, retreat: 0.2, chain: 0, think: 26 },
  { reaction: 18, guard: 0.36, aggression: 0.05, jump: 0.004, retreat: 0.3, chain: 0.04, think: 18 },
  { reaction: 13, guard: 0.5, aggression: 0.065, jump: 0.006, retreat: 0.35, chain: 0.07, think: 12 },
] as const;
