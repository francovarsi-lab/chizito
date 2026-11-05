import { CREATURE_CONFIG } from '../config';
import { interpret } from '../interpret';
import type { SimInput } from '../sim';
import type { CreatureAnalysis, CreatureSnapshot } from '../types';
import type { PanelController } from '../ui/mount';
import { actionsHelp } from '../ui/proberHud';
import { aiInput, newAi, type AiMem } from './ai';
import { addEvents, BROCCOLI_LOOK, buildBackground, drawFight, makeView, newFx, PLAYER_LOOK, type Fx, type View } from './draw';
import { createFight, stepFight, type FightState } from './rules';
import { FIGHT } from './tuning';

export interface FightController {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  state(): FightState | null;
  /** Para pruebas: avanza `frames` pasos con la entrada del jugador dada (el rival juega con su IA) y dibuja. */
  advance(frames: number, input?: SimInput | ((frame: number) => SimInput)): void;
  restart(): void;
  destroy(): void;
}

declare global {
  interface Window {
    /** La pelea (solo existe con `?creature`). */
    __fight?: FightController;
  }
}

const css = `
#cf-btn{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:41;border:3px solid #1a0d08;border-radius:26px;padding:11px 28px;background:#ffd21f;color:#1a0d08;font:900 17px "Arial Black",system-ui,sans-serif;letter-spacing:.08em;cursor:pointer;box-shadow:4px 4px 0 #1a0d08}
#cf-btn:hover{background:#ffe066}#cf-btn:active{transform:translate(calc(-50% + 2px),2px);box-shadow:2px 2px 0 #1a0d08}
#cf{position:fixed;inset:0;z-index:60;background:#05080f}
#cf[hidden]{display:none}
#cf canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#cf .cf-help{position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff6df;font:600 13px system-ui,sans-serif;text-shadow:0 1px 3px #000;white-space:pre-line;pointer-events:none}
`;

const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyZ', 'KeyX', 'KeyR', 'Escape']);

/** Monta la pelea: botón "⚔ PELEAR" (abajo al centro), pantalla completa, tu criatura contra el rival de brócoli. */
export function mountFight(deps: { panel: PanelController; host?: HTMLElement }): FightController {
  const host = deps.host ?? document.body;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  const btn = document.createElement('button');
  btn.id = 'cf-btn';
  btn.textContent = '⚔ PELEAR';
  const root = document.createElement('div');
  root.id = 'cf';
  root.hidden = true;
  root.innerHTML = '<canvas></canvas><div class="cf-help"></div>';
  host.append(btn, root);
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  const g = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  const help = root.querySelector('.cf-help') as HTMLDivElement;

  let open = false;
  let state: FightState | null = null;
  let player: CreatureAnalysis | null = null;
  let rival: CreatureAnalysis | null = null;
  let view: View = makeView(1280, 720);
  let bg: HTMLCanvasElement | null = null;
  let fx: Fx = newFx();
  let ai: AiMem = newAi(1);
  let raf = 0;
  let last = 0;
  let acc = 0;
  let hitstop = 0;
  let time = 0;
  let seed = 1;
  const keys = new Set<string>();

  const resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.round(window.innerWidth * dpr));
    const h = Math.max(240, Math.round(window.innerHeight * dpr));
    if (canvas.width === w && canvas.height === h && bg) return;
    canvas.width = w;
    canvas.height = h;
    view = makeView(w, h);
    bg = buildBackground(view);
  };

  const readInput = (): SimInput => ({
    move: ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) as -1 | 0 | 1,
    attack: keys.has('KeyZ'),
    guard: keys.has('KeyX'),
    vertical: ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) as -1 | 0 | 1,
  });

  const loadRival = async (facing: 1 | -1): Promise<CreatureAnalysis> => {
    const raw = (await import('../fixtures/veg.snapshot.json?raw')).default;
    return interpret(JSON.parse(raw) as CreatureSnapshot, { facing });
  };

  const restart = (): void => {
    if (!player || !rival) return;
    state = createFight(player, rival);
    fx = newFx();
    ai = newAi(seed++);
    hitstop = 0;
  };

  const step = (input: SimInput): void => {
    if (!state) return;
    state = stepFight(state, [input, aiInput(state, ai)]);
    if (state.events.length) {
      addEvents(fx, view, state.events);
      hitstop = state.events.some((e) => !e.blocked) ? FIGHT.hitstop : 2;
    }
  };

  const draw = (dt: number): void => {
    if (!state || !bg) return;
    time += dt;
    drawFight(g, view, bg, state, [PLAYER_LOOK, BROCCOLI_LOOK], fx, dt, time);
  };

  const frame = (now: number): void => {
    raf = 0;
    if (!open) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    acc += dt;
    const fixed = CREATURE_CONFIG.sim.dt;
    let n = 0;
    while (acc >= fixed && n < 5) {
      acc -= fixed;
      n++;
      if (hitstop > 0) hitstop--;
      else step(readInput());
    }
    draw(dt);
    raf = requestAnimationFrame(frame);
  };

  const onKey = (down: boolean) => (e: KeyboardEvent): void => {
    if (!open || e.ctrlKey || e.metaKey || e.altKey || !KEYS.has(e.code)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (down) {
      if (e.code === 'Escape') return controller.close();
      if (e.code === 'KeyR') return restart();
      keys.add(e.code);
    } else keys.delete(e.code);
  };
  const kd = onKey(true);
  const ku = onKey(false);
  window.addEventListener('keydown', kd, true);
  window.addEventListener('keyup', ku, true);
  const blur = (): void => keys.clear();
  window.addEventListener('blur', blur);
  window.addEventListener('resize', resize);

  const controller: FightController = {
    async open() {
      const an = deps.panel.state()?.analysis;
      if (!an) return;
      player = an;
      rival = await loadRival((-an.profile2D.facing) as 1 | -1);
      root.hidden = false;
      btn.hidden = true;
      open = true;
      resize();
      restart();
      help.textContent = `← → moverse · Z atacar · X guardia · R revancha · Esc salir\nTus golpes: ${actionsHelp(an)}`;
      last = 0;
      acc = 0;
      draw(0);
      raf = requestAnimationFrame(frame);
    },
    close() {
      open = false;
      root.hidden = true;
      btn.hidden = false;
      keys.clear();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    isOpen: () => open,
    state: () => state,
    advance(frames, input) {
      for (let f = 0; f < frames; f++) {
        if (hitstop > 0) {
          hitstop--;
          continue;
        }
        step(typeof input === 'function' ? input(f) : (input ?? readInput()));
      }
      draw(frames / 60);
    },
    restart,
    destroy() {
      controller.close();
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', resize);
      root.remove();
      btn.remove();
      st.remove();
    },
  };
  btn.addEventListener('click', () => void controller.open());
  return controller;
}
