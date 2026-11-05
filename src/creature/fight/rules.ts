import { CREATURE_CONFIG } from '../config';
import { bounds2D, overlap2D } from '../math/shapes2d';
import { createSimState, makeSimPlan, poseCreature, stepSim, type Pose, type SimInput, type SimPlan, type SimState } from '../sim';
import { IDLE } from '../sim/combat';
import type { CreatureAnalysis } from '../types';
import { FIGHT } from './tuning';

export interface Fighter {
  an: CreatureAnalysis;
  plan: SimPlan;
  sim: SimState;
  pose: Pose;
  hp: number;
  /** Cuadros que le quedan sin poder actuar. */
  stun: number;
  /** m/s de empujón vigente. */
  kb: number;
  /** El golpe activo ya pegó (uno por golpe). */
  landed: boolean;
  /** m: mitad del ancho del cuerpo (sin extremidades) para no atravesarse: las extremidades pueden pasar sobre el otro. */
  half: number;
}

export interface FightEvent {
  /** Quién pegó (0 = jugador, 1 = rival). */
  by: 0 | 1;
  at: [number, number];
  damage: number;
  blocked: boolean;
}

export interface FightState {
  frame: number;
  f: [Fighter, Fighter];
  /** Eventos de este cuadro. */
  events: FightEvent[];
  /** 0/1 = ganó ese; 'draw' = se mataron a la vez; null = sigue. */
  winner: 0 | 1 | 'draw' | null;
}

const cfg = CREATURE_CONFIG;

function fighter(an: CreatureAnalysis, x: number, facing: 1 | -1): Fighter {
  const base = makeSimPlan(an, cfg);
  const plan: SimPlan = { ...base, speed: base.speed * FIGHT.speedMul, accel: base.accel * FIGHT.speedMul, decel: base.decel * FIGHT.speedMul, hopSpeed: base.hopSpeed * FIGHT.speedMul };
  const sim = { ...createSimState(plan, x), facing };
  const pose = poseCreature(an, plan, sim, cfg);
  const b = bounds2D(pose.body);
  return { an, plan, sim, pose, hp: FIGHT.hp, stun: 0, kb: 0, landed: false, half: ((b.max[0] - b.min[0]) / 2) * FIGHT.bodyGap };
}

/**
 * Empieza una pelea: cada uno arranca mirando al otro. El jugador se para del lado al que mira su frente (el dato de la criatura:
 * `profile2D.facing`), y el rival viene del lado contrario (su análisis debe estar hecho con el facing opuesto).
 */
export function createFight(player: CreatureAnalysis, rival: CreatureAnalysis): FightState {
  const pf = player.profile2D.facing;
  return { frame: 0, f: [fighter(player, (-pf * FIGHT.startGap) / 2, pf), fighter(rival, (pf * FIGHT.startGap) / 2, (-pf) as 1 | -1)], events: [], winner: null };
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Un paso (1/60 s) de la pelea, puro: mueve, resuelve golpes (daño, guardia, empujón, aturdimiento) y decide el KO. */
export function stepFight(s: FightState, inputs: [SimInput, SimInput]): FightState {
  const over = s.winner !== null;
  const events: FightEvent[] = [];
  const f = s.f.map((q, i) => {
    const stunned = q.stun > 0 || over;
    let sim = stepSim(q.sim, stunned ? { move: 0 } : inputs[i], q.plan, cfg);
    if (q.stun > 0) sim = { ...sim, combat: IDLE };
    let x = sim.x + q.kb * cfg.sim.dt;
    x = clamp(x, -FIGHT.arenaHalf, FIGHT.arenaHalf);
    return { ...q, sim: { ...sim, x }, stun: Math.max(0, q.stun - 1), kb: Math.abs(q.kb) < 1e-4 ? 0 : q.kb * FIGHT.knockbackDecay };
  }) as [Fighter, Fighter];

  // No se atraviesan: si se pisan, se separan a partes iguales (sin sacar a nadie de la arena).
  const gap = f[0].half + f[1].half;
  const lo = f[0].sim.x <= f[1].sim.x ? 0 : 1;
  const hi = 1 - lo;
  const d = f[hi].sim.x - f[lo].sim.x;
  if (d < gap) {
    const push = (gap - d) / 2;
    f[lo] = { ...f[lo], sim: { ...f[lo].sim, x: clamp(f[lo].sim.x - push, -FIGHT.arenaHalf, FIGHT.arenaHalf) } };
    f[hi] = { ...f[hi], sim: { ...f[hi].sim, x: clamp(f[hi].sim.x + push, -FIGHT.arenaHalf, FIGHT.arenaHalf) } };
  }
  for (const q of f) q.pose = poseCreature(q.an, q.plan, q.sim, cfg);

  // Golpes: la caja activa del que pega contra todo el cuerpo del otro; uno por golpe. Los dos pueden pegarse a la vez.
  const hits: { from: 0 | 1; dmg: number; blocked: boolean; at: [number, number] }[] = [];
  for (const i of [0, 1] as const) {
    const a = f[i];
    const b = f[1 - i];
    if (a.sim.combat.phase !== 'active') {
      a.landed = false;
      continue;
    }
    const hb = a.pose.hitbox;
    if (!hb || a.landed || over) continue;
    const circle = { kind: 'capsule' as const, a: hb.center, b: hb.center, r: hb.r };
    if (!b.pose.shapes.some((sh) => overlap2D(circle, sh))) continue;
    const act = a.plan.actions.find((q) => q.id === hb.actionId);
    if (!act) continue;
    const c = b.sim.combat;
    const guarded = c.phase === 'guard' && c.guard >= cfg.sim.guardFrames * FIGHT.guardReady;
    const dmg = act.damage * FIGHT.damageScale * (guarded ? 1 - b.plan.defense.reduction : 1);
    hits.push({ from: i, dmg, blocked: guarded, at: hb.center });
    a.landed = true;
  }
  for (const h of hits) {
    const b = f[1 - h.from];
    b.hp = Math.max(0, b.hp - h.dmg);
    if (!h.blocked) {
      b.stun = FIGHT.hitstun;
      b.sim = { ...b.sim, combat: IDLE };
    }
    const sign = f[h.from].sim.x <= b.sim.x ? 1 : -1;
    b.kb = sign * Math.max(FIGHT.knockbackMin, (h.dmg * FIGHT.knockback) / (1 + b.an.mass.total / FIGHT.massRef)) * (h.blocked ? 0.4 : 1);
    events.push({ by: h.from, at: h.at, damage: h.dmg, blocked: h.blocked });
  }

  const dead0 = f[0].hp <= 0;
  const dead1 = f[1].hp <= 0;
  const winner = s.winner ?? (dead0 && dead1 ? 'draw' : dead0 ? 1 : dead1 ? 0 : null);
  return { frame: s.frame + 1, f, events, winner };
}
