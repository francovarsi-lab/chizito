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
    id: 'pisoton', hits: [{ from: 22, to: 34, with: ['legL', 'legR'] }], total: 52, dmg: 8, kb: 0.3, stun: 16, guard: 'break', reach: 0.08, tell: 'risa', w: [0, 1, 2],
    keys: [
      { t: 0, limbs: REST }, { t: 8, limbs: { legL: [0.3, -1, 0.3], legR: [0.3, -1, 0.3], armL: [0, 1, 0.5], armR: [0, 1, 0.5] } }, { t: 10, vy: 0.5, vx: 0.32 },
      { t: 20, limbs: { legL: [0.5, -0.6, 0.5], legR: [0.5, -0.6, 0.5], armL: [0, 1, 0.6], armR: [0, 1, 0.6] } }, { t: 30, limbs: { legL: [0.4, -1, 0.2], legR: [0.4, -1, 0.2] } }, { t: 52, limbs: REST },
    ],
  },
};

/** Ataques de cada rival (por nombre del modelo). */
export const RIVAL_MOVES: Record<string, string[]> = {
  'EL BROCOLOCO': ['zanahoriazo', 'doble', 'cabezazo', 'pisoton'],
};
