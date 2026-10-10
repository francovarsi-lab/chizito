import { CREATURE_CONFIG } from '../config';
import { clamp, dot, len, norm, sub } from '../math/vec';
import type { CreatureSnapshot, SnapLink, SnapPiece, V3 } from '../types';

/** Largo de una pieza: la cápsula entre sus extremos, o el diámetro de un disco. */
export function pieceLength(p: SnapPiece): number {
  if (p.shape.kind === 'capsule') return len(sub(p.shape.b, p.shape.a));
  if (p.shape.kind === 'disc') return 2 * p.shape.radius;
  return 0;
}

/**
 * Calidad del ancla (0..1): cuánto de la pieza está adentro del sólido que la sostiene (1 con
 * `anchorFullRatio` de su largo adentro) por el coseno de su inclinación respecto de la normal.
 */
export function anchorQualityOf(embedded: number, tiltRad: number, pieceLen: number, cfg = CREATURE_CONFIG): number {
  if (pieceLen <= 0) return 0;
  return clamp(embedded / (cfg.limb.anchorFullRatio * pieceLen), 0, 1) * Math.max(0, Math.cos(tiltRad));
}

/** Ángulo (rad) entre una dirección y una normal; si `lineLike`, no importa el sentido de la dirección. */
export function angleBetween(a: V3, b: V3, lineLike = false): number {
  const c = dot(norm(a), norm(b));
  return Math.acos(clamp(lineLike ? Math.abs(c) : c, -1, 1));
}

/**
 * Calidad de la cadena de sostén de cada pieza: el núcleo vale 1; una pieza clavada vale lo que su propio ancla
 * como máximo, y nunca más que lo que vale la pieza que la sostiene (una vara clavada en una papita floja no
 * puede ser mejor que la papita). Un chizito ensartado en una cola es una soldadura rígida: hereda la de la vara.
 */
export function chainQualities(s: CreatureSnapshot, cfg = CREATURE_CONFIG): Map<string, number> {
  const chain = new Map<string, number>([[s.coreId, 1]]);
  const pieces = new Map(s.pieces.map((p) => [p.id, p]));
  for (const l of s.links) {
    const child = pieces.get(l.childId);
    if (!child) continue;
    const parentQ = chain.get(l.parentId) ?? 0;
    if (child.cosmetic || l.integrity === 'broken') chain.set(child.id, 0);
    else if (l.mode === 'tail') chain.set(child.id, parentQ);
    else chain.set(child.id, Math.min(parentQ, anchorQualityOf(l.embedded, l.tiltFromNormal, pieceLength(child), cfg)));
  }
  return chain;
}

export interface AnchorOption {
  /** Sólido que sostiene ('own' = el padre). */
  solidId: string;
  embedded: number;
  tiltRad: number;
  quality: number;
}

/**
 * Anclas posibles de un extremo libre de una vara: su propia conexión y, además, cada OTRO sólido que la vara
 * también atraviesa (cierra el hueco entre árbol y grafo). Gana la mejor.
 */
export function anchorOptions(
  link: SnapLink,
  rodLen: number,
  end: 'tail' | 'tip',
  chain: Map<string, number>,
  pieces: Map<string, SnapPiece>,
  cfg = CREATURE_CONFIG,
): { best: AnchorOption; all: AnchorOption[] } {
  // En la cola, la vara sale por donde entró; en la punta, sigue de largo por la salida.
  const tilt = end === 'tail' ? link.tiltFromNormal : link.exit ? angleBetween(scaleNeg(link.axis), link.exit.normal) : link.tiltFromNormal;
  const own: AnchorOption = {
    solidId: link.parentId,
    embedded: link.embedded,
    tiltRad: tilt,
    quality: Math.min(anchorQualityOf(link.embedded, tilt, rodLen, cfg), chain.get(link.parentId) ?? 0),
  };
  const all: AnchorOption[] = [own];
  for (const c of link.crossings) {
    const solid = pieces.get(c.pieceId);
    if (!solid || solid.cosmetic || (solid.kind !== 'core' && solid.kind !== 'blob')) continue;
    const t = angleBetween(link.axis, c.normal, true);
    all.push({ solidId: c.pieceId, embedded: c.chord, tiltRad: t, quality: Math.min(anchorQualityOf(c.chord, t, rodLen, cfg), chain.get(c.pieceId) ?? 0) });
  }
  const best = all.reduce((a, b) => (b.quality > a.quality ? b : a));
  return { best, all };
}

const scaleNeg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
