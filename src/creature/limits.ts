/**
 * Topes de una criatura. SIN imports a propósito: el juego (chat 3D) importa este archivo para hacer
 * cumplir los topes, así que tiene que poder cargarse en cualquier contexto.
 * Los demás umbrales del intérprete viven en `config.ts`.
 */

/** Piezas clavadas por criatura (el ketchup no cuenta). */
export const MAX_PIECES = 40;

/** Trazos de ketchup por criatura (tope aparte, no suman a las piezas ni son extremidades). */
export const MAX_STROKES = 30;
