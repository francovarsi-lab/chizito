/** Números de la pelea (juego, no física). Los de la criatura salen del análisis; acá solo cómo se juega el cruce. */
export const FIGHT = {
  /** Vida de cada uno. */
  hp: 100,
  /** Daño del análisis (adimensional) → puntos de vida. */
  damageScale: 2.5,
  /** El análisis camina a mm/s; en la pelea se multiplica para que el cruce no dure minutos. */
  speedMul: 3,
  /** m: mitad del ancho de la arena. */
  arenaHalf: 0.19,
  /** m: separación inicial entre los centros. */
  startGap: 0.2,
  /** Cuadros sin poder actuar al recibir un golpe (sin guardia). */
  hitstun: 20,
  /** Cuadros de pausa al impacto (da peso al golpe; lo aplica la pantalla). */
  hitstop: 5,
  /** m/s de empujón por punto de daño, dividido por (1 + masa / massRef). */
  knockback: 0.02,
  knockbackMin: 0.12,
  knockbackDecay: 0.88,
  /** Masa de referencia del cuerpo (kg de juego): la misma que usa el análisis para la locomoción. */
  massRef: 0.006,
  /** La guardia solo protege con esta fracción de levantada. */
  guardReady: 0.5,
  /** Fracción del ancho del cuerpo de cada uno que no se puede superponer. */
  bodyGap: 1,
  /** Rival: cuadros mínimo/máximo entre ataques, y chance de guardarse al ver un golpe. */
  aiCooldown: [26, 70] as const,
  aiGuardChance: 0.45,
  aiGuardFrames: 22,
} as const;
