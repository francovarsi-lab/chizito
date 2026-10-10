import { CREATURE_CONFIG } from './config';
import { dot, len } from './math/vec';
import type { CreatureSnapshot, V3 } from './types';

/**
 * Revisa un snapshot y devuelve avisos legibles (lista vacía = todo bien). Nunca tira: un snapshot raro se
 * interpreta igual, solo que el panel lo cuenta.
 *
 * Orientación: el contrato LEE el frente del snapshot y no lo supone. −Y (a la derecha de la pantalla del
 * constructor) y +Y (el giro de 180°) son los frentes de combate válidos, con "arriba" = +X (el chizito parado);
 * cualquier otro se acepta y se interpreta igual, con un aviso.
 */
export function validateSnapshot(s: CreatureSnapshot, cfg = CREATURE_CONFIG): string[] {
  const w: string[] = [];
  const { front, up } = s.orientation;
  if (len(front) < 1e-6) w.push('el frente no tiene dirección');
  else if (len(up) < 1e-6) w.push('"arriba" no tiene dirección');
  else {
    const cos = Math.abs(dot(front as V3, up as V3)) / (len(front) * len(up));
    if (cos > 0.9999) w.push('el frente y "arriba" coinciden: no hay perfil posible');
    else if (cos > Math.sin((cfg.orientation.axisTolDeg * Math.PI) / 180)) w.push('"arriba" no es perpendicular al frente: el intérprete lo corrige');
    if (!isCombatFront(front, cfg)) w.push('el frente no está sobre el eje ±Y (frente de combate): se interpreta igual, pero la vista de combate espera ±Y');
  }
  const ids = new Set(s.pieces.map((p) => p.id));
  if (!ids.has(s.coreId)) w.push('falta el núcleo (chizito raíz)');
  if (s.pieces.filter((p) => p.kind === 'core').length !== 1) w.push('tiene que haber exactamente un núcleo');
  if (s.pieces.length !== ids.size) w.push('hay ids de pieza repetidos');
  for (const l of s.links) {
    if (!ids.has(l.parentId) || !ids.has(l.childId)) w.push(`la conexión ${l.id} apunta a una pieza que no existe`);
  }
  if (s.budget.pieceCount > cfg.limits.maxPieces) w.push(`tiene ${s.budget.pieceCount} piezas (el tope es ${cfg.limits.maxPieces})`);
  if (s.budget.strokeCount > cfg.limits.maxStrokes) w.push(`tiene ${s.budget.strokeCount} trazos de ketchup (el tope es ${cfg.limits.maxStrokes})`);
  return w;
}

/** ¿El frente está (en cualquier sentido) sobre un eje de combate permitido? */
export function isCombatFront(front: readonly [number, number, number], cfg = CREATURE_CONFIG): boolean {
  const l = Math.hypot(front[0], front[1], front[2]);
  if (l < 1e-9) return false;
  const tol = Math.cos((cfg.orientation.axisTolDeg * Math.PI) / 180);
  return cfg.orientation.allowedFrontAxes.some((a) => Math.abs((front[0] * a[0] + front[1] * a[1] + front[2] * a[2]) / l) >= tol);
}
