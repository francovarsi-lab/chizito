import { CREATURE_CONFIG } from '../config';
import { createSimState, makeSimPlan, poseCreature, stepSim, type Pose, type SimInput, type SimPlan, type SimState } from '../sim';
import type { CreatureAnalysis } from '../types';
import type { PanelController } from './mount';
import { drawProber, viewScale } from './proberDraw';
import { actionsHelp, hudInfo, KEYS_HELP, PROBER_KEYS } from './proberHud';

export interface ProberCreature {
  id: string;
  label: string;
}

/** La criatura que está cargada en el juego (por Ctrl+O o por el panel). */
export const LIVE_ID = '__live';

export const PROBER_CREATURES: ProberCreature[] = [
  { id: 'A', label: 'A · 2 brazos + 2 piernas (camina)' },
  { id: 'B', label: 'B · 4 brazos (se arrastra)' },
  { id: 'C', label: 'C · 1 brazo (se arrastra)' },
  { id: 'D', label: 'D · erizo de 30 (rueda)' },
  { id: 'E', label: 'E · asimétrica con maza' },
  { id: 'veg', label: 'Rival vegetal' },
  { id: 'P', label: 'P · 7 palitos en profundidad' },
  { id: 'S8', label: 'S8 · un solo pie (salta)' },
  { id: 'F40', label: 'F40 · 40 extremidades (carga)' },
  { id: 'criatura-20261011-1623', label: 'Mi criatura (criatura-20261011-1623)' },
  { id: LIVE_ID, label: 'La del juego (la que cargues con Ctrl+O)' },
];

const css = (w: number, h: number): string => `
#cs-prober-btn{position:fixed;left:12px;bottom:12px;z-index:41;border:0;border-radius:18px;padding:7px 14px;background:#7a4b00;color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(60,40,20,.3)}
#cs-prober{contain:layout paint style;will-change:transform;position:fixed;width:${w}px;left:12px;bottom:12px;z-index:41;background:rgba(255,253,247,.97);border-radius:14px;box-shadow:0 6px 28px rgba(60,40,20,.32);font:12px/1.35 system-ui,sans-serif;color:#2b2b2b;overflow:hidden}
#cs-prober[hidden]{display:none}
#cs-prober .cp-head{display:flex;align-items:center;gap:8px;padding:8px 12px}
#cs-prober .cp-head b{letter-spacing:.06em;color:#7a4b00}
#cs-prober select{flex:1;padding:4px 6px;border-radius:8px;border:1px solid #d9c9a4;background:#fff;font:inherit}
#cs-prober .cp-fps{min-width:62px;text-align:right;color:#666}
#cs-prober .cp-x{border:0;background:#f1e6cf;border-radius:8px;width:24px;height:22px;cursor:pointer}
#cs-prober canvas{display:block;width:${w}px;height:${h}px}
#cs-prober .cp-hud{padding:6px 12px 2px;font-weight:600}
#cs-prober .cp-hud div{margin:1px 0}
#cs-prober .cp-keys{padding:2px 12px 8px;box-sizing:border-box;color:#666;font-size:11px}
#cs-prober .cp-pads{display:flex;gap:8px;padding:0 12px 10px}
#cs-prober .cp-pads button{flex:1;padding:7px;border:0;border-radius:9px;font:700 12px system-ui,sans-serif;cursor:pointer;color:#fff;user-select:none}
#cs-prober .cp-atk{background:#e57373}
#cs-prober .cp-grd{background:#64b5f6}
#cs-prober .cp-atk.on,#cs-prober .cp-grd.on{filter:brightness(.8)}
`;

export interface ProberSnapshot {
  id: string;
  analysis: CreatureAnalysis;
  plan: SimPlan;
  sim: SimState;
  pose: Pose;
}

export interface ProberController {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Elige una criatura (la carga en el juego, el panel la interpreta) y reinicia la simulación. */
  select(id: string): Promise<void>;
  state(): ProberSnapshot | null;
  /** Avanza `frames` pasos fijos con la entrada dada (o la del teclado) y dibuja: para probar sin depender del reloj. */
  advance(frames: number, input?: SimInput | ((frame: number) => SimInput)): void;
  render(): void;
  /** Detiene (o reanuda) el bucle automático. */
  setManual(manual: boolean): void;
  /** fps medidos del bucle (promedio de los últimos cuadros). */
  fps(): number;
  /** Costo de simular, posar y dibujar `frames` cuadros de la criatura actual, con andar y golpes. */
  benchmark(frames: number): { frames: number; msPerFrame: number; fpsPotential: number; limbs: number };
  destroy(): void;
}

declare global {
  interface Window {
    /** El probador del panel (solo existe con `?creature`). */
    __prober?: ProberController;
  }
}

/** Monta el probador: piso plano, la criatura elegida se mueve con las flechas y dos botones (Z ataque, X defensa). */
export function mountProber(deps: { panel: PanelController; host?: HTMLElement; startOpen?: boolean; cfg?: typeof CREATURE_CONFIG }): ProberController {
  const cfg = deps.cfg ?? CREATURE_CONFIG;
  const pc = cfg.prober;
  const host = deps.host ?? document.body;
  if (!document.getElementById('cp-style')) {
    const st = document.createElement('style');
    st.id = 'cp-style';
    st.textContent = css(pc.width, pc.height);
    document.head.appendChild(st);
  }
  const btn = document.createElement('button');
  btn.id = 'cs-prober-btn';
  btn.textContent = '▶ Probador';
  const root = document.createElement('div');
  root.id = 'cs-prober';
  root.hidden = true;
  root.innerHTML = `<div class="cp-head"><b>PROBADOR</b><select>${PROBER_CREATURES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}</select><span class="cp-fps"></span><button class="cp-x" title="cerrar">×</button></div>
<canvas width="${pc.width}" height="${pc.height}"></canvas>
<div class="cp-hud"><div class="cp-move"></div><div class="cp-combat"></div><div class="cp-def"></div></div>
<div class="cp-keys"></div>
<div class="cp-pads"><button class="cp-atk">Z · Ataque</button><button class="cp-grd">X · Defensa</button></div>`;
  host.appendChild(btn);
  host.appendChild(root);
  const q = <T extends Element>(sel: string): T => root.querySelector(sel) as T;
  const select = q<HTMLSelectElement>('select');
  const canvas = q<HTMLCanvasElement>('canvas');
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  const elFps = q<HTMLSpanElement>('.cp-fps');
  const elMove = q<HTMLDivElement>('.cp-move');
  const elCombat = q<HTMLDivElement>('.cp-combat');
  const elDef = q<HTMLDivElement>('.cp-def');
  const elKeys = q<HTMLDivElement>('.cp-keys');
  const padAtk = q<HTMLButtonElement>('.cp-atk');
  const padGrd = q<HTMLButtonElement>('.cp-grd');

  let analysis: CreatureAnalysis | null = null;
  let plan: SimPlan | null = null;
  let sim: SimState | null = null;
  let pose: Pose | null = null;
  let scale = 1;
  let currentId = 'A';
  let selecting = false;
  let open = false;
  let manual = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  const deltas: number[] = [];
  const keys = new Set<string>();
  const pads = { attack: false, guard: false };
  const txt = new Map<Element, string>();
  const setText = (el: Element, s: string): void => {
    if (txt.get(el) !== s) {
      txt.set(el, s);
      el.textContent = s;
    }
  };

  const readInput = (): SimInput => ({
    move: (keys.has(PROBER_KEYS.right) ? 1 : 0) - (keys.has(PROBER_KEYS.left) ? 1 : 0) as -1 | 0 | 1,
    attack: keys.has(PROBER_KEYS.attack) || pads.attack,
    guard: keys.has(PROBER_KEYS.guard) || pads.guard,
    vertical: (keys.has(PROBER_KEYS.up) ? 1 : 0) - (keys.has(PROBER_KEYS.down) ? 1 : 0) as -1 | 0 | 1,
  });

  /** Si el panel interpretó otra criatura (selector, Ctrl+O, deshacer…), se reinicia la simulación con ella. */
  const sync = (): void => {
    const an = deps.panel.state()?.analysis ?? null;
    if (!an || an === analysis) return;
    analysis = an;
    plan = makeSimPlan(an, cfg);
    sim = createSimState(plan);
    scale = viewScale(an, cfg);
    setText(elKeys, `${KEYS_HELP}\nAcciones de esta criatura: ${actionsHelp(an)}`);
    elKeys.style.whiteSpace = 'pre-line';
    if (!selecting) select.value = LIVE_ID;
  };

  const render = (): void => {
    if (!analysis || !plan || !sim) return;
    pose = poseCreature(analysis, plan, sim, cfg);
    drawProber(ctx, { w: pc.width, h: pc.height, scale, camX: sim.x }, analysis, plan, sim, pose, cfg);
    const hud = hudInfo(analysis, plan, sim);
    setText(elMove, `Movimiento: ${hud.move}`);
    setText(elCombat, `Golpe: ${hud.combat}`);
    setText(elDef, hud.defense);
  };

  const fps = (): number => {
    if (!deltas.length) return 0;
    const mean = deltas.reduce((acc2, d) => acc2 + d, 0) / deltas.length;
    return mean > 0 ? 1000 / mean : 0;
  };

  const frame = (now: number): void => {
    raf = 0;
    if (!open || manual) return;
    if (last) {
      const dt = now - last;
      deltas.push(dt);
      if (deltas.length > pc.fpsWindow) deltas.shift();
      acc += Math.min(dt / 1000, cfg.sim.dt * pc.maxStepsPerFrame);
    }
    last = now;
    sync();
    if (plan && sim) {
      let steps = 0;
      while (acc >= cfg.sim.dt && steps < pc.maxStepsPerFrame) {
        sim = stepSim(sim, readInput(), plan, cfg);
        acc -= cfg.sim.dt;
        steps++;
      }
    }
    render();
    setText(elFps, `${fps().toFixed(0)} fps`);
    raf = requestAnimationFrame(frame);
  };
  const kick = (): void => {
    if (open && !manual && !raf) {
      last = 0;
      acc = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  // Teclado: mientras el probador está abierto, sus teclas son SUYAS (el juego no las recibe). Con Ctrl/Alt/Meta pasan de largo.
  const mine = new Set<string>(Object.values(PROBER_KEYS));
  const onKey = (down: boolean) => (e: KeyboardEvent): void => {
    if (!open || e.ctrlKey || e.metaKey || e.altKey || !mine.has(e.code)) return;
    const t = e.target as HTMLElement | null;
    if (t && /^(input|select|textarea)$/i.test(t.tagName)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (down) keys.add(e.code);
    else keys.delete(e.code);
  };
  const onDown = onKey(true);
  const onUp = onKey(false);
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);
  const blur = (): void => {
    keys.clear();
    pads.attack = false;
    pads.guard = false;
  };
  window.addEventListener('blur', blur);
  const bindPad = (el: HTMLButtonElement, key: 'attack' | 'guard'): void => {
    const set = (v: boolean) => () => {
      pads[key] = v;
      el.classList.toggle('on', v);
    };
    el.addEventListener('pointerdown', set(true));
    el.addEventListener('pointerup', set(false));
    el.addEventListener('pointerleave', set(false));
  };
  bindPad(padAtk, 'attack');
  bindPad(padGrd, 'guard');

  const controller: ProberController = {
    open: () => {
      open = true;
      root.hidden = false;
      btn.hidden = true;
      sync();
      render();
      kick();
    },
    close: () => {
      open = false;
      root.hidden = true;
      btn.hidden = false;
      keys.clear();
    },
    isOpen: () => open,
    async select(id) {
      currentId = id;
      select.value = id;
      selecting = true;
      try {
        if (id !== LIVE_ID) await deps.panel.loadCreature(id);
        analysis = null; // fuerza el reinicio aunque el panel devuelva el mismo análisis
        sync();
      } finally {
        selecting = false;
      }
      select.value = id;
      render();
    },
    state: () => (analysis && plan && sim && pose ? { id: currentId, analysis, plan, sim, pose } : null),
    advance(frames, input) {
      sync();
      if (!plan || !sim) return;
      for (let f = 0; f < frames; f++) sim = stepSim(sim, typeof input === 'function' ? input(f) : (input ?? readInput()), plan, cfg);
      render();
    },
    render,
    setManual(m) {
      manual = m;
      if (m && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      kick();
    },
    fps,
    benchmark(frames) {
      sync();
      if (!analysis || !plan) return { frames: 0, msPerFrame: 0, fpsPotential: 0, limbs: 0 };
      const p = plan;
      const an = analysis;
      let s = createSimState(p);
      const script = (f: number): SimInput => ({ move: p.facing, attack: f % 90 < 3, guard: f % 150 > 120, vertical: f % 270 < 90 ? 0 : f % 270 < 180 ? 1 : -1 });
      const t0 = performance.now();
      for (let f = 0; f < frames; f++) {
        s = stepSim(s, script(f), p, cfg);
        const ps = poseCreature(an, p, s, cfg);
        drawProber(ctx, { w: pc.width, h: pc.height, scale, camX: s.x }, an, p, s, ps, cfg);
      }
      const ms = (performance.now() - t0) / frames;
      return { frames, msPerFrame: ms, fpsPotential: ms > 0 ? 1000 / ms : Infinity, limbs: an.limbs.length };
    },
    destroy() {
      open = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', blur);
      root.remove();
      btn.remove();
    },
  };

  btn.addEventListener('click', () => controller.open());
  q<HTMLButtonElement>('.cp-x').addEventListener('click', () => controller.close());
  select.addEventListener('change', () => void controller.select(select.value));
  select.value = currentId;
  if (deps.startOpen) controller.open();
  return controller;
}
