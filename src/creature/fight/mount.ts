import * as THREE from 'three';
import type { AssetRegistry } from '../../assets/AssetRegistry';
import type { PieceRegistry } from '../../pieces/PieceRegistry';
import type { CameraRig } from '../../render/CameraRig';
import type { Stage } from '../../render/Stage';
import { CREATURE_CONFIG } from '../config';
import { interpret } from '../interpret';
import { resolveSnapshot } from '../resolve';
import { poseCreature, type SimInput } from '../sim';
import type { PanelController } from '../ui/mount';
import { actionsHelp } from '../ui/proberHud';
import { aiInput, newAi, type AiMem } from './ai';
import { applyRig, buildEnemy, makeRig, resetRig, tintBroccoli, type Enemy, type Rig3D } from './rig3d';
import { createFight, stepFight, type FightState } from './rules';
import { FIGHT } from './tuning';

/** Lo que el juego deja en `window.__chizito` y la pelea usa: la MISMA escena, cámara y criatura del constructor. */
interface Game {
  stage: Stage;
  pivot: THREE.Group;
  rig: CameraRig;
  assets: AssetRegistry;
  construction: import('../../model/Construction').Construction;
  interaction: { enabled: boolean };
}

export interface FightController {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  state(): FightState | null;
  /** Para pruebas: avanza `frames` pasos con la entrada del jugador dada (el rival juega con su IA). No dibuja: el juego renderiza. */
  advance(frames: number, input?: SimInput | ((frame: number) => SimInput)): void;
  restart(): void;
  /** Las dos criaturas 3D (para las pruebas). */
  rigs(): [Rig3D, Rig3D] | null;
  destroy(): void;
}

declare global {
  interface Window {
    /** La pelea (solo existe con `?creature`). */
    __fight?: FightController;
  }
}

const INK = '#1a0d08';
const css = `
#cf-btn{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:41;border:3px solid ${INK};border-radius:26px;padding:11px 28px;background:#ffd21f;color:${INK};font:900 17px "Arial Black",system-ui,sans-serif;letter-spacing:.08em;cursor:pointer;box-shadow:4px 4px 0 ${INK}}
#cf-btn:hover{background:#ffe066}#cf-btn[hidden]{display:none}
#cf{position:fixed;inset:0;z-index:60;pointer-events:none;font-family:"Arial Black",Impact,system-ui,sans-serif}
#cf[hidden]{display:none}
#cf .bar{position:absolute;top:34px;width:min(38vw,560px);height:30px;border:4px solid ${INK};border-radius:16px;background:#fff6df;box-shadow:5px 5px 0 ${INK};overflow:hidden}
#cf .bar.l{left:4vw}#cf .bar.r{right:4vw}
#cf .bar i{position:absolute;top:0;bottom:0;background:#17c964;transition:width .08s linear}
#cf .bar b{position:absolute;top:0;bottom:0;background:#fff;opacity:.9;transition:width .6s ease .25s}
#cf .bar.l i,#cf .bar.l b{left:0}#cf .bar.r i,#cf .bar.r b{right:0}
#cf .nm{position:absolute;top:6px;color:#fff6df;font-size:18px;letter-spacing:.06em;-webkit-text-stroke:5px ${INK};paint-order:stroke fill;text-shadow:0 2px 0 ${INK}}
#cf .nm.l{left:4vw}#cf .nm.r{right:4vw}
#cf .vs{position:absolute;top:26px;left:50%;transform:translateX(-50%);color:#ffd21f;font-size:30px;-webkit-text-stroke:6px ${INK};paint-order:stroke fill}
#cf .pop{position:absolute;color:#fff;font-size:30px;-webkit-text-stroke:6px ${INK};paint-order:stroke fill;transform:translate(-50%,-50%);white-space:nowrap}
#cf .ko{position:absolute;left:0;right:0;top:22%;text-align:center;display:none}
#cf .ko h1{margin:0;font-size:min(16vh,150px);color:#ff3d2e;-webkit-text-stroke:12px ${INK};paint-order:stroke fill}
#cf .ko h2{margin:6px 0 14px;font-size:min(7vh,64px);color:#ffd21f;-webkit-text-stroke:8px ${INK};paint-order:stroke fill}
#cf .ko button{pointer-events:auto;margin:0 6px;border:3px solid ${INK};border-radius:22px;padding:9px 22px;background:#fff6df;color:${INK};font:900 16px "Arial Black",system-ui,sans-serif;cursor:pointer;box-shadow:4px 4px 0 ${INK}}
#cf .help{position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff;font:700 13px system-ui,sans-serif;text-shadow:0 1px 4px #000,0 0 10px #000;white-space:pre-line}
`;

const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyZ', 'KeyX', 'KeyR', 'Escape']);

/**
 * La pelea en LA MISMA mesa donde se arma la criatura: la cámara pasa a una vista lateral fija y las dos criaturas (la tuya, con
 * todas sus piezas reales, y el rival vegetal armado con las mismas piezas) se mueven y pelean sobre el mantel. Botón "⚔ PELEAR".
 */
export function mountFight(deps: { panel: PanelController; pieces: PieceRegistry; host?: HTMLElement }): FightController {
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
  root.innerHTML = `<div class="nm l">TU CRIATURA</div><div class="bar l"><b></b><i></i></div><div class="vs">VS</div><div class="nm r">BRÓCOLI</div><div class="bar r"><b></b><i></i></div>
<div class="ko"><h1>KO</h1><h2></h2><button data-a="again">R · Revancha</button><button data-a="exit">Esc · Volver a armar</button></div><div class="help"></div>`;
  host.append(btn, root);
  const q = <T extends Element>(s: string): T => root.querySelector(s) as T;
  const bars = [q<HTMLElement>('.bar.l'), q<HTMLElement>('.bar.r')];
  const fills = bars.map((b) => b.querySelector('i') as HTMLElement);
  const chips = bars.map((b) => b.querySelector('b') as HTMLElement);
  const ko = q<HTMLElement>('.ko');
  const help = q<HTMLElement>('.help');

  const game = (): Game => (window as unknown as { __chizito: Game }).__chizito;
  const cfg = CREATURE_CONFIG;
  let open = false;
  let state: FightState | null = null;
  let rigs: [Rig3D, Rig3D] | null = null;
  let enemy: Enemy | null = null;
  let z0 = 0;
  let ai: AiMem = newAi(1);
  let hitstop = 0;
  let seed = 1;
  let raf = 0;
  let last = 0;
  let acc = 0;
  const keys = new Set<string>();
  const hidden: HTMLElement[] = [];
  let saved: { pos: THREE.Vector3; quat: THREE.Quaternion; focal: number; enabled: boolean } | null = null;
  let camBase = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  let tween: { t: number; from: { pos: THREE.Vector3; quat: THREE.Quaternion; focal: number }; to: { pos: THREE.Vector3; quat: THREE.Quaternion; focal: number }; done?: () => void } | null = null;
  let shake = 0;
  const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  const pops: { el: HTMLElement; p: THREE.Vector3; life: number }[] = [];
  const sparkGeo = new THREE.SphereGeometry(0.0013, 6, 6);
  const sparkMat = [new THREE.MeshBasicMaterial({ color: 0xffd21f }), new THREE.MeshBasicMaterial({ color: 0xffffff })];

  /** Vista lateral fija sobre la mesa, mirando a donde pelean. */
  const fightCam = (): { pos: THREE.Vector3; quat: THREE.Quaternion; focal: number } => {
    const pos = new THREE.Vector3(0, 0.085, z0 + 0.5);
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(0, 0.045, z0), new THREE.Vector3(0, 1, 0));
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), focal: 50 };
  };

  const startTween = (to: { pos: THREE.Vector3; quat: THREE.Quaternion; focal: number }, done?: () => void): void => {
    const cam = game().stage.camera;
    tween = { t: 0, from: { pos: cam.position.clone(), quat: cam.quaternion.clone(), focal: cam.getFocalLength() }, to, done };
  };

  const setHud = (): void => {
    if (!state) return;
    state.f.forEach((f, i) => {
      const pct = Math.max(0, f.hp);
      fills[i].style.width = `${pct}%`;
      fills[i].style.background = pct > 50 ? '#17c964' : pct > 25 ? '#ffc21a' : '#ff3d2e';
      chips[i].style.width = `${pct}%`;
    });
    if (state.winner !== null) {
      ko.style.display = 'block';
      (ko.querySelector('h2') as HTMLElement).textContent = state.winner === 'draw' ? '¡EMPATE!' : state.winner === 0 ? '¡GANASTE!' : 'PERDISTE';
    } else ko.style.display = 'none';
  };

  const pose = (): void => {
    if (!state || !rigs) return;
    state.f.forEach((f, i) => applyRig(rigs![i], f.plan, f.sim, poseCreature(f.an, f.plan, f.sim, cfg), z0, cfg));
  };

  const burst = (x: number, y: number, blocked: boolean, damage: number): void => {
    for (let i = 0; i < (blocked ? 8 : 16); i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat[i % 2]);
      m.position.set(x, y, z0 + 0.01);
      const a = Math.random() * Math.PI * 2;
      const sp = 0.12 + Math.random() * 0.3;
      game().stage.scene.add(m);
      sparks.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp + 0.06, (Math.random() - 0.5) * 0.1), life: 0.3 + Math.random() * 0.25 });
    }
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = blocked ? `BLOQUEO −${damage.toFixed(0)}` : `−${damage.toFixed(0)}`;
    root.appendChild(el);
    pops.push({ el, p: new THREE.Vector3(x, y + 0.012, z0 + 0.02), life: 0 });
    shake = Math.max(shake, blocked ? 0.0008 : 0.0025);
  };

  const fx = (dt: number): void => {
    for (const s of sparks) {
      s.life -= dt;
      s.v.y -= 0.9 * dt;
      s.m.position.addScaledVector(s.v, dt);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      if (sparks[i].life <= 0) {
        sparks[i].m.removeFromParent();
        sparks.splice(i, 1);
      }
    }
    const cam = game().stage.camera;
    const v = new THREE.Vector3();
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.life += dt;
      v.copy(p.p).project(cam);
      p.el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
      p.el.style.top = `${((1 - v.y) / 2) * window.innerHeight - p.life * 50}px`;
      p.el.style.opacity = String(Math.max(0, 1 - p.life / 0.9));
      if (p.life > 0.9) {
        p.el.remove();
        pops.splice(i, 1);
      }
    }
    // Cámara: viaje suave al entrar/salir, y temblor de impacto sobre la vista fija.
    const cam3 = game().stage.camera;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.1);
      const k = tween.t * tween.t * (3 - 2 * tween.t);
      camBase.pos.lerpVectors(tween.from.pos, tween.to.pos, k);
      camBase.quat.slerpQuaternions(tween.from.quat, tween.to.quat, k);
      cam3.setFocalLength(THREE.MathUtils.lerp(tween.from.focal, tween.to.focal, k));
      if (tween.t >= 1) {
        const d = tween.done;
        tween = null;
        d?.();
      }
    }
    shake *= Math.pow(0.0005, dt);
    cam3.position.copy(camBase.pos).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    cam3.quaternion.copy(camBase.quat);
    cam3.updateMatrixWorld();
  };

  const step = (input: SimInput): void => {
    if (!state) return;
    state = stepFight(state, [input, aiInput(state, ai)]);
    for (const e of state.events) {
      burst(e.at[0], e.at[1], e.blocked, e.damage);
      if (!e.blocked) hitstop = FIGHT.hitstop;
    }
    pose();
    setHud();
  };

  const readInput = (): SimInput => ({
    move: ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) as -1 | 0 | 1,
    attack: keys.has('KeyZ'),
    guard: keys.has('KeyX'),
    vertical: ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) as -1 | 0 | 1,
  });

  const restart = (): void => {
    if (!rigs) return;
    state = createFight(rigs[0].an, rigs[1].an);
    ai = newAi(seed++);
    hitstop = 0;
    pose();
    setHud();
  };

  const frame = (now: number): void => {
    raf = 0;
    if (!open) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= cfg.sim.dt && n < 5) {
      acc -= cfg.sim.dt;
      n++;
      if (hitstop > 0) hitstop--;
      else step(readInput());
    }
    fx(dt);
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
  const noWheel = (e: Event): void => {
    if (open) e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', kd, true);
  window.addEventListener('keyup', ku, true);
  window.addEventListener('wheel', noWheel, true);
  window.addEventListener('blur', () => keys.clear());
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).dataset?.a;
    if (a === 'again') restart();
    if (a === 'exit') controller.close();
  });
  const poll = window.setInterval(() => (btn.hidden = open || game().rig.inIntro), 400);

  const controller: FightController = {
    async open() {
      if (open || game().rig.inIntro) return;
      const g = game();
      const an = deps.panel.state()?.analysis;
      if (!an) return;
      const text = await (await fetch(`${import.meta.env.BASE_URL}assets/creatures/veg.json`)).text();
      enemy = buildEnemy(g.stage.scene, g.assets, deps.pieces, text);
      const front = g.construction.front.clone();
      const up = g.construction.up.clone();
      const facing = an.profile2D.facing;
      const rivalSnap = resolveSnapshot({ construction: enemy.construction, pieces: deps.pieces, orientation: 'construction' });
      const rivalAn = interpret(rivalSnap, { facing: (-facing) as 1 | -1 });
      tintBroccoli(enemy, rivalAn);
      z0 = g.pivot.position.z;
      rigs = [makeRig(g.construction, g.pivot, an, front, up), makeRig(enemy.construction, enemy.pivot, rivalAn, enemy.construction.front, enemy.construction.up)];
      open = true;
      btn.hidden = true;
      root.hidden = false;
      for (const sel of ['.cs-panel', '#cs-prober-btn', '#cs-prober', '#help']) document.querySelectorAll<HTMLElement>(sel).forEach((el) => { if (el.style.display !== 'none') { hidden.push(el); el.dataset.cfDisplay = el.style.display; el.style.display = 'none'; } });
      saved = { pos: g.stage.camera.position.clone(), quat: g.stage.camera.quaternion.clone(), focal: g.stage.camera.getFocalLength(), enabled: g.interaction.enabled };
      camBase = { pos: saved.pos.clone(), quat: saved.quat.clone() };
      g.interaction.enabled = false;
      startTween(fightCam());
      help.textContent = `← → moverse · Z atacar · X guardia · R revancha · Esc salir\nTus golpes: ${actionsHelp(an)}`;
      restart();
      last = 0;
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    close() {
      if (!open) return;
      open = false;
      keys.clear();
      root.hidden = true;
      ko.style.display = 'none';
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      const g = game();
      if (rigs) rigs.forEach(resetRig);
      enemy?.dispose();
      enemy = null;
      rigs = null;
      state = null;
      for (const s of sparks) s.m.removeFromParent();
      sparks.length = 0;
      for (const p of pops) p.el.remove();
      pops.length = 0;
      for (const el of hidden) el.style.display = el.dataset.cfDisplay ?? '';
      hidden.length = 0;
      if (saved) {
        g.stage.camera.position.copy(saved.pos);
        g.stage.camera.quaternion.copy(saved.quat);
        g.stage.camera.setFocalLength(saved.focal);
        g.stage.camera.updateMatrixWorld();
        g.interaction.enabled = saved.enabled;
      }
      tween = null;
      shake = 0;
      btn.hidden = false;
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
      fx(frames / 60);
    },
    restart,
    rigs: () => rigs,
    destroy() {
      controller.close();
      window.clearInterval(poll);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
      window.removeEventListener('wheel', noWheel, true);
      root.remove();
      btn.remove();
      st.remove();
    },
  };
  btn.addEventListener('click', () => void controller.open());
  return controller;
}
