import { CREATURE_CONFIG } from '../config';
import { attackHitbox, mapPoint, swingArc } from '../project/hitboxes';
import type { AttackAction, CreatureAnalysis } from '../types';
import type { CombatState, SimInput, SimPlan } from './types';

export const IDLE: CombatState = { phase: 'idle', actionId: null, frame: 0, attackHeld: false, charge: 0, guard: 0 };

/**
 * Qué acción da el botón de ataque según las flechas (la misma asignación de entradas del análisis):
 *  ↑ + ataque ← golpe alto · ↓ + ataque ← barrida · → (hacia donde mira) + ataque ← estocada · ataque solo ← jab / embestida / rodada.
 * Si la entrada pedida no tiene acción, vale la del ataque solo. (El golpe mantenido se resuelve aparte, con `holdFrames`.)
 */
export function pickAction(actions: AttackAction[], facing: 1 | -1, input: SimInput): AttackAction | undefined {
  const by = (slot: AttackAction['input']) => actions.find((a) => a.input === slot);
  const forward = input.move !== 0 && input.move === facing;
  const want: AttackAction['input'] = input.vertical === 1 ? 'up+attack' : input.vertical === -1 ? 'down+attack' : forward ? 'forward+attack' : 'attack';
  return by(want) ?? by('attack');
}

const start = (a: AttackAction, held: boolean): CombatState => ({ phase: 'startup', actionId: a.id, frame: 0, attackHeld: held, charge: 0, guard: 0 });

/** Un paso de la máquina de combate (pura). `air`: en el aire no se pelea. */
export function stepCombat(c: CombatState, input: SimInput, facing: 1 | -1, air: boolean, plan: SimPlan, cfg = CREATURE_CONFIG): CombatState {
  const sm = cfg.sim;
  const attack = !!input.attack;
  const edge = attack && !c.attackHeld;
  const act = c.actionId ? plan.actions.find((a) => a.id === c.actionId) : undefined;

  if ((c.phase === 'startup' || c.phase === 'active' || c.phase === 'recovery') && act) {
    const count = c.phase === 'startup' ? act.startup : c.phase === 'active' ? act.active : act.recovery;
    const frame = c.frame + 1;
    if (frame < count) return { ...c, frame, attackHeld: attack, guard: Math.max(0, c.guard - 1) };
    if (c.phase === 'startup') return { ...c, phase: 'active', frame: 0, attackHeld: attack };
    if (c.phase === 'active') return { ...c, phase: 'recovery', frame: 0, attackHeld: attack };
    return { ...IDLE, attackHeld: attack };
  }

  // Libre (o con la guardia arriba).
  if (air) return { ...IDLE, attackHeld: attack };
  const holdAct = plan.actions.find((a) => a.input === 'hold+attack');
  if (c.charge > 0) {
    if (!attack) {
      const picked = pickAction(plan.actions, facing, input);
      return picked ? start(picked, attack) : { ...IDLE, attackHeld: attack };
    }
    const charge = c.charge + 1;
    if (holdAct && charge >= sm.holdFrames) return start(holdAct, attack);
    return { ...IDLE, charge, attackHeld: attack };
  }
  if (edge) {
    if (holdAct) return { ...IDLE, charge: 1, attackHeld: attack };
    const picked = pickAction(plan.actions, facing, input);
    if (picked) return start(picked, attack);
  }
  if (input.guard && !attack) return { ...IDLE, phase: 'guard', frame: Math.min(c.frame + 1, sm.guardFrames), attackHeld: attack, guard: Math.min(c.guard + 1, sm.guardFrames) };
  return { ...IDLE, attackHeld: attack, guard: Math.max(0, c.guard - 1) };
}

/** ¿Está ocupada (no se puede caminar)? Peleando, con la guardia arriba o cargando el golpe mantenido. */
export const isBusy = (c: CombatState): boolean => c.phase !== 'idle' || c.charge > 0;

/**
 * Caja de golpe activa en el mundo (null si no hay una acción en sus cuadros activos): la que calcula el análisis (`attackHitbox`)
 * para el cuadro activo `frame` de `active`, llevada al mundo con el lado, la posición y la altura de la criatura.
 */
export function activeHitbox(a: CreatureAnalysis, plan: SimPlan, c: CombatState, x: number, lift: number, mirrored: boolean): { center: [number, number]; r: number; actionId: string } | null {
  if (c.phase !== 'active' || !c.actionId) return null;
  const act = plan.actions.find((q) => q.id === c.actionId);
  if (!act) return null;
  const t = act.active > 1 ? c.frame / (act.active - 1) : 0;
  const hb = attackHitbox(a.profile2D, a.limbs, act, t);
  const cx = (mirrored ? -hb.center[0] : hb.center[0]) + x;
  return { center: [cx, hb.center[1] + lift], r: hb.r, actionId: act.id };
}

/** Ángulo (grados) al que lleva la acción a su extremidad en esta fase: del reposo al arranque, por el arco y de vuelta al reposo. */
export function attackAngle(a: CreatureAnalysis, c: CombatState, act: AttackAction): number | null {
  const limb = a.limbs.find((l) => l.id === act.limbId);
  if (!limb || (c.phase !== 'startup' && c.phase !== 'active' && c.phase !== 'recovery')) return null;
  const { from, to } = swingArc(limb);
  const rest = limb.mobility.restDeg;
  if (c.phase === 'startup') return rest + (from - rest) * ((c.frame + 1) / act.startup);
  if (c.phase === 'active') return from + (to - from) * (act.active > 1 ? c.frame / (act.active - 1) : 0);
  return to + (rest - to) * ((c.frame + 1) / act.recovery);
}

export { mapPoint };
