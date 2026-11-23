import * as THREE from 'three';
import type { AudioManager, SoundId } from '../../audio/AudioManager';
import { Crumbs } from '../../fx/Crumbs';
import type { AssetRegistry } from '../../assets/AssetRegistry';
import { clonePieces } from '../../commands/CommandStack';
import { CONFIG } from '../../config';
import { poseFromData } from '../../interaction/attach';
import { fromCreatureFile } from '../../persistence/CreatureFile';
import { markHero } from '../../render/ContactShadow';
import type { PieceRegistry } from '../../pieces/PieceRegistry';
import type { CameraRig } from '../../render/CameraRig';
import type { Stage } from '../../render/Stage';
import { BUILDER_FACE, Construction, DEFAULT_COMBAT_UP } from '../../model/Construction';
import { resolveSnapshot } from '../resolve';
import { createBrocoli, loadBroccoliParts } from './brocoli';
import { aiInput, newAi, type AiMem } from './ai';
import { createMatch, stepMatch, type FightEvent, type FightInput, type Match } from './engine';
import { fighterFromSnapshot, rivalFighter, type FighterModel } from './fighter';
import { FightHud, type MenuAction } from './hud';
import { blendPose, creatureView, rivalView, type FighterView, type RenderPose } from './render';
import { createEgg, createQuinoa, looseGrains } from './rivals3d';
import { FightFx } from './fx';
import { enterFightSet, GROUND, prewarmFight, type FightSet } from './stage';
import { AI_LEVELS, FIGHT, POWERS } from './tuning';
import { hashMatch, Lockstep, newRoom, openLink, packMatch, unpackMatch, type Link, type NetMsg } from './net';
import { qFromTo, type Q } from './quat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quad } from '../zones';

/** Lo que el juego deja en `window.__chizito`: la MISMA escena, cámara y criatura del constructor. */
export interface Game {
  stage: Stage;
  pivot: THREE.Group;
  rig: CameraRig;
  construction: Construction;
  interaction: { enabled: boolean; hideFront(): void };
  audio: AudioManager;
  assets: AssetRegistry;
  persistence: { toJSON(): string };
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
#cf-vs{position:fixed;right:212px;bottom:26px;z-index:41;border:0;border-radius:14px;padding:11px 16px 10px;cursor:pointer;font:400 13px/1 "Bungee",Impact,sans-serif;letter-spacing:.04em;color:#0d1024;background:#fff;box-shadow:0 0 0 3px #0d1024,0 5px 0 3px #0d1024;transition:transform .12s}
#cf-vs:hover{transform:translateY(-2px)}#cf-vs[hidden]{display:none}
#cf-room{position:fixed;right:22px;bottom:150px;z-index:41;width:300px;padding:14px 16px;border-radius:16px;background:#fff8ee;color:#0d1024;font:700 14px/1.35 Nunito,system-ui,sans-serif;box-shadow:0 0 0 3px #0d1024,0 10px 30px rgba(13,16,36,.3)}
#cf-room[hidden]{display:none}#cf-room b{display:block;font:400 15px/1.1 "Bungee",Impact,sans-serif;margin-bottom:6px;color:#e2231a}
#cf-room input{width:100%;box-sizing:border-box;margin:8px 0 6px;padding:7px 8px;border:2px solid #0d1024;border-radius:8px;font:600 12px/1 ui-monospace,monospace;background:#fff}
#cf-room button{border:0;border-radius:9px;padding:7px 12px;margin-right:6px;cursor:pointer;font:800 13px/1 Nunito,system-ui,sans-serif;background:#ffd23f;color:#0d1024;box-shadow:0 0 0 2px #0d1024}
#cf-room button.alt{background:#fff}#cf-black{position:fixed;inset:0;z-index:30;background:#000;opacity:0;pointer-events:none}#cf-nag{position:fixed;right:22px;bottom:92px;z-index:41;max-width:300px;padding:12px 16px;border-radius:16px;background:#fff8ee;color:#b3121f;font:800 17px/1.25 "Baloo 2",Nunito,sans-serif;box-shadow:0 10px 28px rgba(120,40,40,.28),inset 0 0 0 2px #e8352b;pointer-events:none;opacity:0;transform:translateY(10px) scale(.9);transform-origin:90% 100%;transition:opacity .25s,transform .35s cubic-bezier(.2,1.6,.4,1)}#cf-nag:after{content:'';position:absolute;right:46px;bottom:-9px;border:9px solid transparent;border-bottom:0;border-top-color:#fff8ee}#cf-nag.on{opacity:1;transform:none}
@keyframes cfb{0%,100%{box-shadow:0 0 0 3px #fff,0 0 0 6px #0d1024,0 6px 0 6px #0d1024,0 18px 36px rgba(13,16,36,.35)}50%{box-shadow:0 0 0 3px #fff,0 0 0 6px #0d1024,0 6px 0 6px #0d1024,0 18px 44px rgba(255,159,28,.6)}}
`;
const SWORDS = `<svg viewBox="0 0 24 24" fill="none" stroke="#0d1024" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4M7 17l-3 3M3 19l2 2"/></svg>`;

const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyJ', 'KeyX', 'KeyK', 'KeyC', 'KeyL', 'KeyR', 'KeyE', 'KeyV', 'Escape', 'Enter', 'Space']);

const poseOf = (f: Match['f'][number]): RenderPose => ({ x: f.x, y: f.y, tilt: f.tilt, facing: f.facing, yaw: f.yaw, roll: f.roll, qs: f.limbs.map((s) => [...s.q] as RenderPose['qs'][number]), broken: [...f.broken], armorLoss: f.armorLoss, power: f.pw?.kind ?? null, hp: f.hp, mv: f.mv?.id ?? null, mvT: f.mv?.t ?? 0, guard: f.guard, block: f.block > 0 ? 1 : 0 });

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
  btn.title = 'Pelear con tu chizito';
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
  // ?nivel=2 o 3 arranca contra ese rival (para probarlo sin ganar los anteriores).
  const startLevel = Math.min(AI_LEVELS.length, Math.max(1, Number(new URLSearchParams(location.search).get('nivel') ?? 1) || 1));
  let level = startLevel;
  let ai: AiMem = newAi(1, 1);
  /** La hinchada hace la ola UNA vez por pelea (con el primer golpe fuerte de tu chizito). */
  let waved = false;
  // ── Pelea contra un amigo (O1): sala por link. `me` = qué luchador soy (0 el que invitó, 1 el invitado). ──
  interface Side { file: string; model: FighterModel }
  let vs: { room: string; me: 0 | 1; link: Link | null; mine: Side | null; theirs: Side | null; ls: Lockstep | null; gen: number; other: THREE.Group | null; sums: [Map<number, number>, Map<number, number>]; epoch: number; fix: { n: number; e: number; s: string } | null; wait: number } | null = null;
  const me = (): 0 | 1 => vs?.me ?? 0;
  /** Nivel del rival que está dibujado (si cambia el nivel, se rearma su modelo 3D). */
  let viewLevel = 0;
  let rivalParts: Awaited<ReturnType<typeof loadBroccoliParts>> | null = null;
  let seed = 1;
  let z0 = 0;
  const keys = new Set<string>();
  const edges = new Set<string>();
  const hidden: HTMLElement[] = [];
  let saved: { pos: THREE.Vector3; quat: THREE.Quaternion; focal: number; enabled: boolean } | null = null;
  let shake = 0;
  /** Aberración cromática de impacto (0..1): golpe pesado y poder; se apaga en ~0,3 s. */
  let aber = 0;
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
  // Efectos de golpe en 3D (G3, fx.ts): se crean al abrir la pelea.
  let pfx: FightFx | null = null;
  const stars: THREE.Mesh[] = [];
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
    const f = m?.f[me()];
    if (f && m!.phase === 'fight' && (quad || took('KeyZ', 'KeyJ', 'KeyX', 'KeyK')) && m!.frame - lastHint > 50) {
      const role = quad ? (quad[1] === 'A' ? 'arm' : 'leg') : took('KeyX', 'KeyK') ? 'leg' : 'arm';
      const has = f.model.limbs.some((l) => l.role === role && (!quad || l.side === quad[0]));
      const why = !has
        ? `NO HAY ${role === 'arm' ? 'BRAZO' : 'PIERNA'}${!quad ? '' : role === 'arm' ? (quad[0] === 'L' ? ' IZQUIERDO' : ' DERECHO') : quad[0] === 'L' ? ' IZQUIERDA' : ' DERECHA'}`
        : f.stun > 0
            ? 'ATONTADO…'
            : null;
      if (why) {
        lastHint = m!.frame;
        hud.popup(f.x, f.y + 0.07, why, '', 'hint');
      }
    }
    // E: el poder (solo con la barra llena; si no, se avisa cuánto falta).
    const power = took('KeyE');
    if (power && f && m!.phase === 'fight' && f.meter < FIGHT.power.max && m!.frame - lastHint > 30) {
      lastHint = m!.frame;
      hud.popup(f.x, f.y + 0.07, `PODER AL ${Math.floor(f.meter)} %`, '', 'hint');
    }
    const inp: FightInput = { x, up: took('ArrowUp', 'Space'), down: held('ArrowDown'), punch: took('KeyZ', 'KeyJ'), kick: took('KeyX', 'KeyK'), guard: held('KeyD', 'KeyC', 'KeyL'), quad, power, quadHeld: held('KeyQ') ? 'LA' : held('KeyW') ? 'RA' : held('KeyA') ? 'LL' : held('KeyS') ? 'RL' : null };
    edges.clear();
    return inp;
  };

  // ── Efectos ──
  /** Punto del plano de la pelea (y del motor) en el mundo: el piso es la tabla. */
  const P3 = (x: number, y: number, dz = 0.008): THREE.Vector3 => new THREE.Vector3(x, y + GROUND, z0 + dz);
  // Granos sueltos de la quinoa (T8): saltan al reventarla, quedan en la tabla y vuelven volando cuando los reabsorbe.
  const LOOSE_MAX = 600;
  let loose: THREE.InstancedMesh | null = null;
  const lg: { pile: number; who: 0 | 1; p: THREE.Vector3; v: THREE.Vector3; st: 0 | 1 | 2 | 3; t: number; s: number }[] = [];
  const lgM = new THREE.Matrix4();
  const lgQ = new THREE.Quaternion();
  const lgS = new THREE.Vector3();
  const spawnGrains = (who: 0 | 1, at: [number, number], x: number, n: number, pile: number): void => {
    if (!loose) {
      loose = looseGrains(LOOSE_MAX);
      game().stage.scene.add(loose);
    }
    const k = Math.min(n * 5, LOOSE_MAX - lg.length);
    for (let i = 0; i < k; i++) {
      const r = Math.random;
      lg.push({ pile, who, p: P3(at[0], at[1], 0.004 + r() * 0.01), v: new THREE.Vector3((x - at[0]) * 2.2 + (r() - 0.5) * 0.1, 0.25 + r() * 0.25, (r() - 0.5) * 0.08), st: 0, t: 0, s: 0.0007 + r() * 0.0004 });
    }
  };
  const updateGrains = (dt: number): void => {
    if (!loose) return;
    for (let i = lg.length - 1; i >= 0; i--) {
      const g = lg[i];
      g.t += dt;
      if (g.st === 0 || g.st === 3) {
        g.v.y -= 2.4 * dt;
        g.p.addScaledVector(g.v, dt);
        if (g.st === 0 && g.p.y < GROUND + g.s * 0.6) {
          g.p.y = GROUND + g.s * 0.6;
          if (Math.abs(g.v.y) > 0.15) g.v.set(g.v.x * 0.4, -g.v.y * 0.3, g.v.z * 0.4);
          else g.st = 1;
        }
        if (g.st === 3 && g.t > 1.2) lg.splice(i, 1);
      } else if (g.st === 2) {
        const f = m?.f[g.who];
        const to = f ? P3(f.x, f.y + 0.035, 0) : g.p;
        g.p.lerp(to, Math.min(1, dt * 7));
        if (g.p.distanceTo(to) < 0.004) lg.splice(i, 1);
      }
    }
    lg.forEach((g, i) => loose!.setMatrixAt(i, lgM.compose(g.p, lgQ, lgS.setScalar(g.s))));
    loose.count = lg.length;
    loose.instanceMatrix.needsUpdate = true;
  };
  const project = (x: number, y: number): [number, number] | null => {
    const v = P3(x, y).project(game().stage.camera);
    if (v.z > 1) return null;
    return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
  };
  const fxOn = (): FightFx => (pfx ??= new FightFx(game().stage.scene, GROUND + 0.0008));
  // Luz de impacto: la PointLight de la vela (siempre en la arena: no cambia la cantidad de luces) se prende 3 cuadros.
  let flashN = 0;
  const flashAt = new THREE.Vector3();
  const burst = (at: THREE.Vector3, n: number, power: number): void => {
    fxOn().impact(at, power * Math.max(0.5, n / 12), n <= 6);
    if (n > 6) { flashN = 3; flashAt.copy(at).add(new THREE.Vector3(0, 0.01, 0.02)); }
  };
  const ring = (at: THREE.Vector3, size: number, color: number): void => fxOn().ring(at, size, color);
  const sparks = (at: THREE.Vector3, n: number, color: number, speed: number, up = 0.05, size = 0.004): void => fxOn().sparks(at, n, color, speed, up, size);
  /** El color de cada poder (aura al cargar, estallido al soltar). */
  const POWER_COLOR: Record<string, number> = { queso: 0xff9424, olor: 0xb5c83a, nube: 0xff9424, trompo: 0xffd23f, arbolitos: 0x6cc23a, raices: 0xb08850, cascaras: 0xfff3d6, rodada: 0xfff3d6, metralla: 0xf0dfb0, avalancha: 0xe6d3a0 };
  const cloud = (at: THREE.Vector3, n: number, color: number, size: number, spread: number, rise: number, dir = 0): void => fxOn().puff(at, n, color, size, spread, rise, dir);
  /** Granos de quinoa en el aire (los de la METRALLA): uno por proyectil del motor. */
  const grainGeo = new THREE.SphereGeometry(1, 7, 5).scale(1, 0.6, 1);
  const grainMats = ['#ebdfc3', '#93412e', '#2b2522', '#e3d3b0'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
  const paintGeo = (g: THREE.BufferGeometry, hex: string): void => {
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
  };
  // Ramito de brócoli de verdad: copa grumosa (varias bolitas verdes) sobre un tronquito claro. Medidas en radios de la bala.
  const floretGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const stem = new THREE.CylinderGeometry(0.28, 0.4, 1.3, 7);
    stem.translate(0, -0.55, 0);
    paintGeo(stem, '#a9c97a');
    parts.push(stem);
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4;
      const r = k === 0 ? 0 : 0.42;
      const b = new THREE.IcosahedronGeometry(k === 0 ? 0.55 : 0.42, 1);
      const pos = b.getAttribute('position');
      for (let n = 0; n < pos.count; n++) pos.setXYZ(n, pos.getX(n) * (1 + 0.12 * Math.sin(n * 2.3)), pos.getY(n) * (1 + 0.12 * Math.cos(n * 1.7)), pos.getZ(n));
      b.translate(Math.cos(a) * r, 0.35 + (k === 0 ? 0.25 : 0), Math.sin(a) * r);
      paintGeo(b, k % 2 ? '#3d7a22' : '#2f6a1a');
      parts.push(b);
    }
    const g = mergeGeometries(parts.map((x) => x.toNonIndexed()))!;
    g.computeVertexNormals();
    return g;
  })();
  const floretMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  // Cáscara de huevo: un pedazo curvo de esfera, blanco por fuera y apenas más crema por dentro; se ve de lejos.
  const shellGeo = new THREE.SphereGeometry(1, 12, 8, 0, 1.9, 0, 1.3);
  const shellMat = new THREE.MeshStandardMaterial({ color: '#fbf7ee', roughness: 0.4, side: THREE.DoubleSide, emissive: '#fff6e0', emissiveIntensity: 0.12 });
  // BOLA DE QUINOA: una bola de granos de verdad (blancos, rojos y negros, apretados), un solo dibujo para todas.
  const GRAIN_COLS = ['#ebdfc3', '#e3d3b0', '#93412e', '#2b2522', '#f1e6cc'];
  const ballGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const core = new THREE.IcosahedronGeometry(0.9, 2);
    paintGeo(core, '#cdbb92');
    parts.push(core);
    for (let k = 0; k < 160; k++) {
      const y = 1 - (2 * (k + 0.5)) / 160;
      const rr = Math.sqrt(1 - y * y);
      const a = k * 2.39996;
      const gr = new THREE.SphereGeometry(0.2, 5, 3).scale(1, 0.62, 1);
      gr.lookAt(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
      gr.translate(Math.cos(a) * rr * 0.95, y * 0.95, Math.sin(a) * rr * 0.95);
      paintGeo(gr, GRAIN_COLS[(k * 7) % GRAIN_COLS.length]);
      parts.push(gr);
    }
    const g = mergeGeometries(parts.map((x) => x.toNonIndexed()))!;
    g.computeVertexNormals();
    return g;
  })();
  const ballMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  /** TSUNAMI: cientos de granos formando una ola que se enrosca hacia adelante (marco: x hacia donde avanza, y arriba). */
  const waveMesh = (H: number): THREE.InstancedMesh => {
    const N = 900;
    const im = new THREE.InstancedMesh(grainGeo, new THREE.MeshStandardMaterial({ roughness: 0.5 }), N);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const s = rnd();
      const z = (rnd() - 0.5) * 0.07;
      // Perfil: sube desde atrás, cresta adelante que se curva hacia el frente (la ola rompe).
      const y = H * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.15)), 0.8) * (0.55 + 0.45 * rnd());
      const curl = s > 0.6 ? (s - 0.6) / 0.4 : 0;
      const x = -0.03 + 0.036 * s + curl * curl * H * 0.5 * (y / H);
      q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
      const sc = 0.0009 + rnd() * 0.0006;
      mtx.compose(new THREE.Vector3(x, y, z * (1 - 0.4 * (y / H))), q, new THREE.Vector3(sc, sc, sc));
      im.setMatrixAt(i, mtx);
      im.setColorAt(i, c.set(GRAIN_COLS[i % GRAIN_COLS.length]));
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    return im;
  };
  const shotMeshes = new Map<number, THREE.Object3D>();
  const syncShots = (): void => {
    const live = new Set<number>();
    for (const sh of m?.shots ?? []) {
      live.add(sh.id);
      let g = shotMeshes.get(sh.id);
      if (!g) {
        if (sh.kind === 'avalancha') {
          g = waveMesh(POWERS.avalancha.h);
          g.userData.wave = true;
          g.userData.age = 0;
        } else {
          g = sh.kind === 'arbolitos' ? new THREE.Mesh(floretGeo, floretMat) : sh.kind === 'cascaras' ? new THREE.Mesh(shellGeo, shellMat) : sh.kind === 'metralla' ? new THREE.Mesh(ballGeo, ballMat) : new THREE.Mesh(grainGeo, grainMats[sh.id % grainMats.length]);
          g.scale.setScalar(sh.r * (sh.kind === 'arbolitos' ? 1.25 : sh.kind === 'cascaras' ? 1.5 : sh.kind === 'metralla' ? 1 : 1.3));
          g.rotation.set(sh.id * 1.3, sh.id * 0.7, 0);
        }
        g.castShadow = true;
        game().stage.scene.add(g);
        shotMeshes.set(sh.id, g);
      }
      if (g.userData.wave) {
        // La ola nace chiquita, crece, ondula y avanza mirando hacia donde va, levantando polvo y granos.
        g.userData.age += 1;
        const grow = Math.min(1, g.userData.age / 14);
        g.position.copy(P3(sh.x, 0, 0));
        g.scale.set(Math.sign(sh.vx) || 1, grow * (0.9 + 0.1 * Math.sin(g.userData.age * 0.5)), 1);
        if (g.userData.age % 2 === 0) cloud(P3(sh.x - Math.sign(sh.vx) * 0.02, 0.004), 2, 0xd9c9a0, 0.008, 0.03, 0.02);
        if (g.userData.age % 3 === 0) sparks(P3(sh.x + Math.sign(sh.vx) * 0.006, POWERS.avalancha.h * grow), 2, 0xf0e2bd, 0.12, 0.08, 0.003);
        continue;
      }
      g.position.copy(P3(sh.x, sh.y, 0.004 + (sh.kind === 'arbolitos' ? ((sh.id % 5) - 2) * 0.006 : 0)));
      // La bola de quinoa deja una estela de granitos.
      if (sh.kind === 'metralla' && (m?.frame ?? 0) % 2 === 0) sparks(g.position, 2, 0xf0dfb0, 0.03, 0, 0.003);
      // Estelas para que se vean volar: las cascaritas dejan un brillo blanco; los arboletes, hojitas.
      if (sh.kind === 'cascaras' && (sh.id + (m?.frame ?? 0)) % 2 === 0) sparks(g.position, 1, 0xfff6e0, 0.01, 0, 0.004);
      if (sh.kind === 'arbolitos' && (sh.id + (m?.frame ?? 0)) % 6 === 0) cloud(g.position, 1, 0x4f8f2a, 0.002, 0.004, 0.004);
      if (sh.kind === 'arbolitos') {
        // Gira despacio como un arbolito tirado al aire.
        g.rotation.z += 0.12;
        g.rotation.y += 0.05;
      } else {
        g.rotation.x += sh.kind === 'cascaras' ? 0.25 : 0.4;
        g.rotation.z += 0.3;
      }
    }
    for (const [id, g] of shotMeshes) if (!live.has(id)) {
      // Un ramito que llega a la tabla suelta unas hojitas.
      if ((g as THREE.Mesh).geometry === floretGeo && g.position.y < GROUND + 0.006) cloud(g.position, 3, 0x3d7a22, 0.003, 0.015, 0.008);
      if (g.userData.wave) {
        // La ola rompe al final: se desarma en polvo.
        cloud(g.position, 20, 0xd9c9a0, 0.012, 0.05, 0.02);
        ((g as THREE.InstancedMesh).material as THREE.Material).dispose();
      }
      g.removeFromParent();
      shotMeshes.delete(id);
    }
  };

  // ── Lo que queda en la tabla: CÁSCARAS del huevo (tiradas, se ven y se pisan) y las RAÍCES del brócoli. ──
  const trapMat = new THREE.MeshStandardMaterial({ color: '#fbf7ee', roughness: 0.35, side: THREE.DoubleSide, emissive: '#fff3d6', emissiveIntensity: 0.18 });
  // RAÍCES: primero la tabla avisa (grietas que se abren, astillas que tiemblan, polvo y un aro oscuro con el alcance), después
  // brotan raíces gruesas retorcidas (tubos que se afinan, marrones con brotes verdes) que se cierran sobre el que quedó parado
  // ahí, y vuelven a meterse.
  const crackMat = new THREE.MeshBasicMaterial({ color: '#140c05', transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const warnMat = new THREE.MeshBasicMaterial({ color: '#3b2a12', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const splinterMat = new THREE.MeshStandardMaterial({ color: '#b88a52', roughness: 0.8 });
  const rootMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#5fae2e', roughness: 0.6, side: THREE.DoubleSide });
  const leafGeo = new THREE.SphereGeometry(1, 8, 5).scale(1, 0.25, 0.55);
  const RS = 8; // lados de cada raíz
  /** Tubo que se afina a lo largo de la curva (de r0 a casi nada), con color de raíz que se aclara hacia la punta. */
  const taperTube = (curve: THREE.Curve<THREE.Vector3>, segs: number, r0: number): THREE.BufferGeometry => {
    const frames = curve.computeFrenetFrames(segs, false);
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c0 = new THREE.Color('#5b3d1e');
    const c1 = new THREE.Color('#a77b45');
    const c = new THREE.Color();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = curve.getPointAt(t);
      const r = r0 * (1 - 0.88 * t) * (1 + 0.12 * Math.sin(t * 19));
      c.copy(c0).lerp(c1, t);
      for (let j = 0; j < RS; j++) {
        const a = (j / RS) * Math.PI * 2;
        const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
        pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
        // Vetas: franjas apenas más oscuras a lo largo.
        const v = j % 3 === 0 ? 0.8 : 1;
        col.push(c.r * v, c.g * v, c.b * v);
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < RS; j++) {
      const a = i * RS + j, b = i * RS + ((j + 1) % RS), d = (i + 1) * RS + j, e = (i + 1) * RS + ((j + 1) % RS);
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  /** Grieta quebrada: una cinta chata en zigzag desde el centro hacia afuera. */
  const crackGeo = (seed: number, len: number): THREE.BufferGeometry => {
    const pts: THREE.Vector2[] = [];
    let a = seed * 2.39;
    let x = 0, z = 0;
    const n = 6;
    pts.push(new THREE.Vector2(0, 0));
    for (let k = 1; k <= n; k++) {
      a += Math.sin(seed * 7.1 + k * 3.3) * 0.5;
      x += Math.cos(a) * (len / n);
      z += Math.sin(a) * (len / n);
      pts.push(new THREE.Vector2(x, z));
    }
    const pos: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = pts[k], q = pts[k + 1];
      const d = q.clone().sub(p).normalize();
      const w0 = 0.0014 * (1 - k / n) + 0.0002, w1 = 0.0014 * (1 - (k + 1) / n) + 0.0002;
      const nx = -d.y, nz = d.x;
      pos.push(p.x + nx * w0, 0, p.y + nz * w0, q.x + nx * w1, 0, q.y + nz * w1, p.x - nx * w0, 0, p.y - nz * w0);
      pos.push(p.x - nx * w0, 0, p.y - nz * w0, q.x + nx * w1, 0, q.y + nz * w1, q.x - nx * w1, 0, q.y - nz * w1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  const groundMeshes = new Map<number, THREE.Object3D>();
  const disposeGroup = (g: THREE.Object3D): void => g.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh && mm.userData.own) mm.geometry.dispose();
  });
  const syncGround = (): void => {
    const live = new Set<number>();
    for (const t of m?.traps ?? []) {
      live.add(t.id);
      let g = groundMeshes.get(t.id);
      const size = 0.008 + 0.002 * (t.id % 3);
      if (!g) {
        // Dos o tres pedazos de cáscara juntos, uno boca abajo y otro de canto: se lee "cáscara rota" desde la cámara lateral.
        g = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const sh = new THREE.Mesh(shellGeo, trapMat);
          sh.scale.setScalar(size * (1 - 0.25 * k));
          sh.position.set((k - 1) * size * 0.9, size * 0.25, ((k * 7) % 3 - 1) * size * 0.5);
          sh.rotation.set(Math.PI + (k === 1 ? 1.1 : 0.2), t.id * 1.7 + k * 2.1, k * 0.4);
          sh.castShadow = true;
          g.add(sh);
        }
        game().stage.scene.add(g);
        groundMeshes.set(t.id, g);
      }
      // Mismo z que los luchadores: queda a la vista entre los dos.
      g.position.copy(P3(t.x, 0.0005, ((t.id % 5) - 2) * 0.002));
      g.scale.setScalar(t.life < 120 ? t.life / 120 : 1);
    }
    const R = POWERS.raices;
    for (const r of m?.roots ?? []) {
      live.add(r.id);
      let g = groundMeshes.get(r.id) as THREE.Group | undefined;
      if (!g) {
        g = new THREE.Group();
        const warn = new THREE.Mesh(new THREE.RingGeometry(R.r * 0.15, R.r, 40).rotateX(-Math.PI / 2), warnMat.clone());
        warn.name = 'aro';
        warn.userData.own = true;
        g.add(warn);
        for (let k = 0; k < 9; k++) {
          const c = new THREE.Mesh(crackGeo(r.id + k * 1.618, R.r * (0.7 + 0.5 * ((k * 3) % 4) / 3)), crackMat);
          c.rotation.y = (k / 9) * Math.PI * 2;
          c.name = 'grieta';
          c.userData.own = true;
          g.add(c);
        }
        // Astillas de la tabla que se levantan y tiemblan.
        for (let k = 0; k < 7; k++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0007, 0.0012), splinterMat);
          const a = k * 0.9 + r.id;
          sp.position.set(Math.cos(a) * R.r * 0.45, 0, Math.sin(a) * R.r * 0.45);
          sp.rotation.y = -a;
          sp.name = 'astilla';
          sp.userData.own = true;
          g.add(sp);
        }
        // Raíces: 6 tubos que salen del centro, se abren y se curvan hacia adentro (agarran al que está encima).
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + r.id;
          const out = R.r * (0.35 + 0.25 * (k % 2));
          const h = 0.03 + 0.012 * ((k * 5) % 3);
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(Math.cos(a) * out * 0.3, -0.004, Math.sin(a) * out * 0.3),
            new THREE.Vector3(Math.cos(a) * out, h * 0.3, Math.sin(a) * out),
            new THREE.Vector3(Math.cos(a + 0.5) * out * 1.1, h * 0.65, Math.sin(a + 0.5) * out * 1.1),
            new THREE.Vector3(Math.cos(a + 1.1) * out * 0.35, h, Math.sin(a + 1.1) * out * 0.35),
          ]);
          const root = new THREE.Mesh(taperTube(curve, 24, 0.0028 + 0.0008 * (k % 3)), rootMat);
          root.name = 'raiz';
          root.castShadow = true;
          root.userData.own = true;
          root.userData.n = 24 * RS * 6;
          root.geometry.setDrawRange(0, 0);
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.copy(curve.getPointAt(1));
          leaf.scale.setScalar(0.0001);
          leaf.rotation.set(0.6, a, 0.3);
          leaf.name = 'hoja';
          root.add(leaf);
          g.add(root);
        }
        game().stage.scene.add(g);
        groundMeshes.set(r.id, g);
      }
      g.position.copy(P3(r.x, 0.0004, 0));
      // Agarró: dos lazos de raíz se enroscan en espiral alrededor de las piernas (o de la base del cuerpo, si no tiene).
      if (r.held && !g.userData.coil) {
        g.userData.coil = true;
        g.userData.coilT = r.t;
        for (let k = 0; k < 2; k++) {
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            const a = k * Math.PI + t * Math.PI * 2 * 2.6;
            const rad = 0.0125 - 0.003 * t;
            pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.001 + t * 0.026, Math.sin(a) * rad));
          }
          const coil = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts), 60, 0.0022), rootMat);
          coil.name = 'lazo';
          coil.castShadow = true;
          coil.userData.own = true;
          coil.userData.n = 60 * RS * 6;
          coil.geometry.setDrawRange(0, 0);
          g.add(coil);
        }
      }
      const warn = Math.min(1, r.t / R.delay);
      const grow = r.t < R.delay ? 0 : Math.min(1, (r.t - R.delay) / 7);
      const back = r.t < R.delay ? 0 : Math.max(0, 1 - (R.delay + R.show - r.t) / 16);
      const up = grow * (1 - back);
      // Polvito mientras se agrieta (cada vez más seguido).
      if (r.t < R.delay && r.t % Math.max(3, 10 - Math.round(warn * 7)) === 0) cloud(P3(r.x, 0.002), 1, 0x8a6a3a, 0.003, 0.012, 0.012);
      for (const c of g.children) {
        if (c.name === 'aro') ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = r.t < R.delay ? 0.25 + 0.3 * warn * (0.6 + 0.4 * Math.sin(r.t * 0.6)) : 0.35 * (1 - back);
        else if (c.name === 'grieta') c.scale.setScalar(Math.max(0.05, Math.min(1, warn * 1.2)));
        else if (c.name === 'astilla') {
          c.position.y = 0.0006 + 0.0025 * warn + (r.t < R.delay ? 0.0008 * warn * Math.sin(r.t * 2.3 + c.rotation.y * 5) : 0.004 * grow * (1 - back));
          c.rotation.z = 0.5 * warn * Math.sin(c.rotation.y * 3);
        } else if (c.name === 'lazo') {
          const k = Math.min(1, (r.t - (g.userData.coilT as number)) / 14) * (1 - back);
          (c as THREE.Mesh).geometry.setDrawRange(0, Math.floor((c.userData.n as number) * k / 6) * 6);
        } else if (c.name === 'raiz') {
          const mesh = c as THREE.Mesh;
          // Crece desde la base (se va dibujando a lo largo) y se mete igual.
          mesh.geometry.setDrawRange(0, Math.floor((c.userData.n as number) * up / 6) * 6);
          const leaf = c.children[0];
          leaf.scale.setScalar(Math.max(0.0001, (up > 0.9 ? (up - 0.9) * 10 : 0) * 0.0035));
        }
      }
    }
    for (const [id, g] of groundMeshes) if (!live.has(id)) {
      disposeGroup(g);
      g.removeFromParent();
      groundMeshes.delete(id);
    }
  };

  // ── Estela de cada golpe: la punta de la extremidad deja un trazo mientras pega (y uno tenue mientras carga), así se lee
  // qué extremidad golpea, desde dónde y hacia dónde. Dorado el chizito, verde el brócoli. ──
  // Estela sobria (de juego de pelea serio): fina, corta, sólo mientras pega y tenue; no mientras carga.
  const TRAIL_N = 9;
  const trailMats = [0xfff2d6, 0xe6ffe0].map((c) => new THREE.MeshBasicMaterial({ color: c, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const trails = new Map<string, { pts: THREE.Vector3[]; mesh: THREE.Mesh; heat: number }>();
  const trackTrails = (): void => {
    if (!m) return;
    m.f.forEach((f, i) => f.model.limbs.forEach((l, k) => {
      const s = f.limbs[k];
      const key = `${i}:${k}`;
      let t = trails.get(key);
      const live = s.phase === 'strike';
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
        const w = 0.0013 * k * (0.4 + 0.6 * t.heat);
        pos.setXYZ(2 * q, a.x - (dy / l) * w, a.y + (dx / l) * w, a.z);
        pos.setXYZ(2 * q + 1, a.x + (dy / l) * w, a.y - (dx / l) * w, a.z);
        const c = 0.45 * k * k * t.heat;
        col.setXYZ(2 * q, c, c, c);
        col.setXYZ(2 * q + 1, c, c, c);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
  };
  const fx = (dt: number): void => {
    if (pfx) pfx.update(dt, game().stage.camera, game().stage.renderer);
    if (!present && (flashN > 0 || flashN === 0)) {
      set?.candle(flashN > 0 ? flashAt : null, flashN > 0 ? 0.035 * (flashN / 3) : 0);
      if (flashN >= 0) flashN--;
    }
    // Mientras se carga un poder se nota: el brócoli suelta gas y ramitos, el chizito suelta polvito de queso.
    if (m && views) m.f.forEach((f, i) => {
      // CARGANDO un poder: un aura de chispas del color del poder sube alrededor del cuerpo y cada vez más rápido.
      if (f.pw?.phase === 'wind') {
        const k = Math.min(1, f.pw.t / POWERS[f.pw.kind].wind);
        const col = POWER_COLOR[f.pw.kind] ?? 0xffffff;
        if (Math.random() < 0.4 + 0.6 * k) sparks(P3(f.x + (Math.random() - 0.5) * 0.04, f.y + Math.random() * 0.04), 2, col, 0.05, 0.12 + 0.1 * k, 0.003);
        if (f.pw.t % 12 === 0) ring(P3(f.x, f.y + 0.025), 0.02 + 0.02 * k, col);
      }
      // La CALESITA girando: deja un remolino dorado.
      if (f.pw?.kind === 'trompo' && f.pw.phase === 'go') sparks(P3(f.x + (Math.random() - 0.5) * 0.05, f.y + 0.01 + Math.random() * 0.035), 3, 0xffd23f, 0.12, 0.02, 0.0035);
      if (f.pw?.phase !== 'wind' || Math.random() > 0.5) return;
      const h = views![i].head();
      if (f.pw.kind === 'raices') cloud(P3(f.x + f.facing * 0.012, 0.003), 1, 0x8a6a3a, 0.003, 0.015, 0.01);
      if (f.pw.kind === 'arbolitos') cloud(h, 1, 0x4f8f2a, 0.003, 0.02, 0.01);
      if (f.pw.kind === 'queso') cloud(P3(f.x + f.facing * 0.01, f.y + 0.02), 1, 0xff9a2a, 0.003, 0.02, 0.02);
      if (f.pw.kind === 'arbolitos' || f.pw.kind === 'cascaras' || f.pw.kind === 'rodada' || f.pw.kind === 'raices') views![i].hurt(0, 0.0006);
    });
    syncShots();
    syncGround();
    crumbs?.forEach((c) => c.update(dt));
    updateGrains(dt);
    // T7: la cara del rival reacciona (aviso = cejas abajo y boca abierta; recibe = cejas arriba y boca chica; gana = se ríe).
    if (m && views && !present) {
      const r = m.f[1];
      const mvW = r.mv && r.limbs.some((q) => q.phase === 'windup');
      const hurtNow = m.frame - r.lastHurt < 20;
      const sick = Math.max(0, Math.min(1, (sickUntil - performance.now()) / 600));
      if (r.ko) views[1].face?.(0.45, 0.8, true);
      else if (sick > 0) views[1].face?.(0, 0, false, sick);
      else if (m.winner === 1 || (m.phase !== 'fight' && m.roundWinner === 1)) views[1].face?.(0.6 + 0.4 * Math.abs(Math.sin(m.frame * 0.35)), 0.4);
      else if (r.guard > 0.4 || r.block > 0) views[1].face?.(0, -1, false, 0, 1);
      else if (hurtNow) views[1].face?.(0.1, 0.9);
      else if (mvW || r.pw?.phase === 'wind') views[1].face?.(0.9, -1);
      else views[1].face?.(0.15, -0.6);
    }
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
        set?.candles(false);
        set?.sweep();
        if (e.round === 1) wantPortraits = true;
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
        if (big && !e.blocked) aber = 1;
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
        // Sólo el número (no todos los golpes llevan palabra): azul si lo tapó, rojizo si cortó.
        const label = '';
        if (e.damage >= 8 || e.chain) hud.popup(e.at[0], e.at[1] + 0.008, `−${Math.max(1, Math.round(e.damage))}`, label, e.blocked ? 'block' : e.kind === 'heavy' ? 'heavy' : e.kind === 'cut' ? 'cut' : '');
        if (!e.blocked) hud.combo(e.by, e.combo, e.chain);
        // Palabras de historieta, no en todos los golpes (si no, no se lee ninguna): ¡JAPISH! en los que valen la pena
        // (pesados, fuertes o el cierre de una combinación), ¡PIMBA! en las patadas que entran y ¡SOPLAMOCO! en las piñas a la cara.
        if (!e.blocked && m.frame - lastShout > 180) {
          const vic = m.f[victim];
          const ys = vic.model.body.flatMap((b) => [b.a[1] - b.r, b.b[1] + b.r]);
          const lo = Math.min(...ys);
          const hi = Math.max(...ys);
          const face = e.at[1] - vic.y > lo + (hi - lo) * 0.62;
          const kick = m.f[e.by].model.limbs.find((l) => l.pieceIds.includes(e.piece))?.role === 'leg';
          // Palabra sólo en los golpes que la merecen: el cierre de una combinación o uno muy fuerte.
          const word = e.chain || e.damage >= 10 ? (kick ? 'pimba' : face ? 'soplamoco' : 'japish') : null;
          if (word) {
            lastShout = m.frame;
            hud.popup(e.at[0], e.at[1] + 0.03, word === 'japish' ? '¡JAPISH!' : word === 'pimba' ? '¡PIMBA!' : '¡SOPLAMOCO!', '', `shout ${word}`);
            g.audio.play(word, 1);
          }
        }
        if (e.chain) g.audio.play('combo', 1);
        if (!e.blocked && e.damage >= 10) {
          camPunch = 0.25;
          set?.cheer(1);
        } else if (!e.blocked && e.damage >= 6) set?.cheer(0.4);
        if (!waved && !e.blocked && e.by === me() && e.damage >= 6) {
          waved = true;
          set?.wave();
        }
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
        if (e.heavy) hud.popup(f.x, f.y + 0.045, whiffN++ % 2 ? '¡PIF!' : '¡PIFIÓ!', '', 'whiff');
        g.audio.play('pifio', e.heavy ? 1 : 0.5);
        break;
      }
      case 'stumble':
        g.audio.play('drop', 0.8);
        break;
      case 'move': {
        // Aviso del ataque del rival: sonido y destello (se ve venir).
        g.audio.play(e.tell as SoundId, 0.7);
        views[e.who].hurt(0.25, 0);
        break;
      }
      case 'grains':
        spawnGrains(e.who, e.at, e.x, e.n, e.pile);
        g.audio.play('crunch', 1);
        break;
      case 'reabsorb':
        for (const q of lg) if (q.pile === e.pile) q.st = 2;
        // Se cura juntando sus granos: que se vea.
        if (performance.now() - healTipAt > 2500) {
          healTipAt = performance.now();
          hud.popup(m.f[e.who].x, m.f[e.who].y + 0.07, '¡SE REARMA!', '', 'hint');
        }
        break;
      case 'scatter':
        for (const q of lg) if (q.pile === e.pile) { q.st = 3; q.t = 0; q.v.set((Math.random() - 0.5) * 0.8, 0.5, 0.3); }
        break;
      case 'absorb':
        views[e.who].bump(0.35);
        // Las dos primeras veces se explica por qué no le hizo nada.
        if (e.who !== me() && absorbTips++ < 2) hud.popup(m.f[e.who].x, m.f[e.who].y + 0.07, '¡SE HUNDE!', 'cargá el golpe: mantené Q / W', 'hint');
        break;
      case 'parry': {
        const f = m.f[e.who];
        hud.popup(f.x, f.y + 0.05, '¡ATAJADA!', '', 'shout');
        g.audio.play('atajada', 1);
        break;
      }
      case 'guardBreak': {
        const f = m.f[e.who];
        hud.popup(f.x, f.y + 0.05, '¡GUARDIA ROTA!', '', 'shout');
        g.audio.play('guardia-rota', 1);
        break;
      }
      case 'down':
        g.audio.play('barrida', 0.9);
        break;
      case 'dash':
        g.audio.play('pasito', 0.4);
        break;
      case 'swing':
        if (e.heavy) g.audio.play('zumbido', 0.8);
        break;
      case 'land':
        g.audio.play('drop', 0.35);
        break;
      case 'power': {
        const f = m.f[e.who];
        const P = POWERS[e.kind];
        if (e.phase === 'wind') {
          g.audio.play('poder-carga', 1);
          hud.flash(0.18);
          break;
        }
        hud.popup(f.x, f.y + 0.075, P.name, '', `shout power ${e.kind}`);
        g.audio.play(`poder-${e.kind}`, 1);
        // SOLTAR un poder es un show: estallido de luz y chispas de su color, onda doble, destello y la cámara tiembla.
        {
          const col = POWER_COLOR[e.kind] ?? 0xffffff;
          const c = P3(f.x, f.y + 0.025);
          sparks(c, 40, col, 0.35, 0.08, 0.005);
          ring(c, 0.05, col);
          ring(c, 0.03, 0xffffff);
          fxOn().impact(c, 1.4, false);
          hud.flash(0.3);
          aber = Math.max(aber, 0.7);
          // Qué hacer contra cada poder del rival (se entiende en el momento, no hay que adivinar).
          const DO: Record<string, string> = { raices: '¡SALÍ DE LA GRIETA O SALTÁ!', avalancha: '¡SALTÁ!', rodada: '¡SALTÁ O CUBRITE!', cascaras: '¡CUBRITE Y NO PISES LAS CÁSCARAS!', metralla: '¡ALEJATE O CUBRITE!', arbolitos: '¡CUBRITE!' };
          if (e.who !== me() && DO[e.kind]) hud.popup(m.f[me()].x, m.f[me()].y + 0.09, DO[e.kind], '', 'hint');
        }
        shake = Math.max(shake, 0.004);
        const front = P3(f.x + f.facing * 0.03, f.y + 0.022);
        if (e.kind === 'queso') cloud(front, 26, 0xff9424, 0.011, 0.05, 0.03, f.facing);
        if (e.kind === 'arbolitos') cloud(views[e.who].head(), 18, 0x4f8f2a, 0.006, 0.04, 0.02);
        if (e.kind === 'cascaras') cloud(P3(f.x, f.y + 0.03), 16, 0xf2ecdf, 0.006, 0.04, 0.02);
        if (e.kind === 'avalancha') cloud(P3(f.x + f.facing * 0.02, 0.004), 30, 0xd9c9a0, 0.008, 0.05, 0.01, f.facing);
        if (e.kind === 'rodada') cloud(P3(f.x, 0.004), 8, 0xe9e2d0, 0.006, 0.03, 0.02);
        if (e.kind === 'nube') cloud(P3(f.x + f.facing * 0.035, f.y + 0.02), 60, 0xff9424, 0.016, 0.05, 0.02, f.facing);
        if (e.kind === 'muralla') ring(P3(f.x, f.y + 0.02), 0.03, 0xffe066);
        if (e.kind === 'olor') cloud(P3(f.x + f.facing * 0.035, f.y + 0.02), 70, 0xa9b83a, 0.018, 0.07, 0.025, f.facing);
        if (e.who === me()) set?.cheer(1);
        break;
      }
      case 'powerHit': {
        const victim = (1 - e.by) as 0 | 1;
        const at = P3(e.at[0], e.at[1]);
        const small = e.kind === 'metralla' || e.kind === 'arbolitos';
        // Olió el olor a pata (o la nube): cara de asco unos segundos.
        if (victim === 1 && !e.blocked && (e.kind === 'olor' || e.kind === 'nube' || e.kind === 'queso')) sickUntil = performance.now() + 3500;
        if (!small && !e.blocked) aber = 1;
        if (!small) burst(at, e.blocked ? 6 : 16, 1.2);
        ring(at, small ? 0.006 : 0.016, e.blocked ? 0x9fe0ff : e.kind === 'queso' ? 0xff9424 : 0xffe066);
        views[victim].bump(e.blocked ? 0.15 : small ? 0.25 : 0.8);
        views[victim].hurt(e.blocked ? 0.3 : small ? 0.4 : 1, e.blocked ? 0.0006 : small ? 0.0008 : 0.0022);
        if (!e.blocked && !small) crumbs?.[victim].emit(at, new THREE.Vector3(m.f[e.by].facing, 0.6, 0.3).normalize(), 5);
        shake = Math.max(shake, small ? 0.0006 : 0.003);
        if (e.damage >= 8 || e.kind === 'trompo') hud.popup(e.at[0], e.at[1] + 0.008, `−${Math.max(1, Math.round(e.damage))}`, '', e.blocked ? 'block' : '');
        g.audio.play(e.blocked ? 'bloqueo' : small ? 'golpe' : 'golpe-pesado', small ? 0.5 : 1);
        // CALESITA DEL DOLOR: el poder más fuerte. Cada vuelta que pega es una explosión dorada: onda grande, chispas, confeti,
        // golpe de cámara, aberración y la hinchada salta.
        if (e.kind === 'trompo' && !e.blocked) {
          sparks(at, 70, 0xffd23f, 0.5, 0.1, 0.006);
          sparks(at, 30, 0xff4d9d, 0.4, 0.08, 0.005);
          ring(at, 0.07, 0xffd23f);
          ring(at, 0.045, 0xff4d9d);
          fxOn().confetti(at, 30);
          fxOn().impact(at, 2, false);
          camPunch = 0.25;
          shake = Math.max(shake, 0.007);
          aber = 1;
          hud.flash(0.35);
          set?.cheer(1);
          g.audio.play('japish', 0.9);
        }
        if (e.kind === 'cascaras' && !e.blocked) sparks(at, 14, 0xfff3d6, 0.25, 0.06, 0.004);
        if (e.kind === 'arbolitos') cloud(at, 2, 0x3d7a22, 0.004, 0.02, 0.01);
        break;
      }
      case 'trap':
        // Una cáscara cae en la tabla (tic) o alguien la pisa (crac y astillas blancas).
        if (e.step) {
          cloud(P3(e.x, 0.003), 10, 0xf6f1e6, 0.004, 0.03, 0.02);
          g.audio.play('escudo', 0.7);
        } else g.audio.play('drop', 0.35);
        break;
      case 'burst': {
        // La BOLA DE QUINOA revienta: estallido de granos para todos lados, polvo, onda y temblor.
        const at = P3(e.x, e.y + 0.004);
        sparks(at, 50, 0xf0dfb0, 0.4, 0.12, 0.004);
        sparks(at, 20, 0xc0583f, 0.35, 0.1, 0.0035);
        cloud(at, 14, 0xd9c9a0, 0.01, 0.04, 0.02);
        ring(at, 0.04, 0xf0dfb0);
        shake = Math.max(shake, 0.004);
        g.audio.play('crunch', 1);
        break;
      }
      case 'roots':
        cloud(P3(e.x, 0.003), e.hit ? 26 : 14, 0x8a6a3a, 0.008, 0.05, 0.02);
        sparks(P3(e.x, 0.006), 24, 0xb08850, 0.25, 0.12, 0.004);
        if (e.hit && e.who !== me()) hud.popup(e.x, 0.07, '¡ATADO!', 'no podés caminar: pegá o cubrite', 'hint');
        shake = Math.max(shake, e.hit ? 0.004 : 0.002);
        g.audio.play('crack', 1);
        break;
      case 'ko':
        set?.cheer(1);
        set?.ko(e.who !== me());
        set?.candles(true);
        hud.announce('K.O.', '', true, 2.2);
        hud.flash(0.7);
        shake = 0.006;
        views[e.who].hurt(1, 0.003);
        g.audio.play('ko', 1);
        break;
      case 'roundEnd': {
        const who = e.winner === 'draw' ? '' : e.winner === me() ? 'GANA TU CHIZITO' : `GANA ${vs ? 'TU AMIGO' : rival().name}`;
        if (e.reason === 'time') hud.announce('¡TIEMPO!', e.winner === 'draw' ? 'EMPATE: RONDA EXTRA' : who, false, 2);
        else hud.announce(e.winner === 'draw' ? '¡DOBLE K.O.!' : e.winner === me() ? '¡BIEN!' : 'AY…', who, e.winner === 1 - me(), 2);
        break;
      }
      case 'matchEnd': {
        const win = e.winner === me();
        // Cañón de confeti para el que gana (G5).
        { const w = m.f[e.winner]; fxOn().confetti(P3(w.x, w.y + 0.06)); }
        hud.announce(win ? '¡GANASTE!' : 'PERDISTE', '', !win, 99);
        const buttons: { a: MenuAction; label: string; alt?: boolean }[] = [];
        if (!vs && win && level < AI_LEVELS.length) buttons.push({ a: 'next', label: `Nivel ${level + 1} ▶` });
        buttons.push({ a: 'again', label: 'Revancha', alt: !vs && win && level < AI_LEVELS.length }, { a: 'exit', label: 'Volver a armar', alt: true });
        window.setTimeout(() => {
          if (open && m?.phase === 'over') hud.showMenu(win ? '¡GANASTE!' : 'PERDISTE', win ? (vs ? 'Le ganaste a tu amigo.' : `Le ganaste a ${rival().name} (nivel ${level}).`) : vs ? 'Ganó tu amigo. Pedile la revancha.' : 'Probá cambiar brazos, piernas o el peso de tu chizito.', buttons);
        }, 1400);
        break;
      }
      default:
        break;
    }
  };

  // ── Cámara de pelea: lateral, sigue el medio de los dos y se aleja o acerca para que entren con aire ──
  // Cámara de espectáculo (G4): acercamiento breve en golpes fuertes, corte al que tira el súper (0,6 s, inclinado 2°) y giro
  // de 20° alrededor del que cae en el KO (en cámara lenta).
  let camPunch = 0;
  let camCut: { t: number; who: 0 | 1 } | null = null;
  /** Tecla V: 0 la lateral de siempre, 1 aérea, 2 primera persona (detrás de la cabeza de tu chizito, mirando al rival). */
  let camMode = 0;
  /** Primera persona: los trazos de ketchup (la cara) de tu chizito, buscados una vez por vista. */
  let fpFor: FighterView | null = null;
  let fpStrokes: THREE.Object3D[] = [];
  /** 0..1: en primera persona los dos se enfrentan DE FRENTE (sin el 3/4 hacia la cámara lateral). */
  let fpK = 0;
  let fpInit = false;
  const fpEye = new THREE.Vector3();
  const fpDir = new THREE.Vector3();
  const camera = (dt: number): void => {
    if (!m) return;
    if (present) return presentCamera(dt);
    camPunch = Math.max(0, camPunch - dt);
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
    D = Math.min(D, 0.5) * (1 - 0.07 * Math.sin(Math.min(1, camPunch / 0.25) * Math.PI));
    let roll = 0;
    if (camCut) {
      // Primer plano del que tira el súper: corte seco, nunca pierde al otro de cuadro por más de 0,6 s.
      camCut.t -= dt;
      const f = m.f[camCut.who];
      mid = f.x + f.facing * 0.012;
      D = 0.17;
      lookY = 0.03 + f.y;
      roll = THREE.MathUtils.degToRad(2) * f.facing;
      if (camCut.t <= 0) camCut = null;
    }
    game().stage.dof.focusBand = 1.6;
    // Cámara aérea OPCIONAL (tecla V): se ve la tabla entera y la mesa alrededor. Por defecto, la lateral de siempre.
    const aerial = camMode === 1 && !camCut && m.phase !== 'ko';
    if (aerial) D = Math.max(D * 1.35, 0.34);
    const elev = THREE.MathUtils.degToRad(camCut ? 6 : aerial ? 38 : 11);
    const tp = new THREE.Vector3(mid, GROUND + lookY + D * Math.sin(elev), z0 + D * Math.cos(elev));
    const tl = new THREE.Vector3(mid, GROUND + lookY, z0);
    if (m.phase === 'ko') {
      const loser = m.f.find((f) => f.ko);
      if (loser) {
        const ang = THREE.MathUtils.degToRad(20) * Math.min(1, m.phaseT / 70) * -loser.facing;
        const piv = new THREE.Vector3(loser.x, tp.y, z0);
        tp.sub(piv).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(piv);
      }
    }
    // PRIMERA PERSONA: atrás y apenas arriba de la cabeza de tu chizito, mirando al rival (se ve el borde de tu cabeza y los
    // brazos cuando pegan). En el KO y en los cortes vuelve la lateral.
    if (camMode === 2 && !camCut && m.phase !== 'ko' && views) {
      // PRIMERA PERSONA: la cámara ES tu chizito (está en su cara de ketchup y va con su cuerpo), pero ESTABILIZADA como una
      // cabeza de verdad: los ojos compensan. Mira siempre al rival, el horizonte queda derecho y del cuerpo toma sólo una parte
      // del cabeceo y del giro (se siente la piña sin marear). Antes copiaba cada inclinación y no se veía nada.
      cam.setFocalLength(24);
      game().stage.dof.focusBand = 9;
      const v = views[me()];
      const B = m.f[me()].model.basis;
      if (fpFor !== v) {
        fpFor = v;
        fpStrokes = [];
        v.root.traverse((o) => {
          if (o.userData.stroke) fpStrokes.push(o);
        });
        fpInit = false;
      }
      v.root.updateMatrixWorld(true);
      const fwdW = new THREE.Vector3(...B.f).transformDirection(v.root.matrixWorld);
      const eye = new THREE.Vector3();
      if (fpStrokes.length) {
        const box = new THREE.Box3();
        for (const o of fpStrokes) box.expandByObject(o);
        box.getCenter(eye);
      } else eye.copy(v.head()).lerp(new THREE.Vector3().setFromMatrixPosition(v.root.matrixWorld), 0.4);
      eye.addScaledVector(fwdW, 0.004);
      const o = m.f[1 - me()];
      const target = new THREE.Vector3(o.x, GROUND + o.y + 0.03, z0);
      // Dirección: 85 % hacia el rival, 15 % hacia donde mira el cuerpo (el giro de la piña se nota, apenas).
      const toRival = target.clone().sub(eye).normalize();
      const dir = toRival.multiplyScalar(0.85).addScaledVector(fwdW, 0.15).normalize();
      if (!fpInit) {
        fpEye.copy(eye);
        fpDir.copy(dir);
        fpInit = true;
      }
      // La posición sigue rápido (es su cabeza) y la mirada más lento (los ojos fijan al rival).
      fpEye.lerp(eye, 1 - Math.exp(-dt * 14));
      fpDir.lerp(dir, 1 - Math.exp(-dt * 6)).normalize();
      const j = new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0).multiplyScalar(0.35);
      cam.position.copy(fpEye).add(j);
      cam.up.set(0, 1, 0);
      cam.lookAt(fpEye.clone().add(fpDir));
      cam.updateMatrixWorld();
      camPos.copy(fpEye);
      camLook.copy(fpEye).addScaledVector(fpDir, 0.06);
      game().stage.focusTarget.copy(new THREE.Vector3(m.f[1 - me()].x, GROUND + m.f[1 - me()].y + 0.02, z0));
      shake *= Math.pow(0.002, dt);
      aber = aber < 0.02 ? 0 : aber * Math.pow(1e-6, dt);
      game().stage.aberration.offset.set(0.0045 * aber, 0.0015 * aber);
      return;
    }
    if (!camInit) {
      camPos.copy(tp);
      camLook.copy(tl);
      camInit = true;
    }
    const k = camCut ? 1 : 1 - Math.exp(-dt * (m.phase === 'ko' ? 2.2 : 4.5));
    camPos.lerp(tp, k);
    camLook.lerp(tl, k);
    shake *= Math.pow(0.002, dt);
    aber = aber < 0.02 ? 0 : aber * Math.pow(1e-6, dt);
    game().stage.aberration.offset.set(0.0045 * aber, 0.0015 * aber);
    const j = new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
    cam.position.copy(camPos).add(j);
    cam.lookAt(camLook.clone().add(j.multiplyScalar(0.5)));
    if (roll) cam.rotateZ(roll);
    cam.updateMatrixWorld();
    game().stage.focusTarget.copy(camLook);
  };

  // Viaje de cámara de entrada/salida.
  let tween: { t: number; from: { pos: THREE.Vector3; quat: THREE.Quaternion }; done?: () => void } | null = null;

  const step = (input: FightInput): void => {
    if (m) advance2([input, aiInput(m, ai, 1)]);
  };
  /** Contra un amigo: da mi entrada (vale 3 cuadros más adelante) y simula sólo si ya están las dos. false = hay que esperar. */
  const stepVs = (): boolean => {
    const ls = vs?.ls;
    if (!m || !vs || !ls) return false;
    if (vs.fix && ls.next >= vs.fix.n) applyFix(vs.fix);
    if (ls.wants()) ls.push(hud.menuOpen() ? { x: 0 } : readInput());
    const pair = ls.take();
    if (!pair) {
      // Medio segundo sin la entrada del otro: se avisa (si no, parece que se colgó el juego).
      if (++vs.wait === 30) hud.sub('CONEXIÓN', 'Esperando a tu amigo…');
      return false;
    }
    if (vs.wait >= 30) hud.sub(null);
    vs.wait = 0;
    advance2(pair);
    // Cada segundo los dos lados comparan una huella del estado: si difiere, se avisa (no debería pasar: el motor es determinista).
    if (m.frame % 60 === 0) {
      const h = hashMatch(m);
      vs.sums[0].set(m.frame, h);
      vs.link?.send({ t: 'h', g: vs.gen, f: m.frame, h, e: vs.epoch });
      checkSums();
    }
    return true;
  };
  const checkSums = (): void => {
    if (!vs?.ls || !m) return;
    for (const [f, h] of vs.sums[0]) {
      const o = vs.sums[1].get(f);
      if (o === undefined) continue;
      vs.sums[0].delete(f);
      vs.sums[1].delete(f);
      if (o !== h) {
        console.warn(`[pelea] los dos lados se separaron en el cuadro ${f}`);
        // El que invitó manda su estado entero; el otro lo pisa y rehace los pasos que ya simuló (`applyFix`).
        if (vs.me === 0) {
          vs.epoch++;
          vs.sums = [new Map(), new Map()];
          vs.link?.send({ t: 'state', g: vs.gen, n: vs.ls.next, e: vs.epoch, s: packMatch(m) });
        }
        return;
      }
    }
  };
  /** Invitado: pisa la pelea con el estado del que invitó (de antes del paso `n`) y rehace lo que ya simuló desde ahí. */
  const applyFix = (fix: { n: number; e: number; s: string }): void => {
    if (!vs?.ls || !m) return;
    vs.fix = null;
    const redo = vs.ls.since(fix.n);
    if (!redo) { hud.popup(0, 0.09, 'SE DESINCRONIZÓ: PEDÍ REVANCHA', '', 'hint'); return; }
    Object.assign(m, unpackMatch(fix.s));
    for (const p of redo) stepMatch(m, p);
    m.events = [];
    vs.epoch = fix.e;
    vs.sums = [new Map(), new Map()];
    prev = cur = [poseOf(m.f[0]), poseOf(m.f[1])];
  };
  /**
   * Retratos del HUD: una foto de la cara de cada uno con la misma cámara y el mismo posprocesado (de 3/4, del lado al que mira),
   * recortada en cuadrado del centro del lienzo. Se saca al empezar el round 1, con las luces del show prendidas.
   */
  let wantPortraits = false;
  const portraits = (): void => {
    if (!m || !views) return;
    const st = game().stage;
    st.scene.updateMatrixWorld();
    const cam = st.camera;
    const was = { p: cam.position.clone(), q: cam.quaternion.clone(), fd: st.dof.focusDistance };
    const cv = st.renderer.domElement;
    const side = Math.min(cv.width, cv.height) * 0.8;
    const FACE = new Set(['ojo', 'boca', 'ceja', 'dientes', 'pupila']);
    views.forEach((v, i) => {
      // La CARA de verdad: los ojos y la boca de los rivales; en tu chizito, lo que le dibujaste con ketchup. La cámara la mira de
      // frente (desde el centro del cuerpo hacia la cara) y la encuadra entera.
      const face = new THREE.Box3();
      const body = new THREE.Box3().setFromObject(v.root);
      v.root.traverse((o) => {
        if (o.visible && (FACE.has(o.name) || o.userData.stroke)) face.expandByObject(o);
      });
      let h: THREE.Vector3;
      const n = new THREE.Vector3();
      let size = 0.03;
      if (!face.isEmpty()) {
        h = face.getCenter(new THREE.Vector3());
        n.copy(h).sub(body.getCenter(new THREE.Vector3()));
        size = Math.max(0.012, face.getSize(new THREE.Vector3()).length() * 1.25);
      } else h = v.head().lerp(new THREE.Vector3(m!.f[i].x, m!.f[i].y + GROUND, z0), 0.65);
      n.y = 0;
      // Nunca desde atrás de la escena: la cara tiene que mirar hacia la cámara de la pelea.
      if (n.lengthSq() < 1e-8 || n.z < 0) n.set(m!.f[i].facing * 0.35, 0, 1);
      n.normalize();
      const dist = size / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.8) / 2);
      cam.position.copy(h).addScaledVector(n, dist).add(new THREE.Vector3(0, dist * 0.08, 0));
      cam.lookAt(h);
      cam.updateMatrixWorld();
      st.dof.focusDistance = cam.position.distanceTo(h);
      st.composer.render(0);
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      c.getContext('2d')!.drawImage(cv, (cv.width - side) / 2, (cv.height - side) / 2, side, side, 0, 0, 128, 128);
      hud.portrait(i as 0 | 1, c.toDataURL('image/jpeg', 0.85));
    });
    cam.position.copy(was.p);
    cam.quaternion.copy(was.q);
    cam.updateMatrixWorld();
    st.dof.focusDistance = was.fd;
  };
  const advance2 = (pair: [FightInput, FightInput]): void => {
    if (!m) return;
    if (cur) prev = cur;
    stepMatch(m, pair);
    for (const e of m.events) onEvent(e);
    // La nube del súper queda en la tabla: se renueva mientras dura.
    if (m.frame % 12 === 0) for (const z of m.zones) cloud(P3(z.x, z.y), 6, 0xff9424, 0.015, z.r * 0.8, 0.01);
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
  // El cartel del rival queda 2,4 s (antes 0,65 s: no se llegaba a leer).
  const P_CHIZ0 = 8.6;
  const P_VS = 12;
  const P_END = 13;
  /** Cada rival: nombre, cartel y lo que dice en la presentación (con su sonido de voz, para grabar). */
  const RIVALS: Record<number, { name: string; tag: string; lines: { at: number; until: number; text: string; sound: SoundId }[] }> = {
    1: {
      name: 'EL BROCOLOCO',
      tag: 'el vegetal más malo de la mesa',
      lines: [
        { at: 1.1, until: 3.2, text: 'Mmm… huelo a chizito.', sound: 'brocoloco-frase1' },
        { at: 3.5, until: 5.5, text: 'Te voy a dejar hecho polvito… de queso.', sound: 'brocoloco-frase2' },
        { at: 5.75, until: 6.55, text: '¡A LA MESA, BOCADITO!', sound: 'brocoloco-frase3' },
      ],
    },
    2: {
      name: 'HUEVO DURO',
      tag: 'diez minutos de hervor, cero piedad',
      lines: [
        { at: 1.1, until: 4.6, text: 'Diez minutos en agua hirviendo… y salí más duro que nunca.', sound: 'huevo-frase1' },
        { at: 5.75, until: 6.55, text: '¡CUIDADO, QUE ESTE HUEVO RUEDA!', sound: 'huevo-frase3' },
      ],
    },
    3: {
      name: 'MONSTRUO DE QUINOA',
      tag: 'diez mil granos · se rearma solo y te tira metralla',
      lines: [
        { at: 1.1, until: 3.2, text: '¿Un solo chizito? Nosotros somos diez mil.', sound: 'quinoa-frase1' },
        { at: 3.5, until: 5.5, text: 'Pegame. Cada grano que se cae vuelve a su lugar.', sound: 'quinoa-frase2' },
        { at: 5.75, until: 6.55, text: '¡A LLOVER QUINOA!', sound: 'quinoa-frase3' },
      ],
    },
  };
  const rival = (): (typeof RIVALS)[number] => RIVALS[Math.min(3, Math.max(1, level))];
  // Una canción por villano: arranca apenas se entra a la pelea (`public/assets/sounds/musica-brocoloco.mp3`, etc.).
  const SONGS: Record<number, SoundId> = { 1: 'musica-brocoloco', 2: 'musica-huevo', 3: 'musica-quinoa' };
  let song: SoundId | null = null;
  const playSong = (): void => {
    game().audio.censor = censored;
    const want = vs ? 'musica-pelea' : SONGS[Math.min(3, Math.max(1, level))];
    if (want === song) return game().audio.musicOn(true, want);
    game().audio.musicOn(false);
    game().audio.musicOn(true, want);
    song = want;
  };
  let presShake = 0;
  let sickUntil = 0;
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
      // Delante de la cara, a 2,7 cm de su superficie (el radio del cuerpo cambia de rival a rival).
      // Un poco al costado: centrada, la llama tapaba la boca en el primer plano.
      candleProp.position.set(m.f[1].x, GROUND, z0).addScaledVector(n, 0.027 + m.f[1].model.body[0].r).addScaledVector(new THREE.Vector3(-n.z, 0, n.x), 0.014);
      g.stage.scene.add(candleProp);
    }
    const lit = t >= B_LIGHTS;
    const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3 + 1);
    const candleK = t < 0.4 ? 0 : t < B_LIGHTS ? 0.02 * smooth((t - 0.4) / 0.5) * flick : 0.02 * Math.max(0, 1 - (t - B_LIGHTS) * 2) * flick;
    const flame = candleProp.getObjectByName('llama')!;
    flame.visible = t > 0.4 && t < B_LIGHTS + 0.6;
    flame.scale.set(0.0013, 0.0032 * flick, 0.0013);
    set?.candle(flame.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.004, 0)), candleK);
    set?.lights(lit ? Math.min(1, (t - B_LIGHTS) * 6) : 0);
    // ── Carteles y subtítulos ──
    if (t < P_CHIZ0) {
      if (t > B_LIGHTS + 0.6) hud.present(1, rival().name, rival().tag);
      else hud.present(1);
    } else if (t < P_VS) {
      if (t <= P_CHIZ0 + 0.35) hud.present(0);
      else {
        const parts = [`${f0.arms.length} brazo${f0.arms.length === 1 ? '' : 's'}`, `${f0.legs.length} pierna${f0.legs.length === 1 ? '' : 's'}`, `${(f0.model.mass * 1000).toFixed(1).replace('.', ',')} g`];
        hud.present(0, 'TU CHIZITO', parts.join(' · '));
      }
    } else hud.present(2, 'VS', `TU CHIZITO · ${rival().name}`);
    const line = rival().lines.find((l) => t >= l.at && t < l.until);
    hud.sub(line ? rival().name : null, line?.text ?? '');
    rival().lines.forEach((l, i) => once(`frase${i}`, l.at, () => g.audio.play(l.sound, 1)));
    // ── Sonidos y golpes de la parte del brócoli ──
    once('vela', 0.4, () => g.audio.play('vela', 0.8));
    once('focos', B_LIGHTS, () => {
      presShake = 0.004;
      views![1].bump(1);
      hud.flash(0.55);
      g.audio.play('golpe-pesado', 1);
      g.audio.play('rugido', 1);
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
      const fa = m.f[1].model.faceAt ?? { mouth: 0.44, eyes: 0.63 };
      // Distancias desde la SUPERFICIE de la cara (no desde el eje): el huevo y la quinoa son mucho más gordos que el tallo.
      // Además la cara es más grande cuanto más gordo es el cuerpo: la cámara se aleja en proporción (`far`), y apunta y enfoca la
      // SUPERFICIE (con el foco en el eje, la cara del huevo quedaba 2 cm fuera de foco).
      const skin = m.f[1].model.body[0].r;
      const far = 0.035 + 2.2 * skin;
      const mouth = along(1, fa.mouth).addScaledVector(n, skin);
      const eyes = along(1, fa.eyes).addScaledVector(n, skin);
      if (t < 3.4) {
        // La BOCA, muy cerca, a la luz de la vela: un paneo lento de costado y apenas acercándose. Suspenso.
        shot = 'boca';
        const k = smooth(t / 3.4);
        pos = mouth.clone().addScaledVector(n, far - 0.008 * k).addScaledVector(side, 0.012 - 0.02 * k).add(new THREE.Vector3(0, -0.004, 0));
        look = mouth.clone().addScaledVector(side, 0.003 - 0.004 * k);
        rate = 4;
        focal = 58;
        roll = 0.05 - 0.07 * k;
      } else if (t < B_LIGHTS) {
        // Sube despacio de la boca a los ojos.
        shot = 'boca';
        const k = smooth((t - 3.4) / (B_LIGHTS - 3.4));
        pos = mouth.clone().lerp(eyes, k).addScaledVector(n, far * 0.9 + 0.01 * k).addScaledVector(side, -0.008);
        look = mouth.clone().lerp(eyes, k);
        rate = 3;
        focal = 58;
        roll = -0.02;
      } else {
        // ¡Se encienden los focos! La cámara salta atrás: plano entero en contrapicado, torcido.
        shot = 'revela';
        const k = smooth((t - B_LIGHTS) / 0.35);
        pos = along(1, 0.5).addScaledVector(n, 0.126 + skin * 2).addScaledVector(side, 0.03).add(new THREE.Vector3(0, -0.015, 0));
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
        if (!vs) step(readInput());
        else if (!stepVs()) { acc = 0; break; }
      }
      if (m.phase === 'fight') {
        fightT += dt;
        if (fightT > 7) hud.hideKeys();
      }
    }
    const t = m.hitstop > 0 ? 1 : Math.min(1, acc / FIGHT.dt);
    fpK += ((camMode === 2 && !present && m.phase !== 'ko' ? 1 : 0) - fpK) * Math.min(1, raw * 6);
    if (prev && cur) views.forEach((v, i) => {
      const p = present ? presentPose(i as 0 | 1, cur![i]) : blendPose(prev![i], cur![i], t);
      // En primera persona se le saca el 3/4 de la cámara lateral: queda de frente a quien pelea (sólo el dibujo).
      const yaw = p.yaw - fpK * (m!.f[i].model.yaw ?? FIGHT.stanceYaw);
      v.apply({ ...p, yaw, y: p.y + GROUND }, z0, raw);
    });
    set?.update(raw);
    // El foco de cara apunta a la altura de la cara (un tercio del centro a la coronilla), no a la punta de la cabeza.
    if (set) views.forEach((v, i) => set!.track(i as 0 | 1, v.head().lerp(new THREE.Vector3(m!.f[i].x, m!.f[i].y + GROUND, z0), 0.65), m!.f[i].facing));
    // Con los luchadores ya posados en este cuadro (si no, la foto sale del lugar donde estaban antes).
    if (wantPortraits && !present) { wantPortraits = false; portraits(); }
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
    const bro = vs?.theirs ? vs.theirs.model : rivalFighter(level);
    // Otro nivel = otro rival: se cambia también su modelo 3D (antes seguía el brócoli dibujado con el huevo o la quinoa adentro).
    if (!vs && viewLevel !== level) {
      const g = game();
      views[1].dispose();
      views[1] = rivalView(g.stage.scene, bro, level, rivalParts);
      views[1].root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
      });
      viewLevel = level;
    }
    m = createMatch(me() === 0 ? [model, bro] : [bro, model]);
    lg.length = 0;
    ai = newAi(seed++, level);
    hud.me = me();
    hud.show(!vs ? [model.name, bro.name] : me() === 0 ? ['TU CHIZITO', 'TU AMIGO'] : ['TU AMIGO', 'TU CHIZITO'], [...(vs ? [] : [RIVAL_TIP[level - 1] ?? '']).filter(Boolean), ...warnings(m.f[me()])]);
    absorbTips = 0;
    // Cuántas extremidades hay en cada cuadrante del chizito (lo que maneja cada botón).
    const f0 = m.f[me()];
    const count = (q: Quad): number => (q[1] === 'A' ? f0.arms : [...f0.legs, ...f0.pegs]).filter((k) => model!.limbs[k].side === q[0]).length;
    hud.pad({ LA: count('LA'), RA: count('RA'), LL: count('LL'), RL: count('RL') });
    paused = false;
    fightT = 0;
    acc = 0;
    prev = cur = null;
    views.forEach((v) => v.reattach());
    playSong();
    waved = false;
    if (withPresent && !vs) present = { t: 0, pending: [...m.events], fired: new Set() };
    else for (const e of m.events) onEvent(e);
    cur = [poseOf(m.f[0]), poseOf(m.f[1])];
    prev = cur;
    camInit = false;
  };

  /** Lo que hay que saber de cada rival (se dice al empezar: cada uno se pelea distinto). */
  const RIVAL_TIP = [
    'EL BROCOLOCO: si la tabla se agrieta bajo tus pies, salí o saltá (↑): brotan raíces',
    'HUEVO DURO: es gelatina (los golpes seguidos rebotan) y tira cáscaras que quedan en la tabla: no las pises',
    'MONSTRUO DE QUINOA: los golpes rápidos se HUNDEN en sus granos. Mantené Q / W para cargarlos y reventarlo; si junta sus granos, se cura',
  ];
  let absorbTips = 0;
  let healTipAt = 0;
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
      if (f.heavyLoad > 0.4) w.push('Lo que tiene clavado pesa más que el chizito: camina lento, carga lento y si pifia queda girando');
    }
    return w;
  };

  // ── Sala contra un amigo ──
  /** Mi luchador tal como se arma ahora (el frente de la pelea es la CARA que marca la F: +Z del chizito, arriba = su eje largo). */
  const myModel = (): FighterModel => {
    const snap = resolveSnapshot({ construction: game().construction, pieces: deps.pieces, orientation: { front: [...BUILDER_FACE], up: [...DEFAULT_COMBAT_UP] } });
    const f = fighterFromSnapshot(snap, 'TU CHIZITO');
    // El poder de tu chizito: la NUBE DE QUESO (el polvito naranja de su cáscara).
    f.power = 'queso';
    return f;
  };
  /** Arma en la escena el chizito del amigo desde su archivo (validado como cualquier archivo cargado). */
  const buildOther = (g: Game, file: string): { construction: Construction; pivot: THREE.Group } => {
    const { snapshot } = fromCreatureFile(JSON.parse(file), deps.pieces);
    const mk = (type: string, seed: number, params?: Parameters<AssetRegistry['create']>[3]): THREE.Object3D => {
      const o = g.assets.create(type, seed, 'hero', params);
      markHero(o);
      return o;
    };
    const pivot = new THREE.Group();
    pivot.position.copy(g.pivot.position);
    pivot.quaternion.copy(CONFIG.creature.homeRotation);
    const rootType = g.construction.root.data.type;
    pivot.add(mk(rootType, snapshot.rootSeed));
    g.stage.scene.add(pivot);
    const c = new Construction(rootType, snapshot.rootSeed, pivot);
    c.restore(clonePieces(snapshot.pieces), (d) => mk(d.type, d.seed, d.params), (d, parent) => poseFromData(d, deps.pieces.get(d.type), parent));
    return { construction: c, pivot };
  };
  const vsBtn = document.createElement('button');
  vsBtn.id = 'cf-vs';
  vsBtn.textContent = 'INVITAR A UN AMIGO';
  vsBtn.title = 'Pelear contra el chizito de un amigo, cada uno en su compu';
  const card = document.createElement('div');
  card.id = 'cf-room';
  card.hidden = true;
  host.append(vsBtn, card);
  const roomUrl = (room: string): string => `${location.origin}${location.pathname}?sala=${room}`;
  /** Tarjeta de la sala: estado y, para el que invita, el link. */
  const say = (text: string): void => {
    if (!vs) return;
    card.hidden = false;
    card.innerHTML = `<b>PELEA CONTRA UN AMIGO</b><span></span>${vs.me === 0 ? '<input readonly><button data-a="copy">Copiar link</button>' : ''}<button class="alt" data-a="leave">Cerrar sala</button>`;
    card.querySelector('span')!.textContent = text;
    const inp = card.querySelector('input');
    if (inp) inp.value = roomUrl(vs.room);
  };
  card.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).dataset.a;
    if (a === 'copy' && vs) {
      void navigator.clipboard?.writeText(roomUrl(vs.room));
      card.querySelector('input')?.select();
      (e.target as HTMLElement).textContent = '¡Copiado!';
    }
    if (a === 'leave') leaveRoom();
  });
  const leaveRoom = (): void => {
    if (!vs) return;
    const v = vs;
    if (open) controller.close(); // cierra también la sala
    if (vs) {
      v.link?.close();
      vs = null;
      game().interaction.enabled = true;
    }
    card.hidden = true;
    btn.innerHTML = `${SWORDS}PELEAR`;
    btn.disabled = false;
  };
  /** Pelea número `g` de la sala: cuenta de cuadros nueva (se crea ANTES de que puedan llegar entradas del otro). */
  const newGen = (g: number): void => {
    if (!vs) return;
    vs.gen = g;
    if (vs.wait >= 30) hud.sub(null);
    vs.epoch = 0;
    vs.fix = null;
    vs.wait = 0;
    vs.sums = [new Map(), new Map()];
    const v = vs;
    vs.ls = new Lockstep(v.me, (f, i) => v.link?.send({ t: 'in', g, f, i }));
  };
  const tryStart = (): void => {
    if (!vs?.mine || !vs.theirs || !vs.link || open) return;
    newGen(1);
    card.hidden = true;
    void controller.open();
  };
  const onNet = (o: NetMsg): void => {
    if (!vs) return;
    if (o.t === 'me') {
      vs.theirs = { file: o.file, model: o.model };
      if (!vs.mine) say('Tu amigo ya está listo. Terminá tu chizito y apretá PELEAR.');
      tryStart();
    } else if (o.t === 'in') {
      if (o.g === vs.gen) vs.ls?.recv(o.f, o.i);
    } else if (o.t === 'h') {
      if (o.g === vs.gen && o.e === vs.epoch) { vs.sums[1].set(o.f, o.h); checkSums(); }
    } else if (o.t === 'state') {
      if (o.g === vs.gen && vs.me === 1 && o.e > vs.epoch) vs.fix = { n: o.n, e: o.e, s: o.s };
    } else if (o.t === 'again' && o.g > vs.gen) {
      newGen(o.g);
      hud.hideMenu();
      restart();
    }
  };
  const joinRoom = (room: string, who: 0 | 1): void => {
    vs = { room, me: who, link: null, mine: null, theirs: null, ls: null, gen: 0, other: null, sums: [new Map(), new Map()], epoch: 0, fix: null, wait: 0 };
    btn.innerHTML = `${SWORDS}PELEAR CON TU AMIGO`;
    say(who === 0 ? 'Mandale este link a tu amigo. Cuando los dos aprieten PELEAR, arranca.' : 'Te invitaron a pelear. Conectando con tu amigo…');
    openLink(room, who === 0).then((link) => {
      if (vs?.room !== room) return link.close();
      vs.link = link;
      link.on(onNet);
      link.onClose(() => {
        if (vs?.room !== room) return;
        if (open) {
          hud.showMenu('TU AMIGO SE FUE', 'Se cortó la conexión.', [{ a: 'exit', label: 'Volver a armar' }]);
          vs.ls = null;
        } else {
          leaveRoom();
          card.hidden = false;
          card.innerHTML = '<b>PELEA CONTRA UN AMIGO</b>Tu amigo cerró la sala.';
          window.setTimeout(() => { if (!vs) card.hidden = true; }, 4000);
        }
      });
      if (vs.mine) link.send({ t: 'me', ...vs.mine });
      say(vs.mine ? 'Listo. Esperando a que tu amigo apriete PELEAR…' : who === 0 ? 'Tu amigo entró. Cuando los dos aprieten PELEAR, arranca.' : 'Conectado. Armá tu chizito y apretá PELEAR.');
      tryStart();
    }, (err) => {
      console.warn('[pelea] sala', err);
      if (vs?.room !== room) return;
      say(who === 0 ? 'No se pudo abrir la sala (¿sin internet?). Cerrala y probá de nuevo.' : 'No se encontró la sala: pedile a tu amigo un link nuevo.');
    });
  };
  /** PELEAR dentro de una sala: fija mi chizito (no se edita más), lo manda y espera al otro. */
  const readyUp = (): void => {
    if (!vs || vs.mine) return;
    const g = game();
    for (let k = 0; k < 2; k++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    // Los dos lados simulan con el modelo pasado por JSON (idéntico bit a bit: JSON no distingue −0 de 0).
    vs.mine = { file: g.persistence.toJSON(), model: JSON.parse(JSON.stringify(myModel())) as FighterModel };
    g.interaction.enabled = false;
    btn.disabled = true;
    vs.link?.send({ t: 'me', ...vs.mine });
    say(vs.link ? 'Listo. Esperando a que tu amigo apriete PELEAR…' : 'Listo. Esperando a que tu amigo entre con el link…');
    tryStart();
  };
  /** Revancha: contra un amigo, los dos lados arrancan la pelea siguiente. */
  const again = (): void => {
    if (vs) {
      if (!vs.ls) return;
      newGen(vs.gen + 1);
      vs.link?.send({ t: 'again', g: vs.gen });
      hud.hideMenu();
    }
    restart(level);
  };
  vsBtn.addEventListener('click', () => { if (!vs) joinRoom(newRoom(), 0); });
  {
    const room = new URLSearchParams(location.search).get('sala');
    if (room && /^[a-z0-9-]{4,40}$/.test(room)) joinRoom(room, new URLSearchParams(location.search).has('anfitrion') ? 0 : 1);
  }

  const pause = (on: boolean, controls = false): void => {
    if (!m || m.phase === 'over') return;
    // Contra un amigo no se congela (el otro sigue): sólo se abre el menú.
    paused = on && !vs;
    keys.clear();
    if (on) hud.showMenu(controls ? 'CONTROLES' : vs ? 'MENÚ' : 'PAUSA', vs ? 'La pelea sigue: tu amigo te espera.' : 'La pelea está congelada.', vs ? [{ a: 'resume', label: 'Seguir' }, { a: 'exit', label: 'Salir de la sala', alt: true }] : [
      { a: 'resume', label: 'Seguir' },
      { a: 'again', label: 'Revancha', alt: true },
      { a: 'exit', label: 'Volver a armar', alt: true },
    ], true);
    else hud.hideMenu();
  };

  hud.onControls = () => {
    if (!paused) pause(true, true);
  };
  // Censura: se recuerda en este navegador.
  let censored = false;
  try {
    censored = localStorage.getItem('chizito-censura') === '1';
  } catch {
    /* sin almacenamiento */
  }
  hud.setCensor(censored);
  hud.onCensor = (on) => {
    censored = on;
    game().audio.censor = on;
    try {
      localStorage.setItem('chizito-censura', on ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  };
  hud.onMenu = (a) => {
    if (a === 'resume') pause(false);
    if (a === 'again') again();
    if (a === 'next') {
      // Rival nuevo: con su presentación (apagón, vela, sus frases), como el primero. La música vuelve con los focos.
      const withPresent = wantsPresent();
      restart(level + 1, withPresent);
    }
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
      if (e.code === 'Escape' && (paused || (vs && m?.phase !== 'over'))) pause(false);
      else if (!e.repeat) hud.menuKey(e.code);
      return;
    }
    if (present) return endPresent();
    if (e.code === 'Escape') return pause(true);
    if (e.code === 'KeyV' && !e.repeat) {
      camMode = (camMode + 1) % 3;
      fpInit = false;
      if (m) hud.popup(m.f[camMode === 2 ? 1 - me() : me()].x, m.f[me()].y + 0.07, ['CÁMARA LATERAL', 'CÁMARA AÉREA', 'PRIMERA PERSONA'][camMode], '', 'hint');
      return;
    }
    if (e.code === 'KeyR' && m?.phase === 'over') return again();
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
  const poll = window.setInterval(() => {
    btn.hidden = open || game().rig.inIntro;
    vsBtn.hidden = btn.hidden || !!vs;
    if (btn.hidden && !open) card.hidden = true;
    else if (vs && !open && !(vs.mine && vs.theirs && vs.link) && card.innerHTML) card.hidden = false;
  }, 300);

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
      // Los rivales de los niveles 2 y 3 también entran al ensayo (sus materiales se compilan antes).
      const egg = createEgg();
      const quinoa = createQuinoa();
      await idle();
      const g = game();
      await prewarmFight(g.stage, g.pivot.position.z, [bro, egg, quinoa], [g.pivot]);
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
      const mine = vs?.mine?.model ?? myModel();
      // Con presentación, primero se apagan las luces de la fiesta (todo lo que sigue se arma a oscuras).
      if (wantsPresent() && !vs) await blackout();
      // Si el ensayo no terminó (se apretó PELEAR enseguida), termina ya, sin esperar ratos libres.
      hurryUp();
      await prewarm();
      const parts = await loadBroccoliParts();
      rivalParts = parts;
      viewLevel = level;
      model = mine;
      z0 = g.pivot.position.z;
      saved = { pos: g.stage.camera.position.clone(), quat: g.stage.camera.quaternion.clone(), focal: g.stage.camera.getFocalLength(), enabled: g.interaction.enabled };
      g.interaction.enabled = false;
      g.interaction.hideFront();
      const myView = creatureView(g.construction, g.pivot, model, g.stage.renderer);
      if (vs?.theirs) {
        // Contra un amigo: su chizito se arma desde su archivo y se mueve con el modelo que él mandó.
        const o = buildOther(g, vs.theirs.file);
        vs.other = o.pivot;
        const theirView = creatureView(o.construction, o.pivot, vs.theirs.model, g.stage.renderer);
        views = vs.me === 0 ? [myView, theirView] : [theirView, myView];
      } else views = [myView, rivalView(g.stage.scene, rivalFighter(level), level, parts)];
      crumbs = [new Crumbs(g.stage.scene, '#f2c95a'), new Crumbs(g.stage.scene, vs ? '#f2c95a' : '#5c9a35')];
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
      restart(level, wantsPresent() && !vs);
      // Sin presentación, la cámara viaja del constructor a la pelea; con presentación, la primera toma entra al corte.
      tween = present ? null : { t: 0, from: { pos: saved.pos.clone(), quat: saved.quat.clone() } };
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
      song = null;
      // Volver a armar: la próxima pelea empieza otra vez por el primer rival (antes seguía el nivel en el que se salió).
      level = startLevel;
      delete (g.stage as { render?: unknown }).render;
      views?.forEach((v) => v.dispose());
      views = null;
      // Salir de la pelea contra un amigo cierra la sala (el otro ve "tu amigo se fue").
      const wasVs = vs;
      if (wasVs) {
        wasVs.other?.removeFromParent();
        wasVs.link?.close();
        vs = null;
        card.hidden = true;
        btn.innerHTML = `${SWORDS}PELEAR`;
        btn.disabled = false;
      }
      set?.restore();
      game().stage.aberration.offset.set(0, 0);
      set = null;
      crumbs?.forEach((c) => c.clear());
      crumbs = null;
      chips?.clear();
      chips = null;
      pfx?.dispose();
      pfx = null;
      for (const g of shotMeshes.values()) g.removeFromParent();
      shotMeshes.clear();
      for (const g of groundMeshes.values()) g.removeFromParent();
      groundMeshes.clear();
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
        g.interaction.enabled = saved.enabled || !!wasVs;
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
      vsBtn.remove();
      card.remove();
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
  // Sin cara no se pelea: hay que dibujarle un rostro con el ketchup (el diseño es libre, pero el ketchup es obligatorio).
  const nag = document.createElement('div');
  nag.id = 'cf-nag';
  nag.textContent = '¡Usá el ketchup para dibujarle un rostro!';
  host.append(nag);
  let nagT = 0;
  btn.addEventListener('click', () => {
    const hasFace = [...game().construction.nodes.values()].some((n) => n.data.type === 'ketchup');
    if (!hasFace) {
      nag.classList.remove('on');
      void nag.offsetWidth; // vuelve a saltar en cada clic
      nag.classList.add('on');
      window.clearTimeout(nagT);
      nagT = window.setTimeout(() => nag.classList.remove('on'), 3800);
      return;
    }
    nag.classList.remove('on');
    if (vs) readyUp();
    else void controller.open();
  });
  return controller;
}
