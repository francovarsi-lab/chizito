/**
 * Datos curiosos de animales: cada palito de la selva que se desenvuelve trae uno en el papel.
 * Salen en orden al azar y no se repite ninguno hasta haber salido los 18 (bolsa que se baraja).
 */
export const DATOS_CURIOSOS: readonly string[] = [
  'Los pulpos tienen tres corazones.',
  'Los flamencos nacen grises, no rosas.',
  'Los tiburones existen desde antes que los árboles.',
  'Algunos caracoles pueden dormir durante años.',
  'Las nutrias marinas se agarran de las manos mientras duermen para no separarse.',
  'Las vacas tienen mejores amigas y pueden estresarse si se separan.',
  'Las jirafas tienen siete vértebras en el cuello, igual que los humanos.',
  'Las mariposas saborean con las patas.',
  'Algunos pingüinos ofrecen piedritas como parte del cortejo.',
  'Las hormigas no tienen pulmones.',
  'Los elefantes pueden reconocerse en un espejo.',
  'Los murciélagos son los únicos mamíferos capaces de volar.',
  'Los cuervos pueden recordar caras humanas durante años.',
  'Las serpientes huelen con la lengua.',
  'Las abejas comunican dónde hay comida con un baile.',
  'Los camellos tienen tres párpados y dos hileras de pestañas.',
  'El halcón peregrino alcanza los 389 km/h.',
  'El pez arquero derriba insectos disparándoles chorros de agua.',
];

let bag: number[] = [];
let last = -1;

/** Próximo dato: baraja los 18 y los va sacando; el primero de una bolsa nueva nunca repite al último. */
export function nextCuriosidad(random: () => number = Math.random): string {
  if (bag.length === 0) {
    bag = DATOS_CURIOSOS.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  last = bag.pop()!;
  return DATOS_CURIOSOS[last];
}
