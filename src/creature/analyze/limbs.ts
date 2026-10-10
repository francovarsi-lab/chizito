import { clamp, deg, dist, dot, len, norm, rad, sub } from '../math/vec';
import { add2, rot2, sub2 } from '../math/vec';
import { toProfile } from '../math/basis';
import { overlap2D } from '../math/shapes2d';
import type { Caps, Limb, LimbDraft, Role, V2 } from '../types';
import type { Ctx } from './context';

const ROLE_ORDER: Role[] = ['strike', 'support', 'push', 'defend'];

/** Cuántas otras extremidades (no su hermana) tiene pegadas: pivote cerca y apuntando parecido. */
function crowdOf(d: LimbDraft, all: LimbDraft[], ctx: Ctx): number {
  const { crowdRadius, crowdAngleDeg } = ctx.cfg.mobility;
  const axis = norm(sub(d.tip, d.pivot));
  let n = 0;
  for (const o of all) {
    if (o === d || o.id === d.pairedWith) continue;
    if (dist(o.pivot, d.pivot) > crowdRadius) continue;
    const c = clamp(dot(axis, norm(sub(o.tip, o.pivot))), -1, 1);
    if (deg(Math.acos(c)) < crowdAngleDeg) n++;
  }
  return n;
}

/** Completa cada extremidad detectada con su geometría de perfil, capacidades, fuerza y movilidad. */
export function completeLimbs(ctx: Ctx, drafts: LimbDraft[]): Limb[] {
  const { cfg, basis } = ctx;
  const cap = cfg.capabilities;
  const st = cfg.strength;
  const mo = cfg.mobility;
  const g = cfg.locomotion.gravity;
  const comX = ctx.mass.comProfile[0];

  return drafts.map((d) => {
    const root = ctx.pieces.get(d.rootPieceId);
    const r = root && root.shape.kind === 'capsule' ? root.shape.radius : st.refRadius;
    const v = sub(d.tip, d.pivot);
    const len3 = Math.max(len(v), 1e-9);
    const x = dot(v, basis.f);
    const y = dot(v, basis.u);
    const len2 = Math.hypot(x, y);
    const angleDeg = deg(Math.atan2(y, x));
    const foreshortening = len2 / len3;
    const inDepth = foreshortening < cfg.profile.inDepthMaxRatio;
    const pivot2 = toProfile(basis, d.pivot);
    const tip2 = toProfile(basis, d.tip);
    const q = d.anchorQuality;
    const crowdFactor = 1 / (1 + crowdOf(d, drafts, ctx));

    // ── capacidades ──
    const absA = Math.abs(angleDeg);
    const dirFactor = inDepth ? cap.inDepthStrikeFactor : absA <= cap.strikeFrontDeg ? 1 : absA <= cap.strikeArcDeg ? cap.strikeArcFactor : cap.strikeBackFactor;
    const bias = inDepth ? 1 : 1 + cap.anthropoBias * Math.sin(rad(angleDeg));
    const strike = clamp(dirFactor * Math.min(1, len3 / cap.strikeRefLen) * q * crowdFactor * bias, 0, 1);
    const down = clamp(-y / len3, 0, 1);
    const grounded = tip2[1] - r <= ctx.floorY + cap.groundTolRatio * ctx.height;
    const support = down >= cap.supportMinDown && grounded ? clamp(down * q, 0, 1) : 0;
    const push = support * (cap.pushBase + cap.pushGain * clamp(Math.abs(tip2[0] - comX) / len3, 0, 1));
    const reach = clamp(len3 / cap.reachRef, 0, 1);
    const defend = inDepth ? cap.defendDepthFactor * q : Math.max(0, Math.cos(rad(angleDeg))) * q * Math.min(1, len3 / cap.defendRefLen) * cap.defendScale;
    const caps: Caps = { support, push, strike, reach, defend };
    let dominant: Role | null = null;
    let top = 0;
    for (const role of ROLE_ORDER) {
      if (caps[role] >= cap.minRole && caps[role] > top) {
        dominant = role;
        top = caps[role];
      }
    }
    if (dominant === null && reach >= cap.minRole) dominant = 'reach';

    // ── fuerza y resistencia ──
    const strength = clamp((r / st.refRadius) ** 2 * (st.refFree / len3), 0, 1) * q * st.material;
    const durability = st.baseHp * (r / st.refRadius) ** 2 * (1 - st.jointShare + st.jointShare * q);

    // ── movilidad ──
    const massFactor = 1 / (1 + d.mass / mo.limbMassRef);
    const swing = mo.swingDeg * q * massFactor * crowdFactor;
    const droops = d.mass * g * (len3 / 2) > mo.anchorMomentK * r ** 3 * q;
    let plus = swing / 2;
    let minus = swing / 2;
    if (!inDepth && ctx.core2D) {
      plus = clipSwing(pivot2, tip2, r, +1, swing / 2, ctx);
      minus = clipSwing(pivot2, tip2, r, -1, swing / 2, ctx);
    }
    let maxDeg = angleDeg + plus;
    const minDeg = angleDeg - minus;
    if (droops) maxDeg = Math.min(maxDeg, angleDeg);

    return {
      id: d.id,
      rootPieceId: d.rootPieceId,
      end: d.end,
      pieceIds: d.pieceIds,
      ...(d.pairedWith ? { pairedWith: d.pairedWith } : {}),
      pivot: d.pivot,
      tip: d.tip,
      length: len3,
      mass: d.mass,
      endMassRatio: d.endMassRatio,
      tag: d.tag,
      caps,
      dominant,
      reach: len3,
      strength,
      durability,
      anchorQuality: q,
      mobility: { restDeg: angleDeg, minDeg, maxDeg, droops },
      profile: { pivot: pivot2, tip: tip2, angleDeg, length2D: len2, foreshortening, inDepth },
    };
  });
}

/** Cuánto (grados) puede girar la punta hacia un lado antes de entrar en el cuerpo. */
function clipSwing(pivot: V2, tip: V2, r: number, dir: 1 | -1, limit: number, ctx: Ctx): number {
  const step = ctx.cfg.mobility.clipStepDeg;
  const angles: number[] = [];
  for (let a = step; a < limit; a += step) angles.push(a);
  angles.push(limit);
  let ok = 0;
  for (const a of angles) {
    const p = add2(rot2(sub2(tip, pivot), dir * rad(a)), pivot);
    if (overlap2D({ kind: 'capsule', a: p, b: p, r }, ctx.core2D!)) break;
    ok = a;
  }
  return ok;
}

