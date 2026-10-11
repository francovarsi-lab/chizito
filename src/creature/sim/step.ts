import { CREATURE_CONFIG } from '../config';
import { clamp } from '../math/vec';
import { IDLE, isBusy, stepCombat } from './combat';
import type { SimInput, SimPlan, SimState } from './types';

export function createSimState(plan: SimPlan, x = 0, h = 0): SimState {
  return { frame: 0, x, h, vx: 0, vh: 0, facing: plan.facing, phase: 0, angle: 0, turnTimer: 0, air: false, hopFrame: 0, combat: IDLE };
}

/**
 * Un paso (1/60 s) de la simulación cinemática: función PURA (mismo estado y entrada → mismo resultado, sin azar ni reloj).
 *  - Camina / se arrastra / rueda / inmóvil: la velocidad sube a la del análisis y baja con su freno; al invertir el sentido
 *    se queda parada lo que tarda su giro.
 *  - Salta: pausa en el piso y parábola de `airFrames` pasos; la velocidad media es la del análisis.
 *  - Rodar: el ángulo avanza velocidad / radio, sin deslizar.
 *  - El piso (h = 0) no se atraviesa: si h > 0 sin saltar, cae.
 */
export function stepSim(s: SimState, rawInput: SimInput, plan: SimPlan, cfg = CREATURE_CONFIG): SimState {
  const dt = cfg.sim.dt;
  let { x, h, vx, vh, facing, phase, angle, turnTimer, air, hopFrame } = s;
  // Combate: una acción a la vez; mientras pelea, cuida la guardia o carga el golpe mantenido no camina (frena con su freno).
  const combat = stepCombat(s.combat, rawInput, facing, air, plan, cfg);
  const input: SimInput = isBusy(combat) ? { ...rawInput, move: 0 } : rawInput;

  // Dar la vuelta: parada, y al terminar mira para el otro lado.
  if (turnTimer > 0) {
    turnTimer = Math.max(0, turnTimer - dt);
    if (turnTimer === 0) facing = facing === 1 ? -1 : 1;
  } else if (input.move !== 0 && input.move !== facing && !air) {
    turnTimer = plan.turnLock;
  }
  const turning = turnTimer > 0;

  if (plan.mode === 'hop') {
    if (air) {
      hopFrame += 1;
      x += vx * dt;
      const t = hopFrame * dt;
      h = Math.max(0, plan.jumpSpeed * t - (plan.gravity * t * t) / 2);
      vh = plan.jumpSpeed - plan.gravity * t;
      if (hopFrame >= plan.airFrames) {
        air = false;
        hopFrame = 0;
        h = 0;
        vh = 0;
        vx = 0;
      }
    } else {
      vx = 0;
      vh = 0;
      h = 0;
      hopFrame = Math.min(hopFrame + 1, plan.pauseFrames);
      if (input.move !== 0 && !turning && input.move === facing && hopFrame >= plan.pauseFrames) {
        air = true;
        hopFrame = 0;
        vx = input.move * plan.hopSpeed;
        vh = plan.jumpSpeed;
      }
    }
  } else {
    const target = turning ? 0 : input.move * plan.speed;
    const slowing = target === 0 || vx * target < 0 || Math.abs(target) < Math.abs(vx);
    if (slowing) {
      const goal = vx * target < 0 ? 0 : target;
      vx += clamp(goal - vx, -plan.decel * dt, plan.decel * dt);
    } else {
      vx += clamp(target - vx, -plan.accel * dt, plan.accel * dt);
    }
    x += vx * dt;
    if (h > 0) {
      vh -= plan.gravity * dt;
      h = Math.max(0, h + vh * dt);
      if (h === 0) vh = 0;
    } else {
      h = 0;
      vh = 0;
    }
    phase = (phase + (Math.abs(vx) * dt) / plan.stride) % 1;
    if (plan.mode === 'roll') angle -= (vx * dt) / plan.rollRadius;
  }
  return { frame: s.frame + 1, x, h, vx, vh, facing, phase, angle, turnTimer, air, hopFrame, combat };
}

/** Corre `frames` pasos con la entrada que da `input(frame)`; devuelve todos los estados (el 0 es el inicial). */
export function runSim(plan: SimPlan, frames: number, input: (frame: number) => SimInput, start?: SimState, cfg = CREATURE_CONFIG): SimState[] {
  const out: SimState[] = [start ?? createSimState(plan)];
  for (let f = 0; f < frames; f++) out.push(stepSim(out[f], input(f), plan, cfg));
  return out;
}
