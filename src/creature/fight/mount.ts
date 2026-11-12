import * as THREE from 'three';
import type { AudioManager, SoundId } from '../../audio/AudioManager';
import { Crumbs } from '../../fx/Crumbs';
import type { Construction } from '../../model/Construction';
import type { PieceRegistry } from '../../pieces/PieceRegistry';
import type { CameraRig } from '../../render/CameraRig';
import type { Stage } from '../../render/Stage';
import { BUILDER_FACE, DEFAULT_COMBAT_UP } from '../../model/Construction';
import { resolveSnapshot } from '../resolve';
import { createBrocoli, loadBroccoliParts } from './brocoli';
import { aiInput, newAi, type AiMem } from './ai';
import { createMatch, stepMatch, type FightEvent, type FightInput, type Match } from './engine';
import { broccoliFighter, fighterFromSnapshot, type FighterModel } from './fighter';
import { FightHud, type MenuAction } from './hud';
import { blendPose, broccoliView, creatureView, type FighterView, type RenderPose } from './render';
import { enterFightSet, GROUND, prewarmFight, type FightSet } from './stage';
import { AI_LEVELS, FIGHT } from './tuning';
import { qFromTo, type Q } from './quat';
import type { Quad } from '../zones';

/** Lo que el juego deja en `window.__chizito`: la MISMA escena, cámara y criatura del constructor. */
export interface Game {
  stage: Stage;
  pivot: THREE.Group;
  rig: CameraRig;
  construction: Construction;
  interaction: { enabled: boolean; hideFront(): void };
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
  /** Deja la pelea lista de antemano (lo hace solo en ratos libres; expuesto para medir). */
  warm(): Promise<void>;
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
#cf-btn[hidden]{display:none}#cf-black{position:fixed;inset:0;z-index:30;background:#000;opacity:0;pointer-events:none}#cf-nag{position:fixed;right:22px;bottom:92px;z-index:41;max-width:300px;padding:12px 16px;border-radius:16px;background:#fff8ee;color:#b3121f;font:800 17px/1.25 "Baloo 2",Nunito,sans-serif;box-shadow:0 10px 28px rgba(120,40,40,.28),inset 0 0 0 2px #e8352b;pointer-events:none;opacity:0;transform:translateY(10px) scale(.9);transform-origin:90% 100%;transition:opacity .25s,transform .35s cubic-bezier(.2,1.6,.4,1)}#cf-nag:after{content:'';position:absolute;right:46px;bottom:-9px;border:9px solid transparent;border-bottom:0;border-top-color:#fff8ee}#cf-nag.on{opacity:1;transform:none}
@keyframes cfb{0%,100%{box-shadow:0 0 0 3px #fff,0 0 0 6px #0d1024,0 6px 0 6px #0d1024,0 18px 36px rgba(13,16,36,.35)}50%{box-shadow:0 0 0 3px #fff,0 0 0 6px #0d1024,0 6px 0 6px #0d1024,0 18px 44px rgba(255,159,28,.6)}}
`;
const SWORDS = `<svg viewBox="0 0 24 24" fill="none" stroke="#0d1024" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4M7 17l-3 3M3 19l2 2"/></svg>`;

const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyJ', 'KeyX', 'KeyK', 'KeyC', 'KeyL', 'KeyR', 'Escape', 'Enter', 'Space']);

const poseOf = (f: Match['f'][number]): RenderPose => ({ x: f.x, y: f.y, tilt: f.tilt, facing: f.facing, yaw: f.yaw, qs: f.limbs.map((s) => [...s.q] as RenderPose['qs'][number]), broken: [...f.broken] });

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
  btn.title = 'Pelear con tu chizito contra EL BROCOLOCO';
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
  let whiffN = 0;
  let lastShout = -999;
  let lastHint = -999;
  let fightT = 0;
  let level2 = 0;
  let perfN = 0;
  let perfAcc = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camInit = false;
  // ── Presentación de los luchadores (con los MISMOS modelos del juego), antes del round 1. Se saltea con cualquier tecla. ──
  let present: { t: number; pending: FightEvent[]; fired: Set<string> } | null = null;
  const wantsPresent = (): boolean => {
    const q = new URLSearchParams(location.search);
    return !q.has('capture') || q.has('presentacion');
  };
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
    const x = ((held('ArrowRight') ? 1 : 0) - (held('ArrowLeft') ? 1 : 0)) as -1 | 0 | 1;
    // Un botón por cuadrante del chizito (como se armó, de frente): Q W brazos izq/der, A S piernas izq/der, D guardia. Las
    // flechas mueven. Z/X/C (o J/K/L) quedan como atajo: cualquier brazo, cualquier pierna, guardia.
    const quad: Quad | undefined = took('KeyQ') ? 'LA' : took('KeyW') ? 'RA' : took('KeyA') ? 'LL' : took('KeyS') ? 'RL' : undefined;
    if (quad) hud.padHit(quad);
    // Si la tecla no puede hacer nada, se dice por qué (si no, parece que el juego no respondió).
    const f = m?.f[0];
    if (f && m!.phase === 'fight' && (quad || took('KeyZ', 'KeyJ', 'KeyX', 'KeyK')) && m!.frame - lastHint > 50) {
      const role = quad ? (quad[1] === 'A' ? 'arm' : 'leg') : took('KeyX', 'KeyK') ? 'leg' : 'arm';
      const has = f.model.limbs.some((l) => l.role === role && (!quad || l.side === quad[0]));
      const why = !has
        ? `NO HAY ${role === 'arm' ? 'BRAZO' : 'PIERNA'}${!quad ? '' : role === 'arm' ? (quad[0] === 'L' ? ' IZQUIERDO' : ' DERECHO') : quad[0] === 'L' ? ' IZQUIERDA' : ' DERECHA'}`
        : f.wobbly || f.lock > 0
          ? 'SE ESTÁ ESTABILIZANDO…'
          : f.stun > 0
            ? 'ATONTADO…'
            : null;
      if (why) {
        lastHint = m!.frame;
        hud.popup(f.x, f.y + 0.07, why, '', 'hint');
      }
    }
    const inp: FightInput = { x, up: took('ArrowUp', 'Space'), down: held('ArrowDown'), punch: took('KeyZ', 'KeyJ'), kick: took('KeyX', 'KeyK'), guard: held('KeyD', 'KeyC', 'KeyL'), quad };
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
  // ── Estela de cada golpe: la punta de la extremidad deja un trazo mientras pega (y uno tenue mientras carga), así se lee
  // qué extremidad golpea, desde dónde y hacia dónde. Dorado el chizito, verde el brócoli. ──
  const TRAIL_N = 16;
  const trailMats = [0xffc94a, 0x8dff6a].map((c) => new THREE.MeshBasicMaterial({ color: c, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const trails = new Map<string, { pts: THREE.Vector3[]; mesh: THREE.Mesh; heat: number }>();
  const trackTrails = (): void => {
    if (!m) return;
    m.f.forEach((f, i) => f.model.limbs.forEach((l, k) => {
      const s = f.limbs[k];
      const key = `${i}:${k}`;
      let t = trails.get(key);
      const live = s.phase === 'strike' || s.phase === 'windup';
      if (!t) {
        if (!live) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3));
        const idx: number[] = [];
        for (let n = 0; n < TRAIL_N - 1; n++) idx.push(2 * n, 2 * n + 1, 2 * n + 2, 2 * n + 1, 2 * n + 3, 2 * n + 2);
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, trailMats[i]);
        mesh.frustumCulled = false;
        mesh.renderOrder = 5;
        game().stage.scene.add(mesh);
        t = { pts: [], mesh, heat: 0 };
        trails.set(key, t);
      }
      const j = l.points.length - 1;
      const tip = P3(f.cur[k][2 * j], f.cur[k][2 * j + 1], 0.012);
      t.heat = s.phase === 'strike' ? 1 : s.phase === 'windup' ? 0.35 : t.heat;
      if (live) t.pts.unshift(tip);
      else if (t.pts.length) t.pts.pop();
      if (t.pts.length > TRAIL_N) t.pts.length = TRAIL_N;
    }));
  };
  const drawTrails = (): void => {
    for (const [key, t] of trails) {
      const pos = t.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = t.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      const n = t.pts.length;
      t.mesh.visible = n > 1;
      if (n < 2) {
        if (!n) {
          t.mesh.removeFromParent();
          t.mesh.geometry.dispose();
          trails.delete(key);
        }
        continue;
      }
      for (let q = 0; q < TRAIL_N; q++) {
        const j = Math.min(q, n - 1);
        const a = t.pts[j];
        const [p0, p1] = j + 1 < n ? [a, t.pts[j + 1]] : [t.pts[j - 1], a];
        const dx = p0.x - p1.x;
        const dy = p0.y - p1.y;
        const l = Math.hypot(dx, dy) || 1;
        const k = q < n ? 1 - q / (n - 1) : 0;
        const w = 0.0035 * k * (0.4 + 0.6 * t.heat);
        pos.setXYZ(2 * q, a.x - (dy / l) * w, a.y + (dx / l) * w, a.z);
        pos.setXYZ(2 * q + 1, a.x + (dy / l) * w, a.y - (dx / l) * w, a.z);
        const c = k * k * t.heat;
        col.setXYZ(2 * q, c, c, c);
        col.setXYZ(2 * q + 1, c, c, c);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
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
        g.audio.play('round', 1);
        views.forEach((v) => v.reattach());
        camInit = false;
        break;
      }
      case 'fight':
        hud.announce('¡A PELEAR!', '', false, 0.9);
        g.audio.play('pelea', 1);
        break;
      case 'hit': {
        const victim = (1 - e.by) as 0 | 1;
        const at = P3(e.at[0], e.at[1]);
        const big = e.damage >= 12 || e.heavy;
        burst(at, e.blocked ? 6 : big ? 22 : 12, big ? 1.5 : 1);
        ring(at, big ? 0.016 : 0.01, e.blocked ? 0x9fe0ff : e.kind === 'cut' ? 0xff5a7a : 0xffe066);
        if (e.shieldPiece && !e.blocked) {
          // Cada golpe en el escudo lo astilla: se achica y suelta migas de papita/nacho.
          const f = m.f[victim];
          const total = f.model.shields[e.shieldPiece] || 1;
          const c = views[victim].chip(e.shieldPiece, Math.max(0, f.shields[e.shieldPiece] ?? 0) / total);
          if (c) chips?.emit(c, new THREE.Vector3(m.f[e.by].facing, 0.7, 0.3).normalize(), 7);
        } else if (!e.blocked) crumbs?.[victim].emit(at, new THREE.Vector3(m.f[e.by].facing, 0.6, 0.3).normalize(), big ? 6 : 3);
        views[victim].bump(Math.min(1, e.damage / 18) * (e.blocked ? 0.4 : 1));
        // Destello blanco y vibración del que lo recibe (el congelamiento lo pone el motor: `hitstop`).
        views[victim].hurt(e.blocked ? 0.35 : big ? 1 : 0.75, e.blocked ? 0.0008 : 0.0016 + e.damage * 0.00012);
        shake = Math.max(shake, e.blocked ? 0.0008 : 0.0012 + e.damage * 0.00022);
        const label = e.blocked ? 'BLOQUEO' : e.shield ? 'ESCUDO' : e.kind === 'heavy' ? '¡PESADO!' : e.kind === 'cut' ? 'CORTE' : '';
        hud.popup(e.at[0], e.at[1] + 0.008, `−${Math.max(1, Math.round(e.damage))}`, label, e.blocked ? 'block' : e.kind === 'heavy' ? 'heavy' : e.kind === 'cut' ? 'cut' : '');
        if (!e.blocked) hud.combo(e.by, e.combo, e.chain);
        // Palabras de historieta, no en todos los golpes (si no, no se lee ninguna): ¡JAPISH! en los que valen la pena
        // (pesados, fuertes o el cierre de una combinación), ¡PIMBA! en las patadas que entran y ¡SOPLAMOCO! en las piñas a la cara.
        if (!e.blocked && m.frame - lastShout > 75) {
          const vic = m.f[victim];
          const ys = vic.model.body.flatMap((b) => [b.a[1] - b.r, b.b[1] + b.r]);
          const lo = Math.min(...ys);
          const hi = Math.max(...ys);
          const face = e.at[1] - vic.y > lo + (hi - lo) * 0.62;
          const kick = m.f[e.by].model.limbs.find((l) => l.pieceIds.includes(e.piece))?.role === 'leg';
          const word = big || e.chain ? 'japish' : kick ? 'pimba' : face ? 'soplamoco' : null;
          if (word) {
            lastShout = m.frame;
            hud.popup(e.at[0], e.at[1] + 0.03, word === 'japish' ? '¡JAPISH!' : word === 'pimba' ? '¡PIMBA!' : '¡SOPLAMOCO!', '', `shout ${word}`);
            g.audio.play(word, 1);
          }
        }
        if (e.chain) g.audio.play('combo', 1);
        if (big && !e.blocked) hud.flash(0.28);
        g.audio.play(e.blocked ? 'bloqueo' : big ? 'golpe-pesado' : 'golpe', Math.min(1, 0.55 + e.damage / 20));
        if (!e.blocked) g.audio.play('crunch', 0.8);
        break;
      }
      case 'shieldBreak': {
        // El escudo no cae entero: se deshace en migas.
        const c = views[e.who].shatter(e.piece);
        if (c) chips?.emit(c, new THREE.Vector3(e.vel[0], 0.8, 0.3).normalize(), 22);
        hud.popup(e.at[0], e.at[1] + 0.018, '¡ESCUDO ROTO!', '', 'shout');
        g.audio.play('escudo', 1);
        break;
      }
      case 'whiff': {
        // Cada golpe que no toca nada: ¡PIFIÓ! y ¡PIF!, intercalados (sin más texto: el cuerpo que se desarma ya lo explica).
        const f = m.f[e.who];
        hud.popup(f.x, f.y + 0.045, whiffN++ % 2 ? '¡PIF!' : '¡PIFIÓ!', '', 'whiff');
        g.audio.play('pifio', e.heavy ? 1 : 0.5);
        break;
      }
      case 'stumble':
        g.audio.play('drop', 0.8);
        break;
      case 'swing':
        if (e.heavy) g.audio.play('zumbido', 0.8);
        break;
      case 'land':
        g.audio.play('drop', 0.35);
        break;
      case 'dizzy': {
        const f = m.f[e.who];
        hud.popup(f.x, f.y + 0.05, '¡MAREADO!', '', 'whiff');
        break;
      }
      case 'ko':
        hud.announce('K.O.', '', true, 2.2);
        hud.flash(0.7);
        shake = 0.006;
        views[e.who].hurt(1, 0.003);
        g.audio.play('ko', 1);
        break;
      case 'roundEnd': {
        const who = e.winner === 'draw' ? '' : e.winner === 0 ? 'GANA TU CHIZITO' : 'GANA EL BROCOLOCO';
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
          if (open && m?.phase === 'over') hud.showMenu(win ? '¡GANASTE!' : 'PERDISTE', win ? `Le ganaste a EL BROCOLOCO nivel ${level}.` : 'Probá cambiar brazos, piernas o el peso de tu chizito.', buttons);
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
    if (present) return presentCamera(dt);
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
    trackTrails();
    cur = [poseOf(m.f[0]), poseOf(m.f[1])];
    if (!prev) prev = cur;
  };

  // ── Presentación, como la de una pelea de verdad (con los MISMOS modelos del juego; cualquier tecla la saltea) ──
  // Antes: el APAGÓN del constructor (las luces titilan y se cortan; ver `blackout`). Después, en la oscuridad:
  // 0–7,2 s EL BROCOLOCO, de terror: se prende una vela y lo primero que se ve es su BOCA sonriendo, muy cerca, con paneos
  //   lentos; habla (subtítulos); la cámara sube despacio hasta los ojos; y de golpe se encienden los focos, ruge y aparece su
  //   nombre.
  // 7,2–10,6 s TU CHIZITO responde: se despierta en contrapicado, le pega a la lente y queda en pose de héroe.
  // 10,6–11,6 s: los dos frente a frente, VS. Después, ROUND 1.
  const B_LIGHTS = 5.6;
  const P_CHIZ0 = 7.2;
  const P_VS = 10.6;
  const P_END = 11.6;
  /** Lo que dice EL BROCOLOCO (con su sonido de voz, para grabar). */
  const LINES: { at: number; until: number; text: string; sound: SoundId }[] = [
    { at: 1.1, until: 3.2, text: 'Mmm… huelo a chizito.', sound: 'brocoloco-frase1' },
    { at: 3.5, until: 5.5, text: 'Te voy a dejar hecho polvito… de queso.', sound: 'brocoloco-frase2' },
    { at: 5.75, until: 7.0, text: '¡A LA MESA, BOCADITO!', sound: 'brocoloco-frase3' },
  ];
  let presShake = 0;
  let candleProp: THREE.Group | null = null;
  const once = (key: string, at: number, fn: () => void): void => {
    if (!present || present.t < at || present.fired.has(key)) return;
    present.fired.add(key);
    fn();
  };
  const smooth = (x: number): number => {
    const k = Math.max(0, Math.min(1, x));
    return k * k * (3 - 2 * k);
  };
  const PUNCHES = [1.35, 1.75, 2.15];
  /** Vela de cumpleaños sobre la tabla, delante del brócoli: la única luz al principio. */
  const makeCandle = (): THREE.Group => {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.024, 12), new THREE.MeshStandardMaterial({ color: '#f7b6c8', roughness: 0.5 }));
    stick.position.y = 0.012;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.45), toneMapped: false }));
    flame.name = 'llama';
    flame.position.y = 0.0275;
    flame.scale.set(0.0013, 0.0032, 0.0013);
    g.add(stick, flame);
    return g;
  };
  /** Punto del cuerpo principal (el chizito, o el tallo del brócoli: ahí está la cara), de abajo (0) a arriba (1). */
  const along = (i: 0 | 1, k: number): THREE.Vector3 => {
    const f = m!.f[i];
    const b = f.model.body[0];
    const lo = Math.min(b.a[1], b.b[1]) - b.r;
    const hi = Math.max(b.a[1], b.b[1]) + b.r;
    return new THREE.Vector3(f.x, f.y + GROUND + lo + (hi - lo) * k, z0);
  };
  const front = (i: 0 | 1): THREE.Vector3 => new THREE.Vector3(m!.f[i].facing * Math.cos(m!.f[i].yaw), 0, Math.sin(m!.f[i].yaw));
  const presentStep = (dt: number): void => {
    if (!present || !m || !views) return;
    present.t += dt;
    const t = present.t;
    const g = game();
    const f0 = m.f[0];
    presShake *= Math.exp(-dt * 9);
    // ── Luz: del negro total a la vela; a los 5,6 s se encienden los focos de golpe. ──
    black.style.opacity = String(1 - smooth((t - 0.35) / 0.7));
    if (!candleProp) {
      candleProp = makeCandle();
      const n = front(1);
      candleProp.position.set(m.f[1].x, GROUND, z0).addScaledVector(n, 0.034);
      g.stage.scene.add(candleProp);
    }
    const lit = t >= B_LIGHTS;
    const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3 + 1);
    const candleK = t < 0.4 ? 0 : t < B_LIGHTS ? 0.05 * smooth((t - 0.4) / 0.5) * flick : 0.05 * Math.max(0, 1 - (t - B_LIGHTS) * 2) * flick;
    const flame = candleProp.getObjectByName('llama')!;
    flame.visible = t > 0.4 && t < B_LIGHTS + 0.6;
    flame.scale.set(0.0013, 0.0032 * flick, 0.0013);
    set?.candle(flame.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.004, 0)), candleK);
    set?.lights(lit ? Math.min(1, (t - B_LIGHTS) * 6) : 0);
    // ── Carteles y subtítulos ──
    if (t < P_CHIZ0) {
      if (t > B_LIGHTS + 0.1) hud.present(1, 'EL BROCOLOCO', `NIVEL ${level} · el vegetal más malo de la mesa`);
      else hud.present(1);
    } else if (t < P_VS) {
      if (t <= P_CHIZ0 + 0.35) hud.present(0);
      else {
        const parts = [`${f0.arms.length} brazo${f0.arms.length === 1 ? '' : 's'}`, `${f0.legs.length} pierna${f0.legs.length === 1 ? '' : 's'}`, `${(f0.model.mass * 1000).toFixed(1).replace('.', ',')} g`];
        hud.present(0, 'TU CHIZITO', parts.join(' · '));
      }
    } else hud.present(2, 'VS', 'TU CHIZITO · EL BROCOLOCO');
    const line = LINES.find((l) => t >= l.at && t < l.until);
    hud.sub(line ? 'EL BROCOLOCO' : null, line?.text ?? '');
    LINES.forEach((l, i) => once(`frase${i}`, l.at, () => g.audio.play(l.sound, 1)));
    // ── Sonidos y golpes de la parte del brócoli ──
    once('vela', 0.4, () => g.audio.play('vela', 0.8));
    once('focos', B_LIGHTS, () => {
      presShake = 0.004;
      views![1].bump(1);
      hud.flash(0.55);
      g.audio.play('golpe-pesado', 1);
      g.audio.play('rugido', 1);
      g.audio.musicOn(true);
    });
    // ── Tu chizito: se despierta, piñas a la cámara, pose de héroe ──
    once('despierta', P_CHIZ0 + 0.3, () => {
      views![0].bump(-1);
      g.audio.play('zumbido', 0.6);
    });
    once('bronca', P_CHIZ0 + 0.95, () => views![0].hurt(0, 0.0012));
    PUNCHES.forEach((at, i) =>
      once(`pina${i}`, P_CHIZ0 + at + 0.1, () => {
        presShake = Math.max(presShake, 0.0016);
        g.audio.play(i === 2 ? 'golpe-pesado' : 'golpe', 0.8);
      }),
    );
    once('heroe', P_CHIZ0 + 2.55, () => {
      views![0].bump(-0.8);
      g.audio.play('combo', 0.8);
    });
    once('vs', P_VS, () => {
      g.audio.play('round', 1);
      hud.flash(0.25);
    });
    // Gesto de la cara del brócoli: sonrisa torva y quieta (apenas se abre al hablar), cejas que bajan, y el rugido.
    const talk = line && t < B_LIGHTS ? 0.12 + 0.12 * Math.abs(Math.sin(t * 13)) : 0;
    if (t < B_LIGHTS) views[1].face?.(0.02 + talk, -0.2 - 0.6 * smooth((t - 3.4) / 1.5));
    else if (t < B_LIGHTS + 1.2) views[1].face?.(1, -1);
    else views[1].face?.(0.15, -0.7);
    if (t >= P_END) endPresent();
  };
  /** Pose de la presentación: la del motor (quieto) con los brazos animados. */
  const presentPose = (i: 0 | 1, base: RenderPose): RenderPose => {
    if (!present || !m) return base;
    const t = present.t;
    const f = m.f[i];
    const L = f.model.limbs;
    const cam = game().stage.camera.position;
    const psi = f.facing > 0 ? -f.yaw : -Math.PI + f.yaw;
    const toLocal = (v: THREE.Vector3): [number, number, number] => {
      const d = v.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -psi);
      return [d.x, d.y, d.z];
    };
    const qs = base.qs.map((q) => [...q] as Q);
    const blend = (k: number, target: Q, a: number): void => {
      const A = new THREE.Quaternion(...base.qs[k]);
      const B = new THREE.Quaternion(...target);
      const r = A.slerp(B, Math.max(0, Math.min(1, a)));
      qs[k] = [r.x, r.y, r.z, r.w];
    };
    const raise = (k: number, a: number, wiggle: number): void => {
      const d = L[k].dir;
      const up: [number, number, number] = [d[0] * 0.35, 1, d[2] * 0.35];
      const l = Math.hypot(...up);
      blend(k, qFromTo(d, [up[0] / l, up[1] / l, up[2] / l]), a * (0.8 + 0.2 * Math.sin(t * 16 + k * 2) * wiggle));
    };
    const arms = f.arms.filter((k) => !L[k].rigid);
    if (i === 0) {
      const tc = t - P_CHIZ0;
      if (tc < 0 || t > P_VS) return base;
      // Piñas a la cámara: cada brazo (articulado) apunta a la lente y vuelve, uno por vez.
      PUNCHES.forEach((at, n) => {
        if (!arms.length) return;
        const k = arms[n % arms.length];
        const u = tc - at;
        if (u < 0 || u > 0.45) return;
        const a = u < 0.1 ? 1 - (1 - u / 0.1) ** 3 : u < 0.2 ? 1 : 1 - (u - 0.2) / 0.25;
        const pivotW = new THREE.Vector3(f.x, f.y + GROUND, z0);
        blend(k, qFromTo(L[k].dir, toLocal(cam.clone().sub(pivotW))), a);
      });
      // Pose de héroe: todos los brazos arriba.
      if (tc > 2.5) arms.forEach((k) => raise(k, smooth((tc - 2.5) * 4), 0.4));
      const shiver = tc > 0.9 && tc < 1.3 ? 0.05 * Math.sin(tc * 60) : 0;
      return { ...base, qs, tilt: base.tilt + shiver + 0.05 * Math.sin(tc * 5) * (tc < 2.5 ? 1 : 0) };
    }
    // El brócoli en la oscuridad: respira hondo, se inclina apenas hacia la cámara (acecha). Con los focos, zanahorias arriba.
    if (t > B_LIGHTS - 0.1) arms.forEach((k) => raise(k, smooth((t - B_LIGHTS + 0.1) * 5), 1));
    const breathe = t < B_LIGHTS ? 0.025 * Math.sin(t * 1.6) + 0.05 * smooth((t - 2) / 3) : 0;
    return { ...base, qs, tilt: base.tilt + breathe };
  };
  /** Cámara de la presentación (planos de cine: la boca a la luz de la vela, la subida a los ojos, la revelación, el héroe, VS). */
  const presentCamera = (dt: number): void => {
    if (!present || !m) return;
    const cam = game().stage.camera;
    const t = present.t;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let rate = 7;
    let focal = 50;
    let roll = 0;
    let shot: string;
    if (t < P_CHIZ0) {
      const n = front(1);
      const side = new THREE.Vector3(-n.z, 0, n.x);
      const mouth = along(1, 0.44);
      const eyes = along(1, 0.63);
      if (t < 3.4) {
        // La BOCA, muy cerca, a la luz de la vela: un paneo lento de costado y apenas acercándose. Suspenso.
        shot = 'boca';
        const k = smooth(t / 3.4);
        pos = mouth.clone().addScaledVector(n, 0.062 - 0.008 * k).addScaledVector(side, 0.012 - 0.02 * k).add(new THREE.Vector3(0, -0.004, 0));
        look = mouth.clone().addScaledVector(side, 0.003 - 0.004 * k);
        rate = 4;
        focal = 58;
        roll = 0.05 - 0.07 * k;
      } else if (t < B_LIGHTS) {
        // Sube despacio de la boca a los ojos.
        shot = 'boca';
        const k = smooth((t - 3.4) / (B_LIGHTS - 3.4));
        pos = mouth.clone().lerp(eyes, k).addScaledVector(n, 0.056 + 0.01 * k).addScaledVector(side, -0.008);
        look = mouth.clone().lerp(eyes, k);
        rate = 3;
        focal = 58;
        roll = -0.02;
      } else {
        // ¡Se encienden los focos! La cámara salta atrás: plano entero en contrapicado, torcido.
        shot = 'revela';
        const k = smooth((t - B_LIGHTS) / 0.35);
        pos = along(1, 0.5).addScaledVector(n, 0.14).addScaledVector(side, 0.03).add(new THREE.Vector3(0, -0.015, 0));
        look = along(1, 0.55);
        rate = 12;
        focal = 40;
        roll = 0.08 * k;
      }
    } else if (t < P_VS) {
      const tc = t - P_CHIZ0;
      const n = front(0);
      const side = new THREE.Vector3(-n.z, 0, n.x);
      const face = along(0, 0.62);
      shot = 'chizito';
      if (tc < 1.3) {
        const k = smooth(tc / 1.3);
        pos = face.clone().addScaledVector(n, 0.1 - 0.025 * k).addScaledVector(side, 0.025 * (1 - k)).add(new THREE.Vector3(0, -0.028 + 0.01 * k, 0));
        look = face.clone().add(new THREE.Vector3(0, 0.004, 0));
        rate = 5;
        focal = 42;
      } else if (tc < 2.5) {
        pos = face.clone().addScaledVector(n, 0.085).add(new THREE.Vector3(0, -0.01, 0));
        look = face;
        rate = 9;
        focal = 40;
      } else {
        const k = smooth((tc - 2.5) / 0.6);
        pos = face.clone().addScaledVector(n, 0.085 + 0.08 * k).addScaledVector(side, -0.03 * k).add(new THREE.Vector3(0, -0.01 - 0.012 * k, 0));
        look = along(0, 0.55);
        rate = 12;
        focal = 40;
        roll = -0.08 * k;
      }
    } else {
      // Los dos frente a frente: plano general bajo, de frente.
      shot = 'vs';
      const mid = along(0, 0.4).lerp(along(1, 0.4), 0.5);
      const gap = Math.abs(m.f[1].x - m.f[0].x);
      pos = mid.clone().add(new THREE.Vector3(0, 0.005, 0.12 + gap * 0.9));
      look = mid;
      rate = 6;
      focal = 40;
    }
    // Corte seco al empezar cada plano (como en el cine); adentro de cada uno, la cámara se mueve suave.
    const cut = !present.fired.has(`toma-${shot}`);
    present.fired.add(`toma-${shot}`);
    const kk = cut ? 1 : 1 - Math.exp(-dt * rate);
    camPos.lerp(pos, kk);
    camLook.lerp(look, kk);
    camInit = true;
    cam.setFocalLength(cut ? focal : cam.getFocalLength() + (focal - cam.getFocalLength()) * Math.min(1, kk * 1.5));
    cam.position.copy(camPos);
    if (presShake > 1e-5) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * presShake, (Math.random() - 0.5) * presShake, 0));
    cam.lookAt(camLook);
    if (roll) cam.rotateZ(roll);
    cam.updateMatrixWorld();
    game().stage.focusTarget.copy(camLook);
  };
  const endPresent = (): void => {
    if (!present) return;
    const pending = present.pending;
    present = null;
    hud.present(null);
    hud.sub(null);
    game().audio.musicOn(true);
    black.style.opacity = '0';
    set?.lights(1);
    set?.candle(null, 0);
    candleProp?.removeFromParent();
    candleProp = null;
    views?.[1].face?.(0, 0);
    for (const e of pending) onEvent(e);
    // De la última toma a la de pelea, en movimiento (no de golpe).
    const cam = game().stage.camera;
    camPos.copy(cam.position);
    camInit = true;
  };

  const update = (dt: number): void => {
    if (!m || !views) return;
    const raw = dt;
    if (present && !paused) {
      presentStep(raw);
    } else if (!paused) {
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
      const p = present ? presentPose(i as 0 | 1, cur![i]) : blendPose(prev![i], cur![i], t);
      v.apply({ ...p, y: p.y + GROUND }, z0, raw);
    });
    set?.update(raw);
    // El foco de cara apunta a la altura de la cara (un tercio del centro a la coronilla), no a la punta de la cabeza.
    if (set) views.forEach((v, i) => set!.track(i as 0 | 1, v.head().lerp(new THREE.Vector3(m!.f[i].x, m!.f[i].y + GROUND, z0), 0.65), m!.f[i].facing));
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
    drawTrails();
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

  const restart = (lv = level, withPresent = false): void => {
    if (!model || !views) return;
    level = Math.max(1, Math.min(AI_LEVELS.length, lv));
    const bro = broccoliFighter(level);
    m = createMatch([model, bro]);
    ai = newAi(seed++, level);
    hud.show([model.name, bro.name], warnings(m.f[0]));
    // Cuántas extremidades hay en cada cuadrante del chizito (lo que maneja cada botón).
    const f0 = m.f[0];
    const count = (q: Quad): number => (q[1] === 'A' ? f0.arms : [...f0.legs, ...f0.pegs]).filter((k) => model!.limbs[k].side === q[0]).length;
    hud.pad({ LA: count('LA'), RA: count('RA'), LL: count('LL'), RL: count('RL') });
    paused = false;
    fightT = 0;
    acc = 0;
    prev = cur = null;
    views.forEach((v) => v.reattach());
    if (withPresent) present = { t: 0, pending: [...m.events], fired: new Set() };
    else for (const e of m.events) onEvent(e);
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
      if (fixed) w.push(`${fixed === 1 ? 'Una pieza queda fija' : `${fixed} piezas quedan fijas`} (chupetín o atraviesa el chizito): no gira sola; pega con el cuerpo entero`);
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
    if (present) return endPresent();
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

  // ── Ensayo invisible: mientras se arma el chizito, en ratos libres y de a un paso, se deja todo listo (modelos del brócoli,
  //    foto de la tabla, la arena armada y los shaders compilados con la luz de la pelea) para que PELEAR salga al instante. ──
  let warm: Promise<void> | null = null;
  let hurry = false;
  const wakers: (() => void)[] = [];
  const idle = (): Promise<void> =>
    hurry
      ? Promise.resolve()
      : new Promise((r) => {
          wakers.push(r);
          const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
          if (ric) ric(() => r(), { timeout: 1500 });
          else window.setTimeout(r, 250);
        });
  const prewarm = (): Promise<void> =>
    (warm ??= (async () => {
      await idle();
      const parts = await loadBroccoliParts();
      await idle();
      // La primera cara del brócoli tira sus rayos (quedan guardados) y sus materiales entran al ensayo.
      const bro = createBrocoli({ level: 1, parts });
      await idle();
      const g = game();
      await prewarmFight(g.stage, g.pivot.position.z, [bro], [g.pivot]);
    })().catch((err) => console.warn('[pelea] no se pudo dejar lista de antemano', err)));
  const hurryUp = (): void => {
    hurry = true;
    wakers.splice(0).forEach((r) => r());
  };
  // Arranca cuando ya se está armando (pasó la intro) y el juego lleva unos segundos andando.
  let since = 0;
  const warmPoll = window.setInterval(() => {
    if (game().rig.inIntro) return;
    if ((since += 1) < 3) return;
    window.clearInterval(warmPoll);
    void prewarm();
  }, 1000);

  const controller: FightController = {
    async open() {
      const g = game();
      if (open || g.rig.inIntro) return;
      // Si había algo en la mano (ketchup, un palito), se suelta con Esc como en el juego.
      for (let k = 0; k < 2; k++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      // El frente de la pelea es la CARA que marca la F en el constructor (+Z del chizito), con arriba = su eje largo (+X):
      // de enfrentarse, se ven de perfil y la cara mira al rival.
      const snap = resolveSnapshot({ construction: g.construction, pieces: deps.pieces, orientation: { front: [...BUILDER_FACE], up: [...DEFAULT_COMBAT_UP] } });
      // Con presentación, primero se apagan las luces de la fiesta (todo lo que sigue se arma a oscuras).
      if (wantsPresent()) await blackout();
      // Si el ensayo no terminó (se apretó PELEAR enseguida), termina ya, sin esperar ratos libres.
      hurryUp();
      await prewarm();
      const parts = await loadBroccoliParts();
      model = fighterFromSnapshot(snap, 'TU CHIZITO');
      z0 = g.pivot.position.z;
      saved = { pos: g.stage.camera.position.clone(), quat: g.stage.camera.quaternion.clone(), focal: g.stage.camera.getFocalLength(), enabled: g.interaction.enabled };
      g.interaction.enabled = false;
      g.interaction.hideFront();
      views = [creatureView(g.construction, g.pivot, model, g.stage.renderer), broccoliView(g.stage.scene, broccoliFighter(level), level, parts)];
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
      restart(level, wantsPresent());
      // Sin presentación, la cámara viaja del constructor a la pelea; con presentación, la primera toma entra al corte.
      tween = present ? null : { t: 0, from: { pos: saved.pos.clone(), quat: saved.quat.clone() } };
      // Con presentación, la música entra recién cuando se encienden los focos (en la oscuridad, silencio y la vela).
      if (!present) g.audio.musicOn(true);
    },
    close() {
      if (!open) return;
      open = false;
      paused = false;
      keys.clear();
      hud.hide();
      black.style.opacity = '0';
      candleProp?.removeFromParent();
      candleProp = null;
      const g = game();
      g.audio.musicOn(false);
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
      for (const t of trails.values()) {
        t.mesh.removeFromParent();
        t.mesh.geometry.dispose();
      }
      trails.clear();
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
    warm: () => prewarm(),
    destroy() {
      controller.close();
      window.clearInterval(poll);
      window.clearInterval(warmPoll);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
      window.removeEventListener('wheel', noWheel, true);
      window.removeEventListener('blur', blur);
      hud.destroy();
      btn.remove();
      st.remove();
    },
  };
  // Apagón: capa negra sobre todo (menos el HUD). Las luces titilan y se cortan antes de la pelea; la presentación la levanta.
  const black = document.createElement('div');
  black.id = 'cf-black';
  host.append(black);
  const blackout = (): Promise<void> =>
    new Promise((done) => {
      // Titila como una instalación que falla, y se corta: clac.
      const steps: [number, number][] = [[0, 0.55], [90, 0.05], [170, 0.7], [240, 0.3], [330, 0.85], [420, 0.6], [560, 1]];
      black.style.transition = 'none';
      for (const [at, o] of steps) window.setTimeout(() => (black.style.opacity = String(o)), at);
      window.setTimeout(() => game().audio.play('apagon', 1), 540);
      window.setTimeout(done, 900);
    });
  // Sin cara no se pelea (la primera vez): se pide dibujarle un rostro con el ketchup. Si insiste, entra igual.
  const nag = document.createElement('div');
  nag.id = 'cf-nag';
  nag.textContent = '¡Usá el ketchup para dibujarle un rostro!';
  host.append(nag);
  let nagged = false;
  let nagT = 0;
  btn.addEventListener('click', () => {
    const hasFace = [...game().construction.nodes.values()].some((n) => n.data.type === 'ketchup');
    if (!hasFace && !nagged) {
      nagged = true;
      nag.classList.add('on');
      window.clearTimeout(nagT);
      nagT = window.setTimeout(() => nag.classList.remove('on'), 3800);
      return;
    }
    nag.classList.remove('on');
    void controller.open();
  });
  return controller;
}
