import type { Shape2D } from '../types';

/** Lo que el simulador toma del análisis (todo ya calculado): modo, velocidad, salto, frenado, giro y tamaño del cuerpo. */
export interface SimPlan {
  mode: 'walk' | 'hop' | 'drag' | 'roll' | 'immobile';
  /** m/s: la velocidad del análisis (`locomotion.speed`). */
  speed: number;
  accel: number;
  decel: number;
  /** s de parada al invertir el sentido. */
  turnLock: number;
  /** Saltito: pasos en el aire y quieto, velocidad horizontal en el aire y velocidad inicial vertical. */
  airFrames: number;
  pauseFrames: number;
  hopSpeed: number;
  jumpSpeed: number;
  /** Gravedad del juego (m/s²): sale del salto de referencia y del tiempo en el aire, así que el saltito dura `hopAirTime`. */
  gravity: number;
  /** m: largo de una zancada (un ciclo de andar). */
  stride: number;
  /** m: distancia del centro de masa al punto más lejano del cuerpo (la criatura que rueda). */
  rollRadius: number;
  /** m: altura del centro de masa sobre el piso en la pose de reposo. */
  comHeight: number;
  /** Hacia dónde mira la criatura en el perfil (1 = a la derecha de la pantalla). */
  facing: 1 | -1;
}

/** Entrada de cada paso: -1 izquierda, 0 quieta, +1 derecha (sentido del mundo, no de la criatura). */
export interface SimInput {
  move: -1 | 0 | 1;
}

export interface SimState {
  frame: number;
  /** m: posición del centro de masa a lo largo del piso. */
  x: number;
  /** m: altura del punto más bajo sobre el piso por salto o caída (0 apoyada). */
  h: number;
  vx: number;
  vh: number;
  /** Hacia dónde mira ahora (±1). */
  facing: 1 | -1;
  /** Ciclo de andar (0..1, vueltas). */
  phase: number;
  /** Radianes girados al rodar (antihorario positivo). */
  angle: number;
  /** s que le quedan para terminar de dar la vuelta (0 = no está girando). */
  turnTimer: number;
  /** Saltito: en el aire y pasos transcurridos de la fase actual (aire o quieta). */
  air: boolean;
  hopFrame: number;
}

export interface PosedLimb {
  id: string;
  /** Giro respecto del reposo, grados (siempre dentro de [mín − reposo, máx − reposo]). */
  deltaDeg: number;
  /** Ángulo absoluto = reposo + giro (siempre dentro del rango de movilidad). */
  angleDeg: number;
  restDeg: number;
  minDeg: number;
  maxDeg: number;
  /** ¿Es una extremidad de apoyo (pie) del análisis? */
  foot: boolean;
  shapes: Shape2D[];
  /** m: punto más bajo sobre el piso. */
  lowest: number;
  contact: boolean;
}

export interface Pose {
  /** Posición de la criatura (m). */
  x: number;
  /** m: cuánto se subió el cuerpo para apoyar (más el salto). */
  lift: number;
  body: Shape2D[];
  limbs: PosedLimb[];
  /** Todas las formas en el mundo (cuerpo y extremidades). */
  shapes: Shape2D[];
  /** m: punto más bajo de todo (≥ 0 siempre: el piso no se atraviesa). */
  lowest: number;
  /** 'core' y los ids de extremidad que tocan el piso. */
  contacts: string[];
}
