import { REASON_TEXT } from '../analyze/warnings';
import { CREATURE_CONFIG } from '../config';
import { INPUT_TEXT, KIND_TEXT, MODE_TEXT, ROLE_TEXT, TAG_TEXT } from '../describe';
import { len, sub } from '../math/vec';
import type { CreatureAnalysis, CreatureSnapshot, DecorativeReason, SnapPiece } from '../types';
import { validateSnapshot } from '../validate';

/**
 * Modelo de datos del panel "ESTRUCTURA DETECTADA": todo lo que se muestra, ya calculado y con texto en castellano. No toca el DOM ni
 * three.js: se prueba en Node y el panel solo lo dibuja.
 */
const nf = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
const mm = (m: number) => m * 1000;

export interface LimbRow {
  id: string;
  n: number;
  /** "1 · palito 3 (cola)". */
  label: string;
  pieceLabel: string;
  end: 'cola' | 'punta';
  roleKey: string;
  role: string;
  tag: string;
  rodMm: number;
  freeMm: number;
  embeddedMm: number;
  tiltDeg: number;
  quality: number;
  massG: number;
  minFreeMm: number;
  minEmbeddedMm: number;
  ok: { free: boolean; embedded: boolean; tilt: boolean; quality: boolean };
  inDepth: boolean;
  droops: boolean;
  paired: boolean;
  /** Piezas de segundo nivel que se mueven con ella. */
  branches: number;
  anchoredBy: string;
}

export interface DecoRow {
  pieceId: string;
  label: string;
  reasonKey: DecorativeReason;
  reason: string;
  massG: number;
  rod: null | {
    rodMm: number;
    freeTailMm: number;
    freeTipMm: number;
    embeddedMm: number;
    tiltDeg: number;
    minFreeMm: number;
    minEmbeddedMm: number;
    freeOk: boolean;
    embeddedOk: boolean;
    tiltOk: boolean;
  };
}

export interface ActionRow {
  kind: string;
  kindText: string;
  input: string;
  inputText: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  reachCm: number;
  /** Extremidad que la hace ("" si es del cuerpo). */
  by: string;
}

export interface Warning {
  kind: 'depth' | 'second-level' | 'unknown-type' | 'decorative' | 'droop' | 'budget' | 'orientation' | 'mode';
  level: 'info' | 'debt' | 'warn';
  text: string;
  /** Piezas o extremidades a las que se refiere. */
  ids: string[];
}

export interface PanelModel {
  core: { label: string; sizeText: string; massG: number };
  budget: { pieces: { n: number; max: number }; strokes: { n: number; max: number } };
  mass: { totalG: number; coreG: number; decorativeG: number; text: string };
  reach: { maxCm: number; strikeCm: number; text: string };
  support: { feet: number; text: string };
  locomotion: { mode: string; text: string };
  limbs: LimbRow[];
  decorative: DecoRow[];
  actions: ActionRow[];
  defense: string;
  warnings: Warning[];
  /** Los umbrales vigentes (se muestran para calibrar). */
  thresholds: string[];
}

const TYPE_NAME: Record<string, string> = {
  chizito: 'chizito',
  palito: 'palito',
  papita: 'papita',
  nacho: 'nacho',
  aceituna: 'aceituna',
  escarbadientes: 'escarbadientes',
  ketchup: 'ketchup',
};

/** Nombres cortos y estables: "palito 3" es el tercer palito en el orden en que se clavaron. */
export function pieceLabels(s: CreatureSnapshot): Map<string, string> {
  const counts = new Map<string, number>();
  const out = new Map<string, string>();
  for (const p of s.pieces) {
    if (p.id === s.coreId) {
      out.set(p.id, 'chizito raíz');
      continue;
    }
    const n = (counts.get(p.type) ?? 0) + 1;
    counts.set(p.type, n);
    const base = p.type === 'chizito' ? 'chizito ensartado' : (TYPE_NAME[p.type] ?? p.type);
    out.set(p.id, `${base} ${n}`);
  }
  return out;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function buildPanelModel(s: CreatureSnapshot, a: CreatureAnalysis, cfg = CREATURE_CONFIG): PanelModel {
  const labels = pieceLabels(s);
  const pieces = new Map<string, SnapPiece>(s.pieces.map((p) => [p.id, p]));
  const lim = cfg.limb;
  const minFreeOf = (rodLen: number) => Math.max(lim.minFreeAbs, lim.minFreeRatio * rodLen);
  const minEmbOf = (rodLen: number) => Math.max(lim.minEmbeddedAbs, lim.minEmbeddedRatio * rodLen);

  const limbs: LimbRow[] = a.limbs.map((l, i) => {
    const end = l.end === 'tip' ? 'punta' : 'cola';
    const minFree = minFreeOf(l.rodLength);
    const minEmb = minEmbOf(l.rodLength);
    return {
      id: l.id,
      n: i + 1,
      label: `${i + 1} · ${labels.get(l.rootPieceId) ?? l.rootPieceId} (${end})`,
      pieceLabel: labels.get(l.rootPieceId) ?? l.rootPieceId,
      end,
      roleKey: l.dominant ?? 'none',
      role: l.dominant ? ROLE_TEXT[l.dominant] : 'sin rol',
      tag: TAG_TEXT[l.tag],
      rodMm: mm(l.rodLength),
      freeMm: mm(l.freeLength),
      embeddedMm: mm(l.embedded),
      tiltDeg: l.tiltDeg,
      quality: l.anchorQuality,
      massG: l.mass * 1000,
      minFreeMm: mm(minFree),
      minEmbeddedMm: mm(minEmb),
      ok: { free: l.freeLength >= minFree, embedded: l.embedded >= minEmb, tilt: l.tiltDeg <= lim.maxTiltDeg, quality: l.anchorQuality >= lim.minAnchorQuality },
      inDepth: l.profile.inDepth,
      droops: l.mobility.droops,
      paired: !!l.pairedWith,
      branches: l.pieceIds.filter((id) => id !== l.rootPieceId && pieces.get(id)?.kind === 'rod').length,
      anchoredBy: l.anchoredBy,
    };
  });

  const decorative: DecoRow[] = a.decorative.map((d) => {
    const det = d.detail;
    return {
      pieceId: d.pieceId,
      label: labels.get(d.pieceId) ?? d.pieceId,
      reasonKey: d.reason,
      reason: REASON_TEXT[d.reason],
      massG: d.mass * 1000,
      rod: det
        ? {
            rodMm: mm(det.rodLength),
            freeTailMm: mm(det.freeTail),
            freeTipMm: mm(det.freeTip),
            embeddedMm: mm(det.embedded),
            tiltDeg: det.tiltDeg,
            minFreeMm: mm(det.minFree),
            minEmbeddedMm: mm(det.minEmbedded),
            freeOk: Math.max(det.freeTail, det.freeTip) >= det.minFree,
            embeddedOk: det.embedded >= det.minEmbedded,
            tiltOk: det.tiltDeg <= lim.maxTiltDeg,
          }
        : null,
    };
  });

  const actions: ActionRow[] = a.actions.map((x) => ({
    kind: x.kind,
    kindText: KIND_TEXT[x.kind],
    input: x.input,
    inputText: INPUT_TEXT[x.input],
    startup: x.startup,
    active: x.active,
    recovery: x.recovery,
    damage: x.damage,
    reachCm: x.reach * 100,
    by: x.limbId ? (limbs.find((l) => l.id === x.limbId)?.label ?? '') : '',
  }));

  const core = pieces.get(s.coreId);
  const coreShape = core && core.shape.kind === 'capsule' ? core.shape : null;
  const coreLen = coreShape ? len(sub(coreShape.b, coreShape.a)) : 0;
  const decoG = a.decorative.reduce((acc, d) => acc + (d.heldBy ? 0 : d.mass), 0) * 1000;
  const maxReach = Math.max(0, ...a.limbs.map((l) => l.length)) * 100;
  const strikeReach = Math.max(0, ...a.actions.filter((x) => x.limbId).map((x) => x.reach)) * 100;
  const sup = a.support;

  const warnings: Warning[] = [];
  const deep = limbs.filter((l) => l.inDepth);
  if (deep.length) {
    const n = deep.length;
    warnings.push({
      kind: 'depth',
      level: 'info',
      text: `${n} ${plural(n, 'extremidad en profundidad', 'extremidades en profundidad')} (${deep.map((l) => l.label).join(', ')}): ${plural(n, 'se ve corta', 'se ven cortas')} en reposo, ${plural(n, 'ataca', 'atacan')} con su largo real al girar al plano`,
      ids: deep.map((l) => l.id),
    });
  }
  const second = decorative.filter((d) => d.reasonKey === 'second-level');
  if (second.length) {
    const n = second.length;
    warnings.push({
      kind: 'second-level',
      level: 'debt',
      text: `${n} ${plural(n, 'palito clavado', 'palitos clavados')} en un chizito montado: en el MVP 0 no ${plural(n, 'cuenta', 'cuentan')} como ${plural(n, 'extremidad propia', 'extremidades propias')} y se ${plural(n, 'mueve', 'mueven')} con su extremidad (deuda del MVP 1)`,
      ids: second.map((d) => d.pieceId),
    });
  }
  const unknown = decorative.filter((d) => d.reasonKey === 'unknown-type');
  if (unknown.length) {
    const n = unknown.length;
    const types = [...new Set(unknown.map((d) => pieces.get(d.pieceId)?.type ?? '?'))].join(', ');
    warnings.push({
      kind: 'unknown-type',
      level: 'warn',
      text: `${n} ${plural(n, 'pieza de tipo desconocido', 'piezas de tipo desconocido')} (${types}) ${plural(n, 'tratada', 'tratadas')} como ${plural(n, 'decorativa', 'decorativas')}: ${plural(n, 'suma', 'suman')} masa, no ${plural(n, 'es extremidad', 'son extremidades')} (falta su perfil)`,
      ids: unknown.map((d) => d.pieceId),
    });
  }
  const others = decorative.filter((d) => !['second-level', 'unknown-type', 'stroke'].includes(d.reasonKey));
  if (others.length) {
    const n = others.length;
    const why = [...new Set(others.map((d) => d.reason))].join('; ');
    warnings.push({ kind: 'decorative', level: 'info', text: `${n} ${plural(n, 'pieza decorativa', 'piezas decorativas')} (${why}): ${plural(n, 'suma', 'suman')} masa, no ${plural(n, 'es extremidad', 'son extremidades')}`, ids: others.map((d) => d.pieceId) });
  }
  const drooping = limbs.filter((l) => l.droops);
  if (drooping.length) warnings.push({ kind: 'droop', level: 'info', text: `${drooping.length} ${plural(drooping.length, 'extremidad cuelga', 'extremidades cuelgan')} por el peso de su punta: solo ${plural(drooping.length, 'puede', 'pueden')} bajar`, ids: drooping.map((l) => l.id) });
  const frac = (n: number, max: number) => n / max;
  if (frac(s.budget.pieceCount, s.budget.maxPieces) >= 0.9) warnings.push({ kind: 'budget', level: 'warn', text: `${s.budget.pieceCount} de ${s.budget.maxPieces} piezas: cerca del tope`, ids: [] });
  if (frac(s.budget.strokeCount, s.budget.maxStrokes) >= 0.9) warnings.push({ kind: 'budget', level: 'warn', text: `${s.budget.strokeCount} de ${s.budget.maxStrokes} trazos de ketchup: cerca del tope`, ids: [] });
  if (a.locomotion.mode === 'roll') warnings.push({ kind: 'mode', level: 'info', text: 'muchas extremidades en todas direcciones: rueda, casi no golpea y casi no frena', ids: [] });
  if (a.locomotion.mode === 'immobile') warnings.push({ kind: 'mode', level: 'warn', text: 'pesa más de lo que aguantan sus apoyos: casi inmóvil', ids: [] });
  if (sup.feet.length === 0 && a.locomotion.mode === 'drag') warnings.push({ kind: 'mode', level: 'info', text: 'sin apoyos hacia abajo: se arrastra', ids: [] });
  for (const w of validateSnapshot(s, cfg)) warnings.push({ kind: 'orientation', level: 'warn', text: w, ids: [] });

  const speed = a.locomotion.speed * 1000;
  return {
    core: { label: 'Chizito raíz', sizeText: coreShape ? `${nf(coreLen * 100)} × ${nf(coreShape.radius * 200)} cm` : '', massG: a.mass.core * 1000 },
    budget: { pieces: { n: s.budget.pieceCount, max: s.budget.maxPieces }, strokes: { n: s.budget.strokeCount, max: s.budget.maxStrokes } },
    mass: { totalG: a.mass.total * 1000, coreG: a.mass.core * 1000, decorativeG: decoG, text: `${nf(a.mass.total * 1000)} g en total (cuerpo ${nf(a.mass.core * 1000)} g, decorativas ${nf(decoG)} g) · valores de juego, aproximados` },
    reach: { maxCm: maxReach, strikeCm: strikeReach, text: limbs.length ? `la extremidad más larga mide ${nf(maxReach)} cm${strikeReach ? `; el golpe que más llega, ${nf(strikeReach)} cm` : ''}` : 'sin extremidades' },
    support: {
      feet: sup.feet.length,
      text: sup.feet.length
        ? `${sup.feet.length} ${plural(sup.feet.length, 'apoyo', 'apoyos')}${sup.intervalX ? `, separados ${nf((sup.intervalX[1] - sup.intervalX[0]) * 100)} cm` : ''} · centro de masa ${sup.margin >= 0 ? 'entre ellos' : 'fuera de ellos'} (${nf(Math.abs(sup.margin) * 1000)} mm) · carga ${nf(sup.loadRatio * 100, 0)} % de lo que aguantan`
        : 'sin apoyos',
    },
    locomotion: { mode: a.locomotion.mode, text: `${MODE_TEXT[a.locomotion.mode]} · ${nf(speed, 0)} mm/s · freno ${nf(a.locomotion.brake * 100, 0)} % · giro ${nf(a.locomotion.turn * 100, 0)} %${a.locomotion.jump > 0 ? ` · salto ${nf(a.locomotion.jump * 1000)} mm` : ''}` },
    limbs,
    decorative,
    actions,
    defense: a.defense.kind === 'guard' ? `guardia con ${limbs.find((l) => l.id === a.defense.limbId)?.label ?? 'una extremidad'} (−${nf(a.defense.reduction * 100, 0)} % de daño)` : `se encoge (−${nf(a.defense.reduction * 100, 0)} % de daño)`,
    warnings,
    thresholds: [
      `Sobresale (libre): al menos ${nf(mm(lim.minFreeAbs), 0)} mm y el ${nf(lim.minFreeRatio * 100, 0)} % del largo del palito`,
      `Adentro (embebido): al menos ${nf(mm(lim.minEmbeddedAbs), 0)} mm y el ${nf(lim.minEmbeddedRatio * 100, 0)} % del largo`,
      `Inclinación respecto de la superficie: hasta ${lim.maxTiltDeg}°`,
      `Calidad de ancla: al menos ${nf(lim.minAnchorQuality, 2)}`,
      `Un palito de 3,5 cm pide ${nf(mm(minFreeOf(0.035)))} mm libres y ${nf(mm(minEmbOf(0.035)))} mm adentro`,
    ],
  };
}

export { nf };
