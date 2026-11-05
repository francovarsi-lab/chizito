import type { FightEvent, FightState, Fighter } from './rules';
import type { Shape2D } from '../types';

type Ctx = CanvasRenderingContext2D;
const INK = '#1a0d08';
const TAU = Math.PI * 2;

export interface Look {
  body: string;
  /** Color de una extremidad (por rol dominante). */
  limb: (dominant: string) => string;
  name: string;
}

export const PLAYER_LOOK: Look = { body: '#ffd21f', limb: () => '#d9a45e', name: 'TU CRIATURA' };
/** Rival vegetal: cuerpo = brócoli, piernas = apio, brazos = zanahoria. */
export const BROCCOLI_LOOK: Look = { body: '#3fae49', limb: (d) => (d === 'support' ? '#a8d86a' : '#f58a24'), name: 'BRÓCOLI' };

export interface Fx {
  sparks: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string }[];
  pops: { x: number; y: number; life: number; text: string; c: string }[];
  shake: number;
  flash: number;
  /** Vida mostrada con retraso (para la barra de "daño reciente"). */
  chip: [number, number];
}
export const newFx = (): Fx => ({ sparks: [], pops: [], shake: 0, flash: 0, chip: [100, 100] });

export interface View {
  w: number;
  h: number;
  scale: number;
  floorY: number;
}
export function makeView(w: number, h: number): View {
  return { w, h, scale: Math.min(w / 0.46, h / 0.2), floorY: Math.round(h * 0.7) };
}

// ───────────── Fondo (se arma una vez por tamaño) ─────────────
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PARTY = ['#ffd21f', '#ff3d6e', '#17c9a4', '#3aa0ff', '#ff8a24', '#b06bff'];

export function buildBackground(v: View): HTMLCanvasElement {
  const { w, h, floorY } = v;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as Ctx;
  const r = rand(11);
  // Pared: azul noche con un resplandor cálido detrás de la mesa.
  let lg = g.createLinearGradient(0, 0, 0, floorY);
  lg.addColorStop(0, '#0b1533');
  lg.addColorStop(0.6, '#1f3f86');
  lg.addColorStop(1, '#4a78d6');
  g.fillStyle = lg;
  g.fillRect(0, 0, w, floorY);
  const glow = g.createRadialGradient(w / 2, floorY * 0.78, 0, w / 2, floorY * 0.78, w * 0.55);
  glow.addColorStop(0, 'rgba(255,196,120,.55)');
  glow.addColorStop(0.5, 'rgba(255,150,110,.16)');
  glow.addColorStop(1, 'rgba(255,150,110,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, floorY);
  // Luces fuera de foco (bokeh).
  g.globalCompositeOperation = 'screen';
  for (let i = 0; i < 46; i++) {
    const x = r() * w;
    const y = r() * floorY * 0.95;
    const rad = 10 + r() * 46;
    const col = PARTY[Math.floor(r() * PARTY.length)];
    const bg = g.createRadialGradient(x, y, rad * 0.55, x, y, rad);
    bg.addColorStop(0, col + '38');
    bg.addColorStop(0.85, col + '30');
    bg.addColorStop(1, col + '00');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(x, y, rad, 0, TAU);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // Guirnaldas de banderines, desenfocadas.
  g.filter = 'blur(2.5px)';
  for (const [y0, sag, off] of [[0.08, 0.1, 0], [0.2, 0.08, 0.5]] as const) {
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = t * w * 1.04 - w * 0.02;
      const y = floorY * (y0 + sag * Math.sin(Math.PI * ((t + off) % 1)));
      g.fillStyle = PARTY[(i + (off ? 3 : 0)) % PARTY.length];
      g.beginPath();
      g.moveTo(x - 16, y);
      g.lineTo(x + 16, y);
      g.lineTo(x, y + 44);
      g.closePath();
      g.fill();
    }
  }
  // Globos grandes al costado.
  for (const [bx, by, col] of [[0.07, 0.34, '#ff3d6e'], [0.13, 0.5, '#ffd21f'], [0.93, 0.36, '#3aa0ff'], [0.87, 0.52, '#17c9a4']] as const) {
    const x = bx * w;
    const y = by * floorY;
    const rr = floorY * 0.13;
    const bgr = g.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.1, x, y, rr);
    bgr.addColorStop(0, '#ffffffaa');
    bgr.addColorStop(0.25, col);
    bgr.addColorStop(1, col + 'aa');
    g.fillStyle = bgr;
    g.beginPath();
    g.ellipse(x, y, rr * 0.86, rr, 0, 0, TAU);
    g.fill();
  }
  g.filter = 'none';
  // Rayos de luz.
  g.globalCompositeOperation = 'screen';
  for (let i = 0; i < 3; i++) {
    const x0 = w * (0.58 + i * 0.1);
    const rg = g.createLinearGradient(x0, 0, x0 - w * 0.2, floorY);
    rg.addColorStop(0, 'rgba(255,230,190,.16)');
    rg.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(x0, 0);
    g.lineTo(x0 + w * 0.07, 0);
    g.lineTo(x0 - w * 0.12, floorY);
    g.lineTo(x0 - w * 0.26, floorY);
    g.closePath();
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // Mesa: mantel celeste brillante con confeti y brillo en el borde.
  lg = g.createLinearGradient(0, floorY, 0, h);
  lg.addColorStop(0, '#5fd4ff');
  lg.addColorStop(0.35, '#1fa2ee');
  lg.addColorStop(1, '#0a5fb0');
  g.fillStyle = lg;
  g.fillRect(0, floorY, w, h - floorY);
  const sheen = g.createRadialGradient(w / 2, floorY, 0, w / 2, floorY, w * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,.38)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, floorY, w, (h - floorY) * 0.6);
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillRect(0, floorY - 1, w, 2);
  for (let i = 0; i < 260; i++) {
    const t = r();
    const y = floorY + 6 + t * t * (h - floorY - 8);
    const x = r() * w;
    const s = 1.5 + t * 6;
    g.fillStyle = PARTY[Math.floor(r() * PARTY.length)];
    g.globalAlpha = 0.55 + t * 0.4;
    g.save();
    g.translate(x, y);
    g.rotate(r() * TAU);
    g.fillRect(-s, -s * 0.35, s * 2, s * 0.7);
    g.restore();
  }
  g.globalAlpha = 1;
  // Viñeta.
  const vg = g.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(5,8,20,0)');
  vg.addColorStop(1, 'rgba(5,8,20,.62)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return c;
}

// ───────────── Criaturas ─────────────
function strokeShapes(g: Ctx, shapes: Shape2D[], X: (x: number) => number, Y: (y: number) => number, sc: number, color: string, extra: number, min: number): void {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const s of shapes) {
    if (s.kind === 'capsule') {
      g.lineWidth = Math.max(min, s.r * 2 * sc) + extra;
      g.beginPath();
      g.moveTo(X(s.a[0]), Y(s.a[1]));
      g.lineTo(X(s.b[0]), Y(s.b[1]));
      g.stroke();
    } else {
      g.lineWidth = extra;
      g.beginPath();
      s.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      g.closePath();
      g.fill();
      if (extra) g.stroke();
    }
  }
}

function drawFighter(g: Ctx, v: View, q: Fighter, look: Look, hurt: boolean): void {
  const X = (x: number) => v.w / 2 + x * v.scale;
  const Y = (y: number) => v.floorY - y * v.scale;
  const sc = v.scale;
  const line = Math.max(3, sc * 0.0012);
  // Sombra suave en el mantel.
  const bw = Math.max(0.03, q.half * 2.4) * sc;
  const sh = g.createRadialGradient(X(q.sim.x), v.floorY + 7, 2, X(q.sim.x), v.floorY + 7, bw);
  sh.addColorStop(0, 'rgba(0,20,60,.5)');
  sh.addColorStop(1, 'rgba(0,20,60,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.ellipse(X(q.sim.x), v.floorY + 7, bw, bw * 0.16, 0, 0, TAU);
  g.fill();
  const parts: { shapes: Shape2D[]; color: string }[] = [{ shapes: q.pose.body, color: look.body }];
  for (const l of q.pose.limbs) parts.push({ shapes: l.shapes, color: look.limb(q.an.limbs.find((m) => m.id === l.id)?.dominant ?? 'none') });
  const min = Math.max(5, sc * 0.0022);
  // Contorno primero (todo junto), después relleno y brillo, así las piezas no se tapan los bordes entre sí.
  for (const p of parts) strokeShapes(g, p.shapes, X, Y, sc, INK, line * 2, min);
  for (const p of parts) strokeShapes(g, p.shapes, X, Y, sc, hurt ? '#ffffff' : p.color, 0, min);
  if (!hurt) {
    g.globalAlpha = 0.35;
    for (const p of parts) strokeShapes(g, p.shapes.filter((s) => s.kind === 'capsule').map((s) => ({ ...(s as Extract<Shape2D, { kind: 'capsule' }>), r: (s as Extract<Shape2D, { kind: 'capsule' }>).r * 0.35 })), (x) => X(x), (y) => Y(y) - sc * 0.0016, sc, '#ffffff', 0, 2);
    g.globalAlpha = 1;
  }
  // Guardia: burbuja azul.
  const gd = q.sim.combat.guard / 6;
  if (gd > 0) {
    const rad = Math.max(q.half * 2.2, 0.03) * sc * gd;
    const cx = X(q.sim.x);
    const cy = Y(q.plan.comHeight + q.sim.h);
    const gg = g.createRadialGradient(cx, cy, rad * 0.4, cx, cy, rad);
    gg.addColorStop(0, 'rgba(60,160,255,0)');
    gg.addColorStop(1, `rgba(90,190,255,${0.55 * gd})`);
    g.fillStyle = gg;
    g.beginPath();
    g.arc(cx, cy, rad, 0, TAU);
    g.fill();
    g.strokeStyle = `rgba(200,235,255,${0.9 * gd})`;
    g.lineWidth = 3;
    g.stroke();
  }
}

// ───────────── HUD ─────────────
function outlinedText(g: Ctx, text: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'center'): void {
  g.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(4, size * 0.22);
  g.strokeStyle = INK;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function bar(g: Ctx, v: View, side: 0 | 1, hp: number, chip: number, look: Look): void {
  const bw = Math.min(v.w * 0.38, 560);
  const bh = Math.max(26, v.h * 0.04);
  const x = side === 0 ? v.w * 0.04 : v.w * 0.96 - bw;
  const y = v.h * 0.07;
  const pct = Math.max(0, hp) / 100;
  const cp = Math.max(0, chip) / 100;
  g.save();
  g.translate(x + 5, y + 5);
  g.fillStyle = INK;
  g.beginPath();
  g.roundRect(0, 0, bw, bh, bh / 2);
  g.fill();
  g.restore();
  g.fillStyle = '#fff6df';
  g.beginPath();
  g.roundRect(x, y, bw, bh, bh / 2);
  g.fill();
  g.save();
  g.beginPath();
  g.roundRect(x + 3, y + 3, bw - 6, bh - 6, bh / 2);
  g.clip();
  const iw = bw - 6;
  const fillAt = (p: number, col: string) => {
    g.fillStyle = col;
    if (side === 0) g.fillRect(x + 3, y + 3, iw * p, bh - 6);
    else g.fillRect(x + 3 + iw * (1 - p), y + 3, iw * p, bh - 6);
  };
  fillAt(cp, '#ffffff');
  fillAt(pct, pct > 0.5 ? '#17c964' : pct > 0.25 ? '#ffc21a' : '#ff3d2e');
  g.restore();
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(x, y, bw, bh, bh / 2);
  g.stroke();
  outlinedText(g, look.name, side === 0 ? x + 6 : x + bw - 6, y - bh * 0.55, Math.max(16, bh * 0.62), '#fff6df', side === 0 ? 'left' : 'right');
}

export function addEvents(fx: Fx, v: View, evs: FightEvent[]): void {
  for (const e of evs) {
    const X = v.w / 2 + e.at[0] * v.scale;
    const Y = v.floorY - e.at[1] * v.scale;
    const n = e.blocked ? 8 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 120 + Math.random() * 380;
      fx.sparks.push({ x: X, y: Y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.25 + Math.random() * 0.25, c: e.blocked ? '#9fd8ff' : i % 2 ? '#ffd21f' : '#ffffff' });
    }
    fx.pops.push({ x: X, y: Y - 20, life: 0, text: e.blocked ? `BLOQUEO −${e.damage.toFixed(0)}` : `−${e.damage.toFixed(0)}`, c: e.blocked ? '#9fd8ff' : '#ffffff' });
    fx.shake = Math.max(fx.shake, e.blocked ? 3 : 9);
    fx.flash = e.blocked ? fx.flash : 1;
  }
}

/** Dibuja un cuadro completo. `dt` en segundos (solo para los efectos). */
export function drawFight(g: Ctx, v: View, bg: HTMLCanvasElement, s: FightState, looks: [Look, Look], fx: Fx, dt: number, t: number): void {
  const sx = (Math.random() - 0.5) * fx.shake;
  const sy = (Math.random() - 0.5) * fx.shake;
  fx.shake *= Math.pow(0.001, dt);
  fx.flash = Math.max(0, fx.flash - dt * 6);
  g.save();
  g.translate(sx, sy);
  g.drawImage(bg, 0, 0);
  // Confeti que cae por delante, fuera de foco.
  g.globalAlpha = 0.7;
  for (let i = 0; i < 26; i++) {
    const k = i * 97.13;
    const x = ((k * 13.7 + t * (8 + (i % 5) * 4)) % (v.w + 40)) - 20;
    const y = ((k * 7.3 + t * (26 + (i % 7) * 9)) % (v.h + 40)) - 20;
    g.fillStyle = PARTY[i % PARTY.length];
    g.save();
    g.translate(x, y);
    g.rotate(t * (1 + (i % 4)) + i);
    g.fillRect(-4, -1.6, 8, 3.2);
    g.restore();
  }
  g.globalAlpha = 1;
  // El que está más lejos del centro de pantalla se dibuja primero (no importa mucho: casi no se pisan).
  for (const i of [0, 1] as const) drawFighter(g, v, s.f[i], looks[i], s.f[i].stun > 14);
  // Chispas y números.
  for (const p of fx.sparks) {
    p.life += dt;
    p.vy += 900 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const a = Math.max(0, 1 - p.life / p.max);
    g.globalAlpha = a;
    g.fillStyle = p.c;
    g.beginPath();
    g.arc(p.x, p.y, 2 + 3 * a, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  fx.sparks = fx.sparks.filter((p) => p.life < p.max);
  for (const p of fx.pops) {
    p.life += dt;
    outlinedText(g, p.text, p.x, p.y - p.life * 60, 30, p.c);
  }
  fx.pops = fx.pops.filter((p) => p.life < 0.9);
  g.restore();
  if (fx.flash > 0) {
    g.fillStyle = `rgba(255,255,255,${0.18 * fx.flash})`;
    g.fillRect(0, 0, v.w, v.h);
  }
  // HUD.
  fx.chip[0] += (Math.max(s.f[0].hp, fx.chip[0] - 40 * dt) - fx.chip[0]) * 1;
  fx.chip[1] += (Math.max(s.f[1].hp, fx.chip[1] - 40 * dt) - fx.chip[1]) * 1;
  bar(g, v, 0, s.f[0].hp, fx.chip[0], looks[0]);
  bar(g, v, 1, s.f[1].hp, fx.chip[1], looks[1]);
  outlinedText(g, 'VS', v.w / 2, v.h * 0.07 + Math.max(26, v.h * 0.04) / 2, Math.max(22, v.h * 0.045), '#ffd21f');
  if (s.winner !== null) {
    const txt = s.winner === 'draw' ? '¡EMPATE!' : s.winner === 0 ? '¡GANASTE!' : 'PERDISTE';
    outlinedText(g, 'KO', v.w / 2, v.h * 0.3, v.h * 0.16, '#ff3d2e');
    outlinedText(g, txt, v.w / 2, v.h * 0.43, v.h * 0.07, '#ffd21f');
    outlinedText(g, 'R · revancha     Esc · volver a armar', v.w / 2, v.h * 0.51, Math.max(16, v.h * 0.028), '#fff6df');
  }
}
