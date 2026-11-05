import type { SimInput } from '../sim';
import type { AttackAction } from '../types';
import { CREATURE_CONFIG } from '../config';
import type { FightState } from './rules';
import { FIGHT } from './tuning';

export interface AiMem {
  seed: number;
  cool: number;
  guardLeft: number;
  /** Acción en curso: cuadros que faltan apretando el botón. */
  press: number;
  act: AttackAction | null;
}

export const newAi = (seed = 1): AiMem => ({ seed, cool: 40, guardLeft: 0, press: 0, act: null });

/** Azar chico y determinista (mulberry32). */
function rnd(m: AiMem): number {
  m.seed = (m.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(m.seed ^ (m.seed >>> 15), 1 | m.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Entrada del rival (lado 1): se acerca hasta el alcance de su mejor golpe, pega con cadencia y a veces se guarda al ver uno. */
export function aiInput(s: FightState, m: AiMem): SimInput {
  const me = s.f[1];
  const foe = s.f[0];
  const dist = foe.sim.x - me.sim.x;
  const dir: -1 | 1 = dist >= 0 ? 1 : -1;
  const near = Math.abs(dist);
  const acts = me.plan.actions;
  const reach = acts.reduce((r, a) => Math.max(r, a.reach + a.hitRadius), 0);
  const range = reach * 0.85 + me.half + foe.half;
  m.cool = Math.max(0, m.cool - 1);

  if (m.press > 0) {
    m.press--;
    const a = m.act;
    return { move: a?.input === 'forward+attack' ? me.sim.facing : 0, attack: true, vertical: a?.input === 'up+attack' ? 1 : a?.input === 'down+attack' ? -1 : 0 };
  }
  if (m.guardLeft > 0) {
    m.guardLeft--;
    return { move: 0, guard: true };
  }
  const foeStriking = foe.sim.combat.phase === 'startup' || foe.sim.combat.phase === 'active';
  if (foeStriking && near < range * 1.4 && rnd(m) < FIGHT.aiGuardChance / 8) {
    m.guardLeft = FIGHT.aiGuardFrames;
    return { move: 0, guard: true };
  }
  if (me.sim.combat.phase !== 'idle' || me.stun > 0) return { move: 0 };
  if (near > range || me.sim.facing !== dir) return { move: dir };
  if (m.cool === 0 && acts.length) {
    const a = acts[Math.floor(rnd(m) * acts.length)];
    m.act = a;
    m.press = a.input === 'hold+attack' ? CREATURE_CONFIG.sim.holdFrames + 2 : 3;
    m.cool = FIGHT.aiCooldown[0] + Math.floor(rnd(m) * (FIGHT.aiCooldown[1] - FIGHT.aiCooldown[0]));
  }
  return { move: 0 };
}
