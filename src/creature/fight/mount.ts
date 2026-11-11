import * as THREE from 'three';
import type { AudioManager } from '../../audio/AudioManager';
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
#cf-btn[hidden]{display:none}
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
  // 0–3,4 s TU CHIZITO: se despierta en un primer plano desde abajo, de frente (la cara que se le dibujó), le tira piñas a la
  //   cámara (cada una sacude la toma) y termina en pose de héroe con la cámara que se aleja.
  // 3,4–7 s EL BROCOLOCO: la toma sube desde las zanahorias hasta la cara; se ríe (boca, cejas, zanahorias arriba) y de golpe
  //   SE TE TIRA ENCIMA: zoom brusco, sacudida, destello y su nombre.
  // 7–8 s: los dos frente a frente, VS. Después, ROUND 1.
  const P_CHIZ = 3.4;
  const P_BRO = 7.0;
  const P_END = 8.0;
  let presShake = 0;
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
  const presentStep = (dt: number): void => {
    if (!present || !m || !views) return;
    present.t += dt;
    const t = present.t;
    const g = game();
    const f0 = m.f[0];
    presShake *= Math.exp(-dt * 9);
    if (t < P_CHIZ) {
      if (t <= 0.35) hud.present(0);
      else {
        const parts = [`${f0.arms.length} brazo${f0.arms.length === 1 ? '' : 's'}`, `${f0.legs.length} pierna${f0.legs.length === 1 ? '' : 's'}`, `${(f0.model.mass * 1000).toFixed(1).replace('.', ',')} g`];
        hud.present(0, 'TU CHIZITO', parts.join(' · '));
      }
    } else if (t < P_BRO) {
      if (t > P_CHIZ + 2.6) hud.present(1, 'EL BROCOLOCO', `NIVEL ${level} · el vegetal más malo de la mesa`);
      else hud.present(1);
    } else hud.present(2, 'VS', 'TU CHIZITO · EL BROCOLOCO');
    // Chizito: se despierta (se estira de golpe), tiembla de bronca, piñas a la cámara y pose final.
    once('despierta', 0.3, () => {
      views![0].bump(-1);
      g.audio.play('zumbido', 0.6);
    });
    once('bronca', 0.95, () => views![0].hurt(0, 0.0012));
    PUNCHES.forEach((at, i) =>
      once(`pina${i}`, at + 0.1, () => {
        presShake = Math.max(presShake, 0.0016);
        g.audio.play(i === 2 ? 'golpe-pesado' : 'golpe', 0.8);
      }),
    );
    once('heroe', 2.55, () => {
      views![0].bump(-0.8);
      g.audio.play('combo', 0.8);
    });
    // Brócoli: aparece, se ríe y se te tira encima.
    once('bro-sube', P_CHIZ + 0.05, () => g.audio.play('zumbido', 0.5));
    once('risa', P_CHIZ + 1.25, () => g.audio.play('risa', 1));
    for (const at of [1.3, 1.6, 1.9, 2.2]) once(`rebote${at}`, P_CHIZ + at, () => views![1].bump(0.6));
    once('susto', P_CHIZ + 2.6, () => {
      presShake = 0.004;
      views![1].bump(1);
      hud.flash(0.5);
      g.audio.play('golpe-pesado', 1);
      g.audio.play('ko', 0.7);
    });
    once('vs', P_BRO, () => {
      g.audio.play('round', 1);
      hud.flash(0.25);
    });
    // Gesto de la cara del brócoli: tranquilo y torvo → se ríe (boca que se abre y cierra, cejas arriba) → furia (boca abierta,
    // cejas abajo).
    const u = t - P_CHIZ;
    if (u < 1.2) views[1].face?.(0, -0.3);
    else if (u < 2.6) views[1].face?.(0.25 + 0.55 * Math.abs(Math.sin((u - 1.2) * 11)), 0.6);
    else if (u < 3.6) views[1].face?.(1, -1);
    else views[1].face?.(0.15, -0.6);
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
      if (t > P_CHIZ) return base;
      // Piñas a la cámara: cada brazo (articulado) apunta a la lente y vuelve, uno por vez.
      PUNCHES.forEach((at, n) => {
        if (!arms.length) return;
        const k = arms[n % arms.length];
        const u = t - at;
        if (u < 0 || u > 0.45) return;
        const a = u < 0.1 ? 1 - (1 - u / 0.1) ** 3 : u < 0.2 ? 1 : 1 - (u - 0.2) / 0.25;
        const pivotW = new THREE.Vector3(f.x, f.y + GROUND, z0);
        blend(k, qFromTo(L[k].dir, toLocal(cam.clone().sub(pivotW))), a);
      });
      // Pose de héroe: todos los brazos arriba.
      if (t > 2.5) arms.forEach((k) => raise(k, smooth((t - 2.5) * 4), 0.4));
      // Se despierta: un temblor de bronca antes de las piñas.
      const shiver = t > 0.9 && t < 1.3 ? 0.05 * Math.sin(t * 60) : 0;
      return { ...base, qs, tilt: base.tilt + shiver + 0.05 * Math.sin(t * 5) * (t < 2.5 ? 1 : 0) };
    }
    // El brócoli: respira, después zanahorias arriba sacudiéndose (furioso y riéndose).
    const u = t - P_CHIZ;
    if (u > 1.1) arms.forEach((k) => raise(k, smooth((u - 1.1) * 4), 1));
    return { ...base, qs, tilt: base.tilt + (u > 0 && u < 1.2 ? 0.02 * Math.sin(u * 4) : 0) };
  };
  /** Cámara de la presentación (planos de cine: contrapicado, primer plano, grúa, zoom de golpe, plano de los dos). */
  const presentCamera = (dt: number): void => {
    if (!present || !m) return;
    const cam = game().stage.camera;
    const t = present.t;
    const front = (i: 0 | 1): THREE.Vector3 => new THREE.Vector3(m!.f[i].facing * Math.cos(m!.f[i].yaw), 0, Math.sin(m!.f[i].yaw));
    // Altura a lo largo del cuerpo principal (el chizito, o el tallo del brócoli: ahí está la cara), de abajo (0) a arriba (1).
    const at = (i: 0 | 1, k: number): THREE.Vector3 => {
      const f = m!.f[i];
      const b = f.model.body[0];
      const lo = Math.min(b.a[1], b.b[1]) - b.r;
      const hi = Math.max(b.a[1], b.b[1]) + b.r;
      return new THREE.Vector3(f.x, f.y + GROUND + lo + (hi - lo) * k, z0);
    };
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let rate = 7;
    let focal = 50;
    let roll = 0;
    if (t < P_CHIZ) {
      const n = front(0);
      const side = new THREE.Vector3(-n.z, 0, n.x);
      const face = at(0, 0.62);
      if (t < 1.3) {
        // Contrapicado muy cerca, entrando de a poco: se despierta.
        const k = smooth(t / 1.3);
        pos = face.clone().addScaledVector(n, 0.1 - 0.025 * k).addScaledVector(side, 0.025 * (1 - k)).add(new THREE.Vector3(0, -0.028 + 0.01 * k, 0));
        look = face.clone().add(new THREE.Vector3(0, 0.004, 0));
        rate = 5;
        focal = 42;
      } else if (t < 2.5) {
        // De frente: le pega a la lente.
        pos = face.clone().addScaledVector(n, 0.085).add(new THREE.Vector3(0, -0.01, 0));
        look = face;
        rate = 9;
        focal = 40;
      } else {
        // Pose de héroe: la cámara se aleja rápido y queda en contrapicado, apenas inclinada.
        const k = smooth((t - 2.5) / 0.6);
        pos = face.clone().addScaledVector(n, 0.085 + 0.08 * k).addScaledVector(side, -0.03 * k).add(new THREE.Vector3(0, -0.01 - 0.012 * k, 0));
        look = at(0, 0.55);
        rate = 12;
        focal = 40;
        roll = -0.08 * k;
      }
    } else if (t < P_BRO) {
      const u = t - P_CHIZ;
      const n = front(1);
      const face = at(1, 0.55);
      const feet = new THREE.Vector3(m.f[1].x, GROUND + 0.012, z0);
      if (u < 1.2) {
        // Grúa: arranca en las zanahorias y sube hasta la cara.
        const k = smooth(u / 1.2);
        pos = feet.clone().lerp(face, k).addScaledVector(n, 0.13 - 0.03 * k).add(new THREE.Vector3(0, 0.008 - 0.004 * k, 0));
        look = feet.clone().lerp(face, k);
        rate = 8;
        focal = 45;
      } else if (u < 2.6) {
        // Primer plano de la cara: se ríe.
        pos = face.clone().addScaledVector(n, 0.095).add(new THREE.Vector3(0, 0.004, 0));
        look = face;
        focal = 50;
      } else {
        // ¡SE TE TIRA ENCIMA! Zoom de golpe a la cara y queda ahí, torcido.
        const k = smooth((u - 2.6) / 0.12);
        pos = face.clone().addScaledVector(n, 0.095 - 0.025 * k);
        look = face;
        rate = 40;
        focal = 50 + 8 * k;
        roll = 0.1 * k;
      }
    } else {
      // Los dos frente a frente: plano general bajo, de frente.
      const mid = at(0, 0.4).lerp(at(1, 0.4), 0.5);
      const gap = Math.abs(m.f[1].x - m.f[0].x);
      pos = mid.clone().add(new THREE.Vector3(0, 0.005, 0.12 + gap * 0.9));
      look = mid;
      rate = 6;
      focal = 40;
    }
    // Corte seco al empezar cada parte (como en el cine); adentro de cada una, la cámara se mueve suave.
    const shot = t < P_CHIZ ? 'toma-chizito' : t < P_BRO ? 'toma-brocoli' : 'toma-vs';
    const cut = !present.fired.has(shot);
    present.fired.add(shot);
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
      g.audio.musicOn(true);
    },
    close() {
      if (!open) return;
      open = false;
      paused = false;
      keys.clear();
      hud.hide();
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
  btn.addEventListener('click', () => void controller.open());
  return controller;
}
