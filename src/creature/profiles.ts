import { CREATURE_CONFIG, type CreatureConfig } from './config';
import type { PieceKind } from './types';

/**
 * Perfil estructural de cada tipo de pieza: QUÉ ES (núcleo, bulto, vara, placa, trazo). Los números
 * (densidades, umbrales) NO están acá: viven en `config.ts`. Agregar un snack = una fila en esta tabla.
 */
const KIND_BY_TYPE: Record<string, PieceKind> = {
  chizito: 'blob', // el raíz se marca como 'core' al armar el snapshot
  aceituna: 'blob',
  palito: 'rod',
  escarbadientes: 'rod',
  papita: 'plate',
  nacho: 'plate',
  ketchup: 'stroke',
};

export const isKnownType = (type: string): boolean => type in KIND_BY_TYPE;

/** Tipos desconocidos se tratan como 'blob' de masa genérica (nunca error). */
export const kindOfType = (type: string): PieceKind => KIND_BY_TYPE[type] ?? 'blob';

export const densityOf = (type: string, cfg: CreatureConfig = CREATURE_CONFIG): number => cfg.densities[type] ?? cfg.densities.default;

export const lumpinessOf = (type: string, cfg: CreatureConfig = CREATURE_CONFIG): number => cfg.lumpiness[type] ?? cfg.lumpiness.default;

/**
 * Estable o inestable (§N8): lo que todavía puede cambiar en el chat 3D (ketchup, chizito ensartado en una
 * cola, papitas o nachos partidos) y los tipos desconocidos.
 */
export function stabilityOf(type: string, opts: { mode?: string; params?: Record<string, unknown> } = {}, cfg: CreatureConfig = CREATURE_CONFIG): 'stable' | 'unstable' {
  if (!isKnownType(type) || cfg.unstableTypes.includes(type)) return 'unstable';
  if (opts.mode === 'tail') return 'unstable';
  if (opts.params && Array.isArray(opts.params.bites) && opts.params.bites.length > 0) return 'unstable';
  return 'stable';
}
