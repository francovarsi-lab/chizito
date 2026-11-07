import * as THREE from 'three';
import type { AudioManager } from '../../audio/AudioManager';
import { Crumbs } from '../../fx/Crumbs';
import type { Construction } from '../../model/Construction';
import type { PieceRegistry } from '../../pieces/PieceRegistry';
import type { CameraRig } from '../../render/CameraRig';
import type { Stage } from '../../render/Stage';
import { resolveSnapshot } from '../resolve';
import { aiInput, newAi, type AiMem } from './ai';
import { createMatch, stepMatch, type FightEvent, type FightInput, type Match } from './engine';
import { broccoliFighter, fighterFromSnapshot, type FighterModel } from './fighter';
import { FightHud, type MenuAction } from './hud';
import { blendPose, broccoliView, creatureView, type FighterView, type RenderPose } from './render';
import { enterFightSet, GROUND, type FightSet } from './stage';
import { AI_LEVELS, FIGHT } from './tuning';

/** Lo que el juego deja en `window.__chizito`: la MISMA escena, cámara y criatura del constructor. */
export interface Game {
  stage: Stage;
  pivot: THREE.Group;
  rig: CameraRig;
  construction: Construction;
  interaction: { enabled: boolean };
  audio: AudioManager;
  /** Sombras suaves del constructor (la de los recipientes y la del chizito): en la pelea se esconden. */
  bowlShadow?: { decal: THREE.Object3D };
  contactShadow?: { decal: THREE.Object3D };
}

export interface FightController {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  match(): Match | null;
  model(): FighterModel | null;
  /** Para pruebas: avanza `frames` pasos (el rival juega con su IA). No dibuja: el juego renderiza. */
  advance(frames: number, input?: FightInput | ((frame: number) => FightInput)): void;
  restart(level?: number): void;
  paused(): boolean;
  destroy(): void;
}

declare global {
  interface Window {
    __fight?: FightController;
  }
}

const btnCss = `
#cf-btn{position:fixed;right:22px;bottom:22px;z-index:41;display:flex;align-items:center;gap:10px;border:0;border-radius:18px;padding:13px 24px 12px 18px;cursor:pointer;
  font:400 19px/1 "Bungee",Impact,sans-serif;letter-spacing:.04em;color:#0d1024;background:linear-gradient(#fff7a8,#ffd23f 50%,#ff9f1c);
  box-shadow:0 0 0 3px #fff,0 0 0 6px #0d1024,0 6px 0 6px #0d1024,0 18px 36px rgba(13,16,36,.35);transition:transform .12s,filter .15s;animation:cfb 2.4s ease-in-out infinite}
#cf-btn:hover{transform:translateY(-3px) scale(1.03);filter:brightness(1.08)}
#cf-btn:active{transform:translateY(2px)}
#cf-btn svg{width:26px;height:26px}
#cf-btn[hidden]{display:none}
@keyframes cfb{0%,100%{box-shadow:0 0 0 3px #fff,0 0 0 6px #0d1024,0 6px 0 6px #0d1024,0 18px 36px rgba(13,16,36,.35)}50%{box-shadow:0 0 0 3px #fff,0 0 0 6px #0d1024,0 6px 0 6px #0d1024,0 18px 44px rgba(255,159,28,.6)}}
`;
const SWORDS = `<svg viewBox="0 0 24 24" fill="none" stroke="#0d1024" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4M7 17l-3 3M3 19l2 2"/></svg>`;

const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyZ', 'KeyJ', 'KeyX', 'KeyK', 'KeyC', 'KeyL', 'KeyR', 'Escape', 'Enter', 'Space']);

const poseOf = (f: Match['f'][number]): RenderPose => ({ x: f.x, y: f.y, tilt: f.tilt, facing: f.facing, qs: f.limbs.map((s) => [...s.q] as RenderPose['qs'][number]), broken: [...f.broken] });

/**
 * La pelea en LA MISMA mesa donde se arma la criatura: la cámara pasa a una vista lateral que sigue y encuadra a los dos, y tu
 * criatura (con todas sus piezas reales) pelea contra el brócoli. Botón "⚔ PELEAR" abajo a la derecha.
 */
export function mountFight(deps: { pieces: PieceRegistry; game: () => Game; host?: HTMLElement }): FightController {
  const host = deps.host ?? document.body;
  const st = document.createElement('style');
  st.textContent = btnCss;
  document.head.appendChild(st);
  const btn = document.createElement('button');
  btn.id = 'cf-btn';
  btn.innerHTML = `${SWORDS}PELEAR`;
  btn.title = 'Pelear con tu criatura contra el brócoli';
  host.append(btn);
  const hud = new FightHud(host);

  const game = deps.game;
  let open = false;
  let paused = false;
  let m: Match | null = null;
  let model: FighterModel | null = null;
  let views: [FighterView, FighterView] | null = null;
  let prev: [RenderPose, RenderPose] | null = null;
  let cur: [RenderPose, RenderPose] | null = null;
  let acc = 0;
  let level = 1;
  let ai: AiMem = newAi(1, 1);
  let seed = 1;
  let z0 = 0;
  const keys = new Set<string>();
  const edges = new Set<string>();
  const hidden: HTMLElement[] = [];
  let saved: { pos: THREE.Vector3; quat: THREE.Quaternion; focal: number; enabled: boolean } | null = null;
  let shake = 0;
  let fightT = 0;
  let level2 = 0;
  let perfN = 0;
  let perfAcc = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camInit = false;
  let crumbs: [Crumbs, Crumbs] | null = null;
  /** Migas de los escudos (papita, nacho). */
  let chips: Crumbs | null = null;
  const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number }[] = [];
  const rings: { m: THREE.Mesh; life: number; max: number; size: number }[] = [];
  const stars: THREE.Mesh[] = [];
  const sparkGeo = new THREE.SphereGeometry(0.0009, 6, 5);
  const sparkMat = [new THREE.MeshBasicMaterial({ color: 0xfff1a0 }), new THREE.MeshBasicMaterial({ color: 0xffffff }), new THREE.MeshBasicMaterial({ color: 0xffa21f })];
  const ringGeo = new THREE.RingGeometry(0.84, 1, 40);
  const starGeo = new THREE.OctahedronGeometry(0.0022, 0);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });

  // ── Entrada ──
  const held = (...c: string[]): boolean => c.some((k) => keys.has(k));
  const took = (...c: string[]): boolean => c.some((k) => edges.has(k));
  const readInput = (): FightInput => {
    const x = ((held('ArrowRight', 'KeyD') ? 1 : 0) - (held('ArrowLeft', 'KeyA') ? 1 : 0)) as -1 | 0 | 1;
    // Botones separados, sin combinar con flechas: Z piña · X patada · C guardia (o J · K · L).
    const inp: FightInput = { x, up: took('ArrowUp', 'KeyW', 'Space'), down: held('ArrowDown', 'KeyS'), punch: took('KeyZ', 'KeyJ'), kick: took('KeyX', 'KeyK'), guard: held('KeyC', 'KeyL') };
    edges.clear();
    return inp;
  };

  // ── Efectos ──
  /** Punto del plano de la pelea (y del motor) en el mundo: el piso es la tabla. */
  const P3 = (x: number, y: number, dz = 0.008): THREE.Vector3 => new THREE.Vector3(x, y + GROUND, z0 + dz);
  const project = (x: number, y: number): [number, number] | null => {
    const v = P3(x, y).project(game().stage.camera);
    if (v.z > 1) return null;
    return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
  };
  const burst = (at: THREE.Vector3, n: number, power: number): void => {
    const scene = game().stage.scene;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(sparkGeo, sparkMat[i % 3]);
      s.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const sp = (0.15 + Math.random() * 0.35) * power;
      scene.add(s);
      const max = 0.18 + Math.random() * 0.22;
      sparks.push({ m: s, v: new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp + 0.05, (Math.random() - 0.5) * 0.12), life: max, max });
    }
  };
  const ring = (at: THREE.Vector3, size: number, color: number): void => {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const r = new THREE.Mesh(ringGeo, mat);
    r.position.copy(at);
    r.quaternion.copy(game().stage.camera.quaternion);
    r.scale.setScalar(size * 0.3);
    game().stage.scene.add(r);
    rings.push({ m: r, life: 0, max: 0.22, size });
  };
  const fx = (dt: number): void => {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      s.v.y -= 0.8 * dt;
      s.v.multiplyScalar(1 - 3 * dt);
      s.m.position.addScaledVector(s.v, dt);
      s.m.scale.setScalar(Math.max(0.05, s.life / s.max));
      if (s.life <= 0) {
        s.m.removeFromParent();
        sparks.splice(i, 1);
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life += dt;
      const k = r.life / r.max;
      r.m.scale.setScalar(r.size * (0.3 + 0.9 * Math.sqrt(k)));
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (k >= 1) {
        r.m.removeFromParent();
        (r.m.material as THREE.Material).dispose();
        rings.splice(i, 1);
      }
    }
    crumbs?.forEach((c) => c.update(dt));
    chips?.update(dt);
    // Estrellitas del mareo.
    if (m && views) {
      let n = 0;
      m.f.forEach((f, i) => {
        if (f.dizzyT <= 0) return;
        const h = views![i].head();
        for (let k = 0; k < 3; k++, n++) {
          if (!stars[n]) {
            stars[n] = new THREE.Mesh(starGeo, starMat);
            game().stage.scene.add(stars[n]);
          }
          const a = performance.now() / 260 + (k * Math.PI * 2) / 3;
          stars[n].visible = true;
          stars[n].position.set(h.x + Math.cos(a) * 0.009, h.y + 0.002 + Math.sin(a * 2) * 0.0015, h.z + Math.sin(a) * 0.009);
          stars[n].rotation.y += dt * 6;
        }
      });
      for (; n < stars.length; n++) stars[n].visible = false;
    }
  };

  const onEvent = (e: FightEvent): void => {
    const g = game();
    if (!m || !views) return;
    switch (e.type) {
      case 'round': {
        const final = m.wins[0] === FIGHT.roundsToWin - 1 && m.wins[1] === FIGHT.roundsToWin - 1;
        hud.announce(final ? 'ROUND FINAL' : `ROUND ${e.round}`, '', false, 1.5);
        views.forEach((v) => v.reattach());
        camInit = false;
        break;
      }
      case 'fight':
        hud.announce('¡A PELEAR!', '', false, 0.9);
        g.audio.play('crack', 1);
        break;
      case 'hit': {
        const victim = (1 - e.by) as 0 | 1;
        const at = P3(e.at[0], e.at[1]);
        const big = e.damage >= 12 || e.heavy;
        burst(at, e.blocked ? 6 : big ? 22 : 12, big ? 1.5 : 1);
        ring(at, big ? 0.016 : 0.01, e.blocked ? 0x9fe0ff : e.kind === 'cut' ? 0xff5a7a : 0xffe066);
        if (e.shield && !e.blocked) {
          // Cada golpe en el escudo lo astilla: se achica y suelta migas de papita/nacho.
          const f = m.f[victim];
          const total = f.model.shields[e.piece] || 1;
          const c = views[victim].chip(e.piece, Math.max(0, f.shields[e.piece] ?? 0) / total);
          if (c) chips?.emit(c, new THREE.Vector3(m.f[e.by].facing, 0.7, 0.3).normalize(), 7);
        } else if (!e.blocked) crumbs?.[victim].emit(at, new THREE.Vector3(m.f[e.by].facing, 0.6, 0.3).normalize(), big ? 6 : 3);
        views[victim].bump(Math.min(1, e.damage / 18) * (e.blocked ? 0.4 : 1));
        shake = Math.max(shake, e.blocked ? 0.0008 : 0.0012 + e.damage * 0.00022);
        const label = e.blocked ? 'BLOQUEO' : e.shield ? 'ESCUDO' : e.kind === 'heavy' ? '¡PESADO!' : e.kind === 'cut' ? 'CORTE' : '';
        hud.popup(e.at[0], e.at[1] + 0.008, `−${Math.max(1, Math.round(e.damage))}`, label, e.blocked ? 'block' : e.kind === 'heavy' ? 'heavy' : e.kind === 'cut' ? 'cut' : '');
        if (!e.blocked) hud.combo(e.by, e.combo);
        if (big && !e.blocked) hud.flash(0.28);
        g.audio.play(e.blocked ? 'drop' : e.heavy ? 'crunch' : 'crack', Math.min(1, 0.55 + e.damage / 20));
        if (e.heavy && !e.blocked) g.audio.play('crack', 1);
        break;
      }
      case 'shieldBreak': {
        // El escudo no cae entero: se deshace en migas.
        const c = views[e.who].shatter(e.piece);
        if (c) chips?.emit(c, new THREE.Vector3(e.vel[0], 0.8, 0.3).normalize(), 22);
        hud.popup(e.at[0], e.at[1] + 0.018, '¡ESCUDO ROTO!', '', 'heavy');
        g.audio.play('crunch', 1);
        g.audio.play('crack', 0.8);
        break;
      }
      case 'whiff':
        if (e.heavy) {
          const f = m.f[e.who];
          hud.popup(f.x, f.y + 0.045, '¡ERRÓ!', 'el peso sigue de largo', 'block');
        }
        break;
      case 'stumble': {
        const f = m.f[e.who];
        hud.popup(f.x, f.y + 0.05, '¡TRASTABILLA!', '', 'heavy');
        g.audio.play('drop', 0.8);
        break;
      }
      case 'swing':
        if (e.heavy) g.audio.play('out', 0.5);
        break;
      case 'land':
        g.audio.play('drop', 0.35);
        break;
      case 'dizzy': {
        const f = m.f[e.who];
        hud.popup(f.x, f.y + 0.05, '¡MAREADO!', '', 'heavy');
        break;
      }
      case 'ko':
        hud.announce('K.O.', '', true, 2.2);
        hud.flash(0.7);
        shake = 0.006;
        g.audio.play('crunch', 1);
        g.audio.play('crack', 1);
        break;
      case 'roundEnd': {
        const who = e.winner === 'draw' ? '' : e.winner === 0 ? 'GANA TU CRIATURA' : 'GANA EL BRÓCOLI';
        if (e.reason === 'time') hud.announce('¡TIEMPO!', e.winner === 'draw' ? 'EMPATE: RONDA EXTRA' : who, false, 2);
        else hud.announce(e.winner === 'draw' ? '¡DOBLE K.O.!' : e.winner === 0 ? '¡BIEN!' : 'AY…', who, e.winner === 1, 2);
        break;
      }
      case 'matchEnd': {
        const win = e.winner === 0;
        hud.announce(win ? '¡GANASTE!' : 'PERDISTE', '', !win, 99);
        const buttons: { a: MenuAction; label: string; alt?: boolean }[] = [];
        if (win && level < AI_LEVELS.length) buttons.push({ a: 'next', label: `Nivel ${level + 1} ▶` });
        buttons.push({ a: 'again', label: 'Revancha', alt: win && level < AI_LEVELS.length }, { a: 'exit', label: 'Volver a armar', alt: true });
        window.setTimeout(() => {
          if (open && m?.phase === 'over') hud.showMenu(win ? '¡GANASTE!' : 'PERDISTE', win ? `Le ganaste al brócoli nivel ${level}.` : 'Probá cambiar brazos, piernas o el peso de tu criatura.', buttons);
        }, 1400);
        break;
      }
      default:
        break;
    }
  };

  // ── Cámara de pelea: lateral, sigue el medio de los dos y se aleja o acerca para que entren con aire ──
  const camera = (dt: number): void => {
    if (!m) return;
    const cam = game().stage.camera;
    cam.setFocalLength(42);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const tanH = tanV * cam.aspect;
    const [a, b] = m.f;
    let mid = (a.x + b.x) / 2;
    const span = Math.abs(a.x - b.x) + 0.12;
    // Alto a encuadrar: del piso a la cabeza del más alto (salto incluido), dejando libre la franja del HUD de arriba.
    const top = Math.max(...m.f.map((f) => f.y + Math.max(...f.model.body.map((sh) => Math.max(sh.a[1], sh.b[1]) + sh.r)))) + 0.012;
    const floor = -0.008;
    let D = Math.max(span / (2 * tanH), (top - floor) / (2 * tanV * 0.7), 0.2);
    let lookY = (top + floor) / 2;
    if (m.phase === 'intro') D *= 1 + 0.35 * Math.max(0, 1 - m.phaseT / FIGHT.introFrames);
    if (m.phase === 'ko' || (m.phase === 'end' && m.f.some((f) => f.ko))) {
      const loser = m.f.find((f) => f.ko) ?? a;
      mid = mid * 0.4 + loser.x * 0.6;
      D *= 0.82;
      lookY -= 0.006;
    }
    D = Math.min(D, 0.5);
    const elev = THREE.MathUtils.degToRad(11);
    const tp = new THREE.Vector3(mid, GROUND + lookY + D * Math.sin(elev), z0 + D * Math.cos(elev));
    const tl = new THREE.Vector3(mid, GROUND + lookY, z0);
    if (!camInit) {
      camPos.copy(tp);
      camLook.copy(tl);
      camInit = true;
    }
    const k = 1 - Math.exp(-dt * (m.phase === 'ko' ? 2.2 : 4.5));
    camPos.lerp(tp, k);
    camLook.lerp(tl, k);
    shake *= Math.pow(0.002, dt);
    const j = new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
    cam.position.copy(camPos).add(j);
    cam.lookAt(camLook.clone().add(j.multiplyScalar(0.5)));
    cam.updateMatrixWorld();
    game().stage.focusTarget.copy(camLook);
  };

  // Viaje de cámara de entrada/salida.
  let tween: { t: number; from: { pos: THREE.Vector3; quat: THREE.Quaternion }; done?: () => void } | null = null;

  const step = (input: FightInput): void => {
    if (!m) return;
    if (cur) prev = cur;
    stepMatch(m, [input, aiInput(m, ai, 1)]);
    for (const e of m.events) onEvent(e);
    cur = [poseOf(m.f[0]), poseOf(m.f[1])];
    if (!prev) prev = cur;
  };

  const update = (dt: number): void => {
    if (!m || !views) return;
    const raw = dt;
    if (!paused) {
      const scale = m.phase === 'ko' ? 0.3 : 1;
      acc += dt * scale;
      let n = 0;
      while (acc >= FIGHT.dt && n < 6) {
        acc -= FIGHT.dt;
        n++;
        step(readInput());
      }
      if (m.phase === 'fight') {
        fightT += dt;
        if (fightT > 7) hud.hideKeys();
      }
    }
    const t = m.hitstop > 0 ? 1 : Math.min(1, acc / FIGHT.dt);
    if (prev && cur) views.forEach((v, i) => {
      const p = blendPose(prev![i], cur![i], t);
      v.apply({ ...p, y: p.y + GROUND }, z0, raw);
    });
    set?.update(raw);
    if (tween) {
      tween.t = Math.min(1, tween.t + raw / 1.0);
      const e = tween.t * tween.t * (3 - 2 * tween.t);
      camera(raw);
      const cam = game().stage.camera;
      const toPos = cam.position.clone();
      const toQuat = cam.quaternion.clone();
      cam.position.lerpVectors(tween.from.pos, toPos, e);
      cam.quaternion.slerpQuaternions(tween.from.quat, toQuat, e);
      cam.updateMatrixWorld();
      if (tween.t >= 1) {
        const d = tween.done;
        tween = null;
        d?.();
      }
    } else camera(raw);
    fx(raw);
    hud.update(m, raw, project);
    perf(raw);
  };

  /** Si el cuadro tarda de más, baja la calidad de a poco (oclusión, desenfoque, resolución). */
  let set: FightSet | null = null;
  const perf = (dt: number): void => {
    if (!set || dt <= 0) return;
    perfN++;
    perfAcc += dt;
    if (perfN < 50) return;
    const avg = perfAcc / perfN;
    perfN = 0;
    perfAcc = 0;
    if (avg > 0.022 && level2 < 3) set.degrade(++level2);
  };

  const restart = (lv = level): void => {
    if (!model || !views) return;
    level = Math.max(1, Math.min(AI_LEVELS.length, lv));
    const bro = broccoliFighter(level);
    m = createMatch([model, bro]);
    ai = newAi(seed++, level);
    hud.show([model.name, bro.name], warnings(m.f[0]));
    paused = false;
    fightT = 0;
    acc = 0;
    prev = cur = null;
    views.forEach((v) => v.reattach());
    for (const e of m.events) onEvent(e);
    cur = [poseOf(m.f[0]), poseOf(m.f[1])];
    prev = cur;
    camInit = false;
  };

  const warnings = (f: Match['f'][number]): string[] => {
    const md = f.model;
    const w: string[] = [];
    const fixed = md.limbs.filter((l) => l.rigid).length;
    if (!md.limbs.length) w.push('Tu criatura no tiene palitos: clavale brazos y piernas para pelear');
    else {
      if (f.legs.length === 0) w.push('Sin piernas: se arrastra y no puede saltar (clavá palitos abajo, apuntando al piso)');
      else if (f.jump === 0) w.push('Pesa más de lo que aguantan sus piernas: camina lento y no puede saltar');
      if (f.legs.length === 1) w.push('Una sola pierna: avanza a saltitos');
      if (f.arms.length === 0) w.push('Sin brazos: no da piñas ni se puede cubrir');
      if (fixed) w.push(`${fixed === 1 ? 'Una pieza queda fija' : `${fixed} piezas quedan fijas`} (chupetín o atraviesa el chizito): pesa, pero no se mueve`);
    }
    return w;
  };

  const pause = (on: boolean): void => {
    if (!m || m.phase === 'over') return;
    paused = on;
    keys.clear();
    if (on) hud.showMenu('PAUSA', 'La pelea está congelada.', [
      { a: 'resume', label: 'Seguir' },
      { a: 'again', label: 'Revancha', alt: true },
      { a: 'exit', label: 'Volver a armar', alt: true },
    ], true);
    else hud.hideMenu();
  };

  hud.onMenu = (a) => {
    if (a === 'resume') pause(false);
    if (a === 'again') restart(level);
    if (a === 'next') restart(level + 1);
    if (a === 'exit') controller.close();
  };

  const onKey = (down: boolean) => (e: KeyboardEvent): void => {
    if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!KEYS.has(e.code)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!down) {
      keys.delete(e.code);
      return;
    }
    if (hud.menuOpen()) {
      if (e.code === 'Escape' && paused) pause(false);
      else if (!e.repeat) hud.menuKey(e.code);
      return;
    }
    if (e.code === 'Escape') return pause(true);
    if (e.code === 'KeyR' && m?.phase === 'over') return restart(level);
    if (!e.repeat) edges.add(e.code);
    keys.add(e.code);
  };
  const kd = onKey(true);
  const ku = onKey(false);
  const noWheel = (e: Event): void => {
    if (open) e.stopImmediatePropagation();
  };
  const blur = (): void => {
    keys.clear();
    if (open && m?.phase === 'fight' && !paused) pause(true);
  };
  window.addEventListener('keydown', kd, true);
  window.addEventListener('keyup', ku, true);
  window.addEventListener('wheel', noWheel, true);
  window.addEventListener('blur', blur);
  const poll = window.setInterval(() => (btn.hidden = open || game().rig.inIntro), 300);

  const controller: FightController = {
    async open() {
      const g = game();
      if (open || g.rig.inIntro) return;
      // Si había algo en la mano (ketchup, un palito), se suelta con Esc como en el juego.
      for (let k = 0; k < 2; k++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      const snap = resolveSnapshot({ construction: g.construction, pieces: deps.pieces, orientation: 'construction' });
      model = fighterFromSnapshot(snap, 'TU CRIATURA');
      z0 = g.pivot.position.z;
      saved = { pos: g.stage.camera.position.clone(), quat: g.stage.camera.quaternion.clone(), focal: g.stage.camera.getFocalLength(), enabled: g.interaction.enabled };
      g.interaction.enabled = false;
      views = [creatureView(g.construction, g.pivot, model, g.stage.renderer), broccoliView(g.stage.scene, broccoliFighter(level), level)];
      crumbs = [new Crumbs(g.stage.scene, '#f2c95a'), new Crumbs(g.stage.scene, '#5c9a35')];
      chips = new Crumbs(g.stage.scene, '#e0a640');
      for (const c of [...crumbs, chips]) c.floorY = GROUND;
      open = true;
      btn.hidden = true;
      for (const sel of ['.cs-panel', '#cs-prober-btn', '#cs-prober', '#help']) {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          if (el.style.display !== 'none') {
            hidden.push(el);
            el.dataset.cfDisplay = el.style.display;
            el.style.display = 'none';
          }
        });
      }
      set = enterFightSet(g.stage, z0, views.map((v) => v.root), [g.bowlShadow?.decal, g.contactShadow?.decal].filter((d): d is THREE.Object3D => !!d));
      level2 = 0;
      perfN = 0;
      perfAcc = 0;
      // El juego mueve el chizito en cada cuadro (sacudida, rotor): la pelea se actualiza y se posa justo antes de dibujar.
      const stage = g.stage;
      const render = stage.render.bind(stage);
      stage.render = (dt: number) => {
        if (open) update(dt);
        render(dt);
      };
      restart(level);
      tween = { t: 0, from: { pos: saved.pos.clone(), quat: saved.quat.clone() } };
    },
    close() {
      if (!open) return;
      open = false;
      paused = false;
      keys.clear();
      hud.hide();
      const g = game();
      delete (g.stage as { render?: unknown }).render;
      views?.forEach((v) => v.dispose());
      views = null;
      set?.restore();
      set = null;
      crumbs?.forEach((c) => c.clear());
      crumbs = null;
      chips?.clear();
      chips = null;
      for (const s of sparks) s.m.removeFromParent();
      sparks.length = 0;
      for (const r of rings) r.m.removeFromParent();
      rings.length = 0;
      for (const s of stars) s.removeFromParent();
      stars.length = 0;
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
      m = null;
      prev = cur = null;
      btn.hidden = false;
    },
    isOpen: () => open,
    match: () => m,
    model: () => model,
    paused: () => paused,
    advance(frames, input) {
      for (let f = 0; f < frames; f++) {
        if (!m) return;
        step(typeof input === 'function' ? input(f) : (input ?? readInput()));
      }
      prev = cur;
    },
    restart,
    destroy() {
      controller.close();
      window.clearInterval(poll);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
      window.removeEventListener('wheel', noWheel, true);
      window.removeEventListener('blur', blur);
      hud.destroy();
      btn.remove();
      st.remove();
    },
  };
  btn.addEventListener('click', () => void controller.open());
  return controller;
}
