import { CREATURE_CONFIG } from '../config';
import type { AttackAction, CreatureAnalysis, Limb } from '../types';
import type { Ctx } from './context';

type Kind = AttackAction['kind'];
type Input = AttackAction['input'];

/** Entrada que le toca a cada tipo de acción (flechas + el botón de ataque). */
const SLOT: Record<Kind, Input> = {
  jab: 'attack',
  estocada: 'forward+attack',
  'golpe-alto': 'up+attack',
  barrida: 'down+attack',
  mazazo: 'hold+attack',
  rodada: 'attack',
  embestida: 'attack',
};

/**
 * Tipo de golpe de una extremidad, o null si no golpea (no llega al mínimo, o apunta hacia atrás):
 *  maza → mazazo · al frente: estocada (vara larga) o jab · alta → golpe alto · baja → barrida.
 * Una extremidad en profundidad puede girar al plano: se clasifica por su inclinación vertical (golpe alto, barrida) y, con poca
 * inclinación, igual que las normales: estocada si es una vara larga, jab si no.
 */
export function classifyStrike(l: Limb, cfg = CREATURE_CONFIG): Kind | null {
  if (l.caps.strike < cfg.capabilities.minRole) return null;
  return limbStrikeKind(l, cfg);
}

/** Tipo de golpe de una extremidad por su dirección, forma y largo (sin mirar si la capacidad alcanza). */
export function limbStrikeKind(l: Limb, cfg = CREATURE_CONFIG): Kind | null {
  return strikeKindOf({ tag: l.tag, length: l.length, angleDeg: l.profile.angleDeg, inDepth: l.profile.inDepth, dy: l.profile.tip[1] - l.profile.pivot[1] }, cfg);
}

/** Tipo de golpe por dirección, forma y largo (sin mirar si la capacidad alcanza). null = apunta hacia atrás. */
export function strikeKindOf(l: { tag: Limb['tag']; length: number; angleDeg: number; inDepth: boolean; dy: number }, cfg = CREATURE_CONFIG): Kind | null {
  const a = cfg.actions;
  if (l.tag === 'maza') return 'mazazo';
  if (l.inDepth) {
    if (l.dy > a.verticalRatio * l.length) return 'golpe-alto';
    if (l.dy < -a.verticalRatio * l.length) return 'barrida';
    return l.length >= a.longRodMin ? 'estocada' : 'jab';
  }
  const abs = Math.abs(l.angleDeg);
  if (abs <= cfg.capabilities.strikeFrontDeg) return l.length >= a.longRodMin ? 'estocada' : 'jab';
  if (abs <= cfg.capabilities.strikeArcDeg) return l.angleDeg > 0 ? 'golpe-alto' : 'barrida';
  return null;
}

/**
 * Acciones ofensivas, DERIVADAS de lo que hay (nunca inventadas). Una por entrada:
 *  ataque ← jab · → + ataque ← estocada · ↑ + ataque ← golpe alto · ↓ + ataque ← barrida · ataque mantenido ← mazazo.
 * Si la criatura rueda, la rodada es su ataque. Si no queda ninguna acción en "ataque", el cuerpo embiste
 * (siempre hay un ataque, salvo que ya ruede).
 */
export function computeActions(ctx: Ctx, limbs: Limb[], mode: CreatureAnalysis['locomotion']['mode']): AttackAction[] {
  const { cfg } = ctx;
  const ac = cfg.actions;
  const massRef = cfg.mobility.limbMassRef;
  const frames = (massNorm: number, active: number) => {
    const startup = Math.round(ac.startupBase + ac.startupPerMass * Math.min(massNorm, ac.maxMassNorm));
    return { startup, active, recovery: ac.recoveryBase + Math.round(startup / 2) };
  };
  const coreShape = ctx.pieces.get(ctx.s.coreId)?.shape;
  const coreR = coreShape && coreShape.kind === 'capsule' ? coreShape.radius : cfg.strength.refRadius;

  // Mejor extremidad de cada tipo (mayor capacidad de golpe; a igual, la más liviana).
  const best = new Map<Kind, { limb: Limb; score: number }>();
  for (const l of limbs) {
    const kind = classifyStrike(l, cfg);
    if (!kind) continue;
    const cur = best.get(kind);
    if (!cur || l.caps.strike > cur.score || (l.caps.strike === cur.score && l.mass < cur.limb.mass)) best.set(kind, { limb: l, score: l.caps.strike });
  }
  const actions: AttackAction[] = [];
  const taken = new Set<Input>();
  for (const [kind, { limb }] of best) {
    const massNorm = limb.mass / massRef;
    const root = ctx.pieces.get(limb.rootPieceId);
    const rodR = root && root.shape.kind === 'capsule' ? root.shape.radius : cfg.strength.refRadius;
    let radius = rodR;
    if (kind === 'mazazo') {
      for (const id of limb.pieceIds) {
        const p = ctx.pieces.get(id);
        if (p && !p.cosmetic && p.shape.kind === 'capsule') radius = Math.max(radius, p.shape.radius);
      }
    }
    const input = SLOT[kind];
    taken.add(input);
    actions.push({
      id: `action:${kind}:${limb.id}`,
      kind,
      limbId: limb.id,
      input,
      ...frames(massNorm, ac.activeFrames),
      damage: ac.damageBase * ac.kindDamage[kind] * limb.caps.strike * (1 + ac.damageMassGain * Math.min(massNorm, ac.maxMassNorm)),
      reach: limb.length,
      hitRadius: Math.max(radius * ac.hitRadiusMult, ac.hitRadiusMin),
    });
  }

  // El cuerpo se mide contra la masa de referencia del cuerpo (no la de una extremidad).
  const bodyNorm = ctx.mass.total / cfg.locomotion.massRef;
  if (mode === 'roll') {
    const input = (['attack', 'forward+attack', 'hold+attack'] as Input[]).find((i) => !taken.has(i)) ?? 'attack';
    const reach = Math.max(0, ...limbs.map((l) => l.length));
    actions.push({
      id: 'action:rodada:body',
      kind: 'rodada',
      input,
      ...frames(bodyNorm, ac.rollActiveFrames),
      damage: ac.damageBase * ac.kindDamage.rodada * (1 + ac.damageMassGain * Math.min(bodyNorm, ac.maxMassNorm)),
      reach: coreR + reach,
      hitRadius: coreR + reach,
    });
  } else if (!taken.has('attack')) {
    actions.push({
      id: 'action:embestida:body',
      kind: 'embestida',
      input: 'attack',
      ...frames(bodyNorm, ac.activeFrames),
      damage: ac.damageBase * ac.kindDamage.embestida * (1 + ac.damageMassGain * Math.min(bodyNorm, ac.maxMassNorm)),
      reach: coreR,
      hitRadius: coreR,
    });
  }
  return actions;
}

/** Defensa: guardia con la mejor extremidad (o placa) al frente; sin ninguna, el cuerpo se encoge. */
export function computeDefense(ctx: Ctx, limbs: Limb[]): CreatureAnalysis['defense'] {
  const df = ctx.cfg.defense;
  let top: Limb | null = null;
  for (const l of limbs) if (l.caps.defend >= ctx.cfg.capabilities.minRole && (!top || l.caps.defend > top.caps.defend)) top = l;
  if (top) return { kind: 'guard', limbId: top.id, reduction: df.guardMax * top.caps.defend };
  return { kind: 'curl', reduction: df.curlReduction };
}
