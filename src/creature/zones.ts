/**
 * Secciones del chizito, compartidas por el constructor (la línea punteada y los carteles) y la pelea (qué es brazo y qué es
 * pierna). Sin imports: lo usan el juego y el intérprete.
 *
 * A lo largo del eje largo (desde el centro, en fracción de medio largo): abajo de `legBelow` = PIERNAS (un pedazo chico),
 * arriba de `headAbove` = CABEZA (no es brazo: escudo, un chupetín porque sí), el resto = BRAZOS. Izquierda y derecha, como
 * se ve el chizito al armarlo (de frente, con la cara de la F hacia uno): izquierda = +Y del chizito raíz.
 */
export const ZONES = { legBelow: -0.5, headAbove: 0.62 } as const;

export type Zone = 'head' | 'arm' | 'leg';
export type Side = 'L' | 'R';
/** Cuadrante de botones: brazo izquierdo/derecho, pierna izquierda/derecha. */
export type Quad = 'LA' | 'RA' | 'LL' | 'RL';

export const zoneOf = (along: number, half: number): Zone => (along < ZONES.legBelow * half ? 'leg' : along > ZONES.headAbove * half ? 'head' : 'arm');

/** Tecla de cada cuadrante (mano izquierda: Q W arriba = brazos, A S abajo = piernas; D = guardia). */
export const QUAD_KEYS: Record<Quad, string> = { LA: 'Q', RA: 'W', LL: 'A', RL: 'S' };
export const GUARD_KEY = 'D';
export const quadOf = (zone: Zone, side: Side): Quad | null => (zone === 'head' ? null : `${side}${zone === 'arm' ? 'A' : 'L'}` as Quad);
