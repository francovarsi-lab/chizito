import { CREATURE_CONFIG } from '../config';
import type { AttackAction, CreatureAnalysis, Limb } from '../types';
import { limbStrikeKind } from './actions';
import { crowdOf } from './limbs';

/**
 * Qué pasó con el golpe de cada extremidad, con las MISMAS reglas que `computeActions` (no agrega ninguna): ejecuta una acción, o no
 * y por qué. Un solo lugar para el panel y los informes.
 *  executes: ejecuta su acción · loses: pasa el mínimo pero otra del mismo tipo es mejor (una acción por tipo)
 *  arc: apunta fuera del arco de golpe · crowded: el apiñamiento con vecinas del mismo golpe la baja del mínimo
 *  below: la capacidad no llega al mínimo (en profundidad, ancla floja, corta…)
 */
export interface StrikeVerdict {
  limbId: string;
  outcome: 'executes' | 'loses' | 'arc' | 'crowded' | 'below';
  kind: AttackAction['kind'] | null;
  strike: number;
  min: number;
  angleDeg: number;
  /** Vecinas del mismo tipo de golpe que la aprietan. */
  neighbors: number;
  /** executes: la acción. */
  action?: AttackAction;
  /** loses: la extremidad que ejecuta ese tipo y su capacidad. */
  winnerId?: string;
  winnerStrike?: number;
}

export function explainStrikes(a: Pick<CreatureAnalysis, 'limbs' | 'actions'>, cfg = CREATURE_CONFIG): Map<string, StrikeVerdict> {
  const min = cfg.capabilities.minRole;
  const kindOf = new Map<Limb, ReturnType<typeof limbStrikeKind>>(a.limbs.map((l) => [l, limbStrikeKind(l, cfg)]));
  const byLimb = new Map(a.actions.filter((x) => x.limbId).map((x) => [x.limbId as string, x]));
  const out = new Map<string, StrikeVerdict>();
  for (const l of a.limbs) {
    const kind = kindOf.get(l) ?? null;
    const neighbors = crowdOf(l, a.limbs, cfg, (o) => kindOf.get(o) === kind);
    const base = { limbId: l.id, kind, strike: l.caps.strike, min, angleDeg: l.profile.angleDeg, neighbors };
    const action = byLimb.get(l.id);
    if (action) out.set(l.id, { ...base, outcome: 'executes', action });
    // Una maza se clasifica como mazazo sin mirar el arco (regla del MVP 0); si apunta fuera del arco el motivo real es ese, no la capacidad.
    else if (kind === null || (!l.profile.inDepth && Math.abs(l.profile.angleDeg) > cfg.capabilities.strikeArcDeg)) out.set(l.id, { ...base, outcome: 'arc' });
    else if (l.caps.strike < min) out.set(l.id, { ...base, outcome: neighbors > 0 && l.caps.strike * (1 + neighbors) >= min ? 'crowded' : 'below' });
    else {
      const win = a.actions.find((x) => x.kind === kind && x.limbId);
      const wl = a.limbs.find((x) => x.id === win?.limbId);
      out.set(l.id, { ...base, outcome: 'loses', winnerId: win?.limbId, winnerStrike: wl?.caps.strike });
    }
  }
  return out;
}
