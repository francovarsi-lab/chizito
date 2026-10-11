import { INPUT_TEXT, KIND_TEXT, MODE_TEXT } from '../describe';
import type { SimPlan, SimState } from '../sim';
import type { CreatureAnalysis } from '../types';

const nf = (x: number, d = 1) => x.toFixed(d).replace('.', ',');

/** Teclas del probador (figuran en pantalla). */
export const PROBER_KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', attack: 'KeyZ', guard: 'KeyX' } as const;

export const KEYS_HELP = '← → moverse · Z ataque (↑ + Z golpe alto · ↓ + Z barrida · → + Z estocada · mantener Z mazazo) · X defensa';

export interface HudInfo {
  /** "camina · 22,0 mm/s (ahora 18,4)". */
  move: string;
  /** El golpe en curso con sus cuadros, o "libre". */
  combat: string;
  /** Línea de la defensa. */
  defense: string;
}

/**
 * El cartel del probador: modo de movimiento, velocidad (la del análisis y la de ahora) y cuadros del golpe en curso
 * ("estocada · arranque 3/12 · 12+6+16 cuadros · daño 10,2"). Función pura: se prueba en Node.
 */
export function hudInfo(a: CreatureAnalysis, plan: SimPlan, st: SimState): HudInfo {
  const speedNow = st.air ? Math.abs(st.vx) : Math.abs(st.vx);
  const lim = (id?: string) => (id ? a.limbs.findIndex((l) => l.id === id) + 1 : 0);
  const move = `${MODE_TEXT[plan.mode]}${st.turnTimer > 0 ? ' · dando la vuelta' : ''}${st.air ? ' · en el aire' : ''} · ${nf(plan.speed * 1000)} mm/s (ahora ${nf(speedNow * 1000)})`;
  const c = st.combat;
  const act = c.actionId ? plan.actions.find((x) => x.id === c.actionId) : undefined;
  let combat = 'libre';
  if (act && (c.phase === 'startup' || c.phase === 'active' || c.phase === 'recovery')) {
    const count = c.phase === 'startup' ? act.startup : c.phase === 'active' ? act.active : act.recovery;
    const phaseText = c.phase === 'startup' ? 'arranque' : c.phase === 'active' ? 'ACTIVO' : 'recuperación';
    combat = `${KIND_TEXT[act.kind]}${act.limbId ? ` ← extremidad ${lim(act.limbId)}` : ' ← cuerpo'} · ${phaseText} ${c.frame + 1}/${count} · ${act.startup}+${act.active}+${act.recovery} cuadros · daño ${nf(act.damage)}`;
  } else if (c.charge > 0) combat = `cargando el golpe mantenido ${c.charge}`;
  else if (c.phase === 'guard') combat = 'guardia';
  const d = plan.defense;
  const defense = `defensa: ${d.kind === 'guard' ? `guardia con la extremidad ${lim(d.limbId)}` : 'se encoge'} (−${Math.round(d.reduction * 100)} % de daño)${c.guard > 0 ? ' · arriba' : ''}`;
  return { move, combat, defense };
}

/** Lista de acciones con su entrada, para mostrarla junto a las teclas. */
export function actionsHelp(a: CreatureAnalysis): string {
  return a.actions.map((x) => `${KIND_TEXT[x.kind]} (${INPUT_TEXT[x.input]})`).join(' · ') || 'sin acciones';
}
