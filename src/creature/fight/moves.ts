/**
 * Ataques de los rivales hechos a mano (T5 del plan): un ataque es DATO. El motor los ejecuta cuadro a cuadro: pone cada
 * extremidad en la pose de las claves (marco local del luchador: [adelante, arriba, costado afuera]) y, en cada ventana de golpe,
 * pega si la punta de la extremidad (o el cuerpo) toca al rival. El render dibuja esas mismas poses: lo que se ve es lo que pega.
 */
import type { V3 } from '../types';

/** Extremidad por rol y lado ('armR' = brazo derecho) o por posición ('armF' = el de adelante, 'armB' = el de atrás), o el cuerpo. */
export type LimbTag = 'armL' | 'armR' | 'legL' | 'legR' | 'armF' | 'armB' | 'legF' | 'legB';
export type Hitter = LimbTag | 'body';

export interface MoveKey {
  t: number;
  /** Dirección de cada extremidad (se normaliza). La z es "hacia afuera" de su lado. Las que faltan vuelven a su reposo. */
  limbs?: Partial<Record<LimbTag, V3>>;
  /** Desde ese cuadro, invulnerable `inv` cuadros; y se corre `dx` m hacia el rival (se rearma más allá). */
  inv?: number;
  dx?: number;
  /** Impulso del cuerpo en ese cuadro (m/s; vx hacia el rival) y giro (rad/s, + = hacia adelante). */
  vx?: number;
  vy?: number;
  wt?: number;
}

export interface Move {
  id: string;
  /** Ventanas de golpe (cuadros desde que arranca) y con qué pega cada una. */
  hits: { from: number; to: number; with: Hitter[] }[];
  /** Cuadros totales (lo que sigue a la última ventana es la recuperación: castigable). */
  total: number;
  dmg: number;
  kb: number;
  stun: number;
  /** 'block' se bloquea; 'break' rompe la guardia; 'low' pasa por abajo de la guardia (hay que saltarla). */
  guard: 'block' | 'break' | 'low';
  /** m: distancia a la que la IA lo tira. */
  reach: number;
  /** Sonido y destello del aviso (al arrancar). */
  tell: string;
  /** Al acertar, lo derriba (cuadros). */
  down?: number;
  /** Peso para la IA según distancia (cerca, media, lejos). */
  w: [number, number, number];
  keys: MoveKey[];
}

/** Clave de reposo: todas las extremidades vuelven a su postura. */
export const MOVE_REST = {};
const REST = MOVE_REST;

export const MOVES: Record<string, Move> = {
  // ── EL BROCOLOCO (nivel 1: enseña a bloquear y castigar) ──
  zanahoriazo: {
    id: 'zanahoriazo', hits: [{ from: 10, to: 14, with: ['armF'] }], total: 30, dmg: 6, kb: 0.28, stun: 12, guard: 'block', reach: 0.055, tell: 'zumbido', w: [3, 2, 0],
    keys: [{ t: 0, limbs: REST }, { t: 8, limbs: { armF: [-0.6, 0.35, 0.6] } }, { t: 12, limbs: { armF: [1, 0.12, 0] }, vx: 0.12 }, { t: 18, limbs: { armF: [1, 0.12, 0] } }, { t: 30, limbs: REST }],
  },
  doble: {
    id: 'doble', hits: [{ from: 12, to: 15, with: ['armF'] }, { from: 26, to: 29, with: ['armB'] }], total: 44, dmg: 5, kb: 0.2, stun: 12, guard: 'block', reach: 0.055, tell: 'zumbido', w: [2, 2, 0],
    keys: [
      { t: 0, limbs: REST }, { t: 10, limbs: { armF: [-0.6, 0.35, 0.6], armB: [0.2, 0.5, 0.6] } }, { t: 14, limbs: { armF: [1, 0.12, 0], armB: [-0.5, 0.35, 0.6] }, vx: 0.1 },
      { t: 24, limbs: { armF: [0.2, 0.5, 0.6], armB: [-0.6, 0.35, 0.6] } }, { t: 28, limbs: { armF: [0.2, 0.5, 0.6], armB: [1, 0.12, 0] }, vx: 0.1 }, { t: 44, limbs: REST },
    ],
  },
  // Se agacha y sacude la copa 30 cuadros (el aviso) y embiste de cabeza: rompe la guardia. Respuesta: pasito atrás y castigar.
  cabezazo: {
    id: 'cabezazo', hits: [{ from: 32, to: 40, with: ['body'] }], total: 64, dmg: 10, kb: 0.45, stun: 22, guard: 'break', reach: 0.07, tell: 'rugido', w: [1, 2, 1],
    keys: [
      { t: 0, limbs: REST }, { t: 6, limbs: { armL: [-0.7, -0.4, 0.7], armR: [-0.7, -0.4, 0.7] }, wt: -3 }, { t: 14, wt: 1.5 }, { t: 20, wt: -1.5 }, { t: 26, wt: 1.5 },
      { t: 31, limbs: { armL: [-0.9, -0.2, 0.4], armR: [-0.9, -0.2, 0.4] }, vx: 0.42, wt: 9 }, { t: 40, limbs: { armL: [-0.9, -0.2, 0.4], armR: [-0.9, -0.2, 0.4] } }, { t: 64, limbs: REST },
    ],
  },
  // Salta y cae pisando: no se bloquea agachado ni parado (rompe la guardia); se esquiva alejándose.
  pisoton: {
    id: 'pisoton', hits: [{ from: 22, to: 34, with: ['legL', 'legR'] }], total: 52, dmg: 6.5, kb: 0.3, stun: 16, guard: 'break', reach: 0.08, tell: 'risa', w: [0, 1, 1],
    keys: [
      { t: 0, limbs: REST }, { t: 8, limbs: { legL: [0.3, -1, 0.3], legR: [0.3, -1, 0.3], armL: [0, 1, 0.5], armR: [0, 1, 0.5] } }, { t: 10, vy: 0.5, vx: 0.32 },
      { t: 20, limbs: { legL: [0.5, -0.6, 0.5], legR: [0.5, -0.6, 0.5], armL: [0, 1, 0.6], armR: [0, 1, 0.6] } }, { t: 30, limbs: { legL: [0.4, -1, 0.2], legR: [0.4, -1, 0.2] } }, { t: 52, limbs: REST },
    ],
  },
};

// ── HUEVO DURO (nivel 2: enseña distancia). Brazos largos de espárrago (látigos). ──
// Pinchazo largo: recoge el brazo 14 cuadros (aviso) y lo dispara en línea (los tres tramos alineados): alcance 7 cm.
MOVES.pinchazo = {
  id: 'pinchazo', hits: [{ from: 16, to: 21, with: ['armF'] }], total: 40, dmg: 6.8, kb: 0.3, stun: 13, guard: 'block', reach: 0.085, tell: 'zumbido', w: [1, 3, 2],
  keys: [{ t: 0, limbs: REST }, { t: 14, limbs: { armF: [-0.5, 0.2, 0.85] } }, { t: 18, limbs: { armF: [1, 0.05, 0] }, vx: 0.08 }, { t: 24, limbs: { armF: [1, 0.05, 0] } }, { t: 40, limbs: REST }],
};
// Látigo bajo: el brazo va atrás y abajo 18 cuadros y barre la tabla: no se bloquea (hay que saltar) y derriba.
MOVES.latigo = {
  id: 'latigo', hits: [{ from: 20, to: 27, with: ['armF', 'armB'] }], total: 48, dmg: 5.8, kb: 0.22, stun: 12, guard: 'low', reach: 0.08, tell: 'risa', w: [1, 2, 1], down: 36,
  keys: [{ t: 0, limbs: REST }, { t: 18, limbs: { armF: [-0.6, -0.7, 0.4], armB: [-0.4, -0.8, 0.5] } }, { t: 23, limbs: { armF: [0.9, -0.55, 0], armB: [0.8, -0.6, 0.2] }, vx: 0.15 }, { t: 30, limbs: { armF: [0.9, -0.5, -0.2], armB: [0.8, -0.5, 0] } }, { t: 48, limbs: REST }],
};

// ── MONSTRUO DE QUINOA (nivel 3: enseña a elegir el golpe). ──
// Puño cañón: el brazo se va BIEN atrás y arriba (se ve venir) y se dispara recto con todo el peso: un monstruo pesado pega duro.
MOVES.canon = {
  id: 'canon', hits: [{ from: 22, to: 28, with: ['armF'] }], total: 60, dmg: 8, kb: 0.55, stun: 20, guard: 'block', reach: 0.08, tell: 'zumbido', w: [2, 3, 1],
  keys: [{ t: 0, limbs: REST }, { t: 19, limbs: { armF: [-0.8, 0.55, 0.5] }, vx: -0.08 }, { t: 23, limbs: { armF: [1, 0.08, 0] }, vx: 0.45 }, { t: 34, limbs: { armF: [1, 0.08, 0] } }, { t: 60, limbs: REST }],
};
// Mazazo doble: los dos puños arriba 34 cuadros (aviso) y bajan dos veces: rompe la guardia.
MOVES.mazazo = {
  id: 'mazazo', hits: [{ from: 36, to: 41, with: ['armF', 'armB'] }, { from: 52, to: 57, with: ['armF', 'armB'] }], total: 76, dmg: 7, kb: 0.4, stun: 20, guard: 'break', reach: 0.065, tell: 'rugido', w: [3, 1, 0],
  keys: [
    { t: 0, limbs: REST }, { t: 30, limbs: { armF: [0.1, 1, 0.3], armB: [0.1, 1, 0.3] } }, { t: 38, limbs: { armF: [0.9, -0.3, 0.1], armB: [0.9, -0.3, 0.1] }, vx: 0.15 },
    { t: 46, limbs: { armF: [0.1, 1, 0.3], armB: [0.1, 1, 0.3] } }, { t: 54, limbs: { armF: [0.9, -0.3, 0.1], armB: [0.9, -0.3, 0.1] }, vx: 0.1 }, { t: 76, limbs: REST },
  ],
};
// Derrumbe: se desarma en un montón (invulnerable 30 cuadros) y se rearma 6 cm más allá: castigable al rearmarse.
MOVES.derrumbe = {
  id: 'derrumbe', hits: [], total: 56, dmg: 0, kb: 0, stun: 0, guard: 'block', reach: 0.05, tell: 'risa', w: [2, 0, 0],
  keys: [{ t: 0, limbs: REST }, { t: 2, inv: 30, limbs: { armF: [0.3, -1, 0.6], armB: [0.3, -1, 0.6] } }, { t: 30, dx: 0.06 }, { t: 56, limbs: REST }],
};

/** Ataques de cada rival (por nombre del modelo). */
export const RIVAL_MOVES: Record<string, string[]> = {
  'EL BROCOLOCO': ['zanahoriazo', 'doble', 'cabezazo', 'pisoton'],
  'HUEVO DURO': ['pinchazo', 'latigo'],
  'MONSTRUO DE QUINOA': ['canon', 'mazazo', 'derrumbe'],
};
