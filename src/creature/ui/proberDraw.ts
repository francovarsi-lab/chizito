import { CREATURE_CONFIG } from '../config';
import type { Pose, SimPlan, SimState } from '../sim';
import type { CreatureAnalysis, Shape2D } from '../types';
import { CORE_COLOR, ROLE_COLOR } from './colors';

export interface ProberView {
  w: number;
  h: number;
  /** px por metro. */
  scale: number;
  /** m: x del mundo que queda en el centro. */
  camX: number;
}

/** Escala (px/m) para que la criatura mida `creaturePx` de alto en pantalla. */
export function viewScale(a: CreatureAnalysis, cfg = CREATURE_CONFIG): number {
  const b = a.profile2D.bounds;
  const size = Math.max(b.max[1] - b.min[1], (b.max[0] - b.min[0]) * (cfg.prober.creaturePx / cfg.prober.width), cfg.profile.minShapeThickness);
  return cfg.prober.creaturePx / size;
}

type Ctx = CanvasRenderingContext2D;

function drawShapes(ctx: Ctx, shapes: Shape2D[], X: (x: number) => number, Y: (y: number) => number, scale: number, color: string, min: number): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (const s of shapes) {
    if (s.kind === 'capsule') {
      ctx.lineWidth = Math.max(min, s.r * 2 * scale);
      ctx.beginPath();
      ctx.moveTo(X(s.a[0]), Y(s.a[1]));
      ctx.lineTo(X(s.b[0]), Y(s.b[1]));
      ctx.stroke();
    } else {
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * Dibuja el probador: pared, piso con perspectiva lateral (franja con filas que se acercan y marcas que corren con la cámara,
 * convergiendo a un punto de fuga), la sombra, la criatura posada (cuerpo y extremidades por rol), los contactos con el piso,
 * la caja de golpe activa y el aro de la guardia.
 */
export function drawProber(ctx: Ctx, view: ProberView, a: CreatureAnalysis, plan: SimPlan, st: SimState, pose: Pose, cfg = CREATURE_CONFIG): void {
  const pc = cfg.prober;
  const { w, h, scale, camX } = view;
  const floorY = h * pc.floorLine;
  const cx = w / 2;
  const X = (x: number): number => cx + (x - camX) * scale;
  const Y = (y: number): number => floorY - y * scale;

  // Pared y piso.
  const wall = ctx.createLinearGradient(0, 0, 0, floorY);
  wall.addColorStop(0, '#fdeadf');
  wall.addColorStop(1, '#fff7ee');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, floorY);
  ctx.fillStyle = '#f2cfae';
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.strokeStyle = '#e0b48c';
  ctx.lineWidth = 1;
  const vpY = floorY - pc.floorHeight;
  const first = Math.floor((camX - cx / scale) / pc.tickSpacing);
  const last = Math.ceil((camX + cx / scale) / pc.tickSpacing);
  ctx.beginPath();
  for (let i = first; i <= last; i++) {
    const sx = X(i * pc.tickSpacing);
    const t = (h - vpY) / (floorY - vpY);
    ctx.moveTo(sx, floorY);
    ctx.lineTo(cx + (sx - cx) * t, h);
  }
  for (let r = 1; r <= pc.floorRows; r++) {
    const y = floorY + ((h - floorY) * r * r) / (pc.floorRows * pc.floorRows);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(w, floorY);
  ctx.stroke();

  // Sombra (más chica y clara cuanto más alto está).
  const b = a.profile2D.bounds;
  const air = Math.min(1, st.h / Math.max(a.locomotion.jump, cfg.profile.minShapeThickness));
  ctx.fillStyle = `rgba(90, 60, 40, ${0.28 - 0.14 * air})`;
  ctx.beginPath();
  ctx.ellipse(X(st.x), floorY + (h - floorY) * (1 / cfg.prober.floorRows), ((b.max[0] - b.min[0]) * scale * (1 - 0.3 * air)) / 2, (h - floorY) / (cfg.prober.floorRows * 2), 0, 0, Math.PI * 2);
  ctx.fill();

  // La criatura: cuerpo y extremidades.
  drawShapes(ctx, pose.body, X, Y, scale, CORE_COLOR, pc.minStroke);
  for (const l of pose.limbs) {
    const limb = a.limbs.find((q) => q.id === l.id);
    drawShapes(ctx, l.shapes, X, Y, scale, ROLE_COLOR[limb?.dominant ?? 'none'], pc.minStroke);
  }
  // Contactos con el piso.
  ctx.fillStyle = '#e53935';
  for (const l of pose.limbs) {
    if (!l.contact) continue;
    let low: [number, number] | null = null;
    for (const s of l.shapes) for (const q of s.kind === 'capsule' ? [s.a, s.b] : s.pts) if (!low || q[1] < low[1]) low = [q[0], q[1]];
    if (low) {
      ctx.beginPath();
      ctx.arc(X(low[0]), floorY, pc.minStroke * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Guardia: aro azul que crece con la guardia.
  const guard = cfg.sim.guardFrames > 0 ? st.combat.guard / cfg.sim.guardFrames : 0;
  if (guard > 0) {
    ctx.strokeStyle = `rgba(30, 136, 229, ${guard})`;
    ctx.lineWidth = pc.minStroke * 2;
    ctx.beginPath();
    ctx.arc(X(st.x), Y(plan.comHeight + st.h), Math.max(...[b.max[0] - b.min[0], b.max[1] - b.min[1]]) * scale * guard, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Caja de golpe activa.
  if (pose.hitbox) {
    ctx.fillStyle = 'rgba(229, 57, 53, 0.35)';
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = pc.minStroke;
    ctx.beginPath();
    ctx.arc(X(pose.hitbox.center[0]), Y(pose.hitbox.center[1]), pose.hitbox.r * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
