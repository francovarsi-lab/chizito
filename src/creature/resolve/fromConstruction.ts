import * as THREE from 'three';
import { attachModeOf } from '../../interaction/attach';
import type { Construction, PieceNode } from '../../model/Construction';
import type { PieceDefinition } from '../../pieces/PieceDefinition';
import type { PieceRegistry } from '../../pieces/PieceRegistry';
import { CREATURE_CONFIG } from '../config';
import { clipToSegment, rayCapsule, rayDisc } from '../math/ray';
import { addScaled, dot, len, mid, norm, scale, sub } from '../math/vec';
import { kindOfType, stabilityOf } from '../profiles';
import type { CreatureSnapshot, Crossing, PieceKind, Shape, SnapLink, SnapPiece, V3 } from '../types';
import { SNAPSHOT_SCHEMA, SNAPSHOT_VERSION } from '../types';
import { isCombatFront } from '../validate';
import { type Chord, chordAlong, smoothNormal } from './crossings';
import { localBox, ownMeshes, projectedArea } from './measure';

export const FILE_FORMAT = 'hombrecito-de-chizito/criatura';

export interface Orientation {
  front: V3;
  up: V3;
}

export interface ResolveInput {
  construction: Construction;
  pieces: PieceRegistry;
  /**
   * Orientación de combate de la criatura. Por defecto la de fábrica de `config.ts` (frente −Y, arriba +X). Con
   * 'construction' se lee `Construction.front/up`, que es dato por criatura pero hoy el chat 3D todavía lo guarda con
   * la convención vieja (±X / arriba +Y): en ese caso `orientationFrom` cae a la de fábrica.
   */
  orientation?: Orientation | 'construction';
  name?: string;
}

/** Orientación guardada en la construcción si cumple la convención vigente (frente ±Y, arriba +X); si no, la de fábrica. */
export function orientationFrom(c: Construction, cfg = CREATURE_CONFIG): Orientation {
  const front: V3 = [c.front.x, c.front.y, c.front.z];
  const up: V3 = [c.up.x, c.up.y, c.up.z];
  const upOk = Math.abs(up[0]) >= Math.cos((cfg.orientation.axisTolDeg * Math.PI) / 180) && up[0] > 0;
  return isCombatFront(front, cfg) && upOk ? { front, up } : { front: cfg.orientation.defaultFront, up: cfg.orientation.defaultUp };
}

const T3 = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

interface Rn {
  node: PieceNode;
  def: PieceDefinition;
  kind: PieceKind;
  /** Marco local de la pieza → marco raíz. */
  M: THREE.Matrix4;
  meshes: THREE.Mesh[];
  shape: Shape;
}

/**
 * Convierte la construcción VIVA (objetos de three.js ya colocados por el juego) en un `CreatureSnapshot`: mide las
 * mallas reales, calcula con rayos contra ellas la cuerda atravesada, la salida y las demás piezas que cruza cada vara.
 * Es el único código del intérprete que conoce three.js; el intérprete solo lee el snapshot.
 */
export function resolveSnapshot(input: ResolveInput, cfg = CREATURE_CONFIG): CreatureSnapshot {
  const { construction, pieces } = input;
  const root = construction.root;
  root.object.updateMatrixWorld(true);
  const inv = root.object.matrixWorld.clone().invert();
  const toRootP = (v: THREE.Vector3): V3 => arr(v.clone().applyMatrix4(inv));
  const toRootD = (v: THREE.Vector3): V3 => arr(v.clone().transformDirection(inv));
  // Los rayos miden en unidades de mundo; si el chizito está escalado (squash), se lleva todo al marco raíz.
  const sc = root.object.matrixWorld.getMaxScaleOnAxis() || 1;

  const ordered = construction.list().map((d) => construction.get(d.id)).filter((n): n is PieceNode => !!n);
  const rn = new Map<string, Rn>();
  for (const node of ordered) {
    const def = pieces.get(node.data.type);
    const meshes = ownMeshes(node);
    const kind: PieceKind = node === root ? 'core' : kindOfType(node.data.type);
    const M = inv.clone().multiply(node.object.matrixWorld);
    rn.set(node.data.id, { node, def, kind, M, meshes, shape: measureShape(node, def, kind, meshes, M) });
  }

  const snapPieces: SnapPiece[] = ordered.map((node) => {
    const r = rn.get(node.data.id)!;
    const mode = node === root ? undefined : attachModeOf(node.data, r.def);
    const params = node.data.params ? (JSON.parse(JSON.stringify(node.data.params)) as Record<string, unknown>) : undefined;
    return {
      id: node.data.id,
      type: node.data.type,
      seed: node.data.seed,
      kind: r.kind,
      shape: r.shape,
      cosmetic: r.kind === 'stroke',
      stability: stabilityOf(node.data.type, { mode, params }, cfg),
      ...(params?.variant ? { variant: String(params.variant) } : {}),
      ...(params?.proxyDe ? { proxyDe: String(params.proxyDe) } : {}),
      ...(params ? { params } : {}),
    };
  });

  const descendants = (n: PieceNode): Set<PieceNode> => {
    const out = new Set<PieceNode>();
    const walk = (x: PieceNode) => x.children.forEach((c) => (out.add(c), walk(c)));
    walk(n);
    return out;
  };

  const links: SnapLink[] = [];
  for (const node of ordered) {
    if (node === root || !node.parent) continue;
    const me = rn.get(node.data.id)!;
    const parent = rn.get(node.parent.data.id)!;
    const d = node.data;
    const mode = attachModeOf(d, me.def);
    const attach = { entryPoint: [r6(d.entryPoint[0]), r6(d.entryPoint[1]), r6(d.entryPoint[2])] as V3, direction: [r6(d.direction[0]), r6(d.direction[1]), r6(d.direction[2])] as V3, depth: r6(d.depth), spin: r6(d.spin), frame: (mode === 'tail' ? 'child' : 'parent') as 'parent' | 'child' };
    const base = { id: `link-${d.id}`, parentId: parent.node.data.id, childId: d.id, mode, attach, integrity: 'ok' as const };

    if (mode === 'paint') {
      const pts = me.shape.kind === 'polyline' ? me.shape.points : [];
      const nrm = (d.params?.normals as number[] | undefined) ?? [];
      const n0 = nrm.length >= 3 ? toRootD(T3([nrm[0], nrm[1], nrm[2]]).transformDirection(me.node.object.matrixWorld)) : ([0, 0, 0] as V3);
      links.push({ ...base, anchor: pts[0] ?? [0, 0, 0], normal: n0, axis: [0, 0, 0], tiltFromNormal: 0, embedded: 0, chord: null, freeTail: 0, exit: null, crossings: [] });
      continue;
    }
    if (mode === 'tail') {
      // El padre es el palito (a = punta, b = cola); la soldadura está en su cola.
      const rod = parent.shape.kind === 'capsule' ? parent.shape : null;
      const weld = rod ? rod.b : ([0, 0, 0] as V3);
      const center = me.shape.kind === 'capsule' ? mid(me.shape.a, me.shape.b) : weld;
      links.push({ ...base, anchor: weld, normal: rod ? norm(sub(rod.b, rod.a)) : [0, 0, 0], axis: norm(sub(center, weld)), tiltFromNormal: 0, embedded: d.depth, chord: null, freeTail: 0, exit: null, crossings: [] });
      continue;
    }

    // ── pierce ──
    const entryW = T3([d.entryPoint[0], d.entryPoint[1], d.entryPoint[2]]).applyMatrix4(parent.node.object.matrixWorld);
    const dirW = T3([d.direction[0], d.direction[1], d.direction[2]]).transformDirection(parent.node.object.matrixWorld);
    const entryRoot = toRootP(entryW);
    const dirIn = toRootD(dirW);
    const axisOut = scale(dirIn, -1);
    const maxLen = cfg.resolve.rayMaxLen * sc;

    // Cuerda por la malla real del padre (con la forma analítica de respaldo si el rayo no la encuentra).
    const real: Chord | null = chordAlong(parent.meshes, arr(entryW), arr(dirW), maxLen, true);
    const analytic = analyticChord(parent.shape, entryRoot, dirIn);
    const chord = real ? real.tOut / sc : analytic ? analytic.chord : null;
    const normal = smoothOrAnalytic(parent, entryW, entryRoot, dirIn, inv);
    const exitNormal = real ? toRootD(T3(real.exitNormal)) : analytic ? analytic.exitNormal : dirIn;
    const tilt = Math.acos(Math.min(1, Math.max(-1, dot(norm(axisOut), norm(normal)))));
    const embedded = chord === null ? d.depth : Math.min(d.depth, chord);
    const exit = chord !== null && d.depth > chord + 1e-6 ? { point: addScaled(entryRoot, dirIn, chord), freeTip: d.depth - chord, normal: exitNormal } : null;

    const rod = me.shape.kind === 'capsule' ? me.shape : null;
    const L = rod ? len(sub(rod.b, rod.a)) : 0;
    const mounted = [...construction.nodes.values()].find((c) => c.data.mount === 'tail' && c.parent === node);
    const freeTail = rod ? Math.max(0, L - d.depth - (mounted ? mounted.data.depth : 0)) : 0;

    // Otros sólidos que la vara también atraviesa (ni su padre, ni ella, ni lo que cuelga de ella).
    const crossings: Crossing[] = [];
    if (rod) {
      const mine = descendants(node);
      const tipPt = addScaled(entryRoot, dirIn, d.depth);
      const segDir = norm(sub(addScaled(entryRoot, dirIn, -(L - d.depth)), tipPt));
      const tipW = T3(tipPt).applyMatrix4(root.object.matrixWorld);
      const segW = T3(segDir).transformDirection(root.object.matrixWorld);
      for (const other of ordered) {
        const o = rn.get(other.data.id)!;
        if (other === node || other === node.parent || mine.has(other) || o.kind === 'stroke' || o.meshes.length === 0) continue;
        const hit = chordAlong(o.meshes, arr(tipW), arr(segW), L * sc);
        const seg = hit ? clipToSegment([hit.tIn / sc, hit.tOut / sc], L) : null;
        if (hit && seg) {
          const entry = addScaled(tipPt, segDir, seg.tIn);
          crossings.push({ pieceId: other.data.id, entry, normal: hit.entryNormal ? toRootD(T3(hit.entryNormal)) : scale(segDir, -1), exit: addScaled(tipPt, segDir, seg.tOut), chord: seg.chord });
        }
      }
    }
    links.push({ ...base, anchor: entryRoot, normal, axis: axisOut, tiltFromNormal: tilt, embedded, chord, freeTail, exit, crossings });
  }

  let orientation: Orientation;
  if (input.orientation === 'construction') orientation = orientationFrom(construction, cfg);
  else orientation = input.orientation ?? { front: cfg.orientation.defaultFront, up: cfg.orientation.defaultUp };
  const strokeCount = ordered.filter((n) => n !== root && rn.get(n.data.id)!.kind === 'stroke').length;
  const pieceCount = ordered.filter((n) => n !== root && rn.get(n.data.id)!.kind !== 'stroke').length;
  return {
    schema: SNAPSHOT_SCHEMA,
    version: SNAPSHOT_VERSION,
    source: { fileFormat: FILE_FORMAT, fileVersion: 1, name: input.name ?? 'Criatura' },
    orientation,
    coreId: root.data.id,
    pieces: snapPieces,
    links,
    budget: { pieceCount, maxPieces: cfg.limits.maxPieces, strokeCount, maxStrokes: cfg.limits.maxStrokes },
    warnings: [],
  };
}

/** Forma 3D de la pieza (en marco raíz) medida de sus mallas reales. */
function measureShape(node: PieceNode, def: PieceDefinition, kind: PieceKind, meshes: THREE.Mesh[], M: THREE.Matrix4): Shape {
  const P = (x: number, y: number, z: number): V3 => arr(new THREE.Vector3(x, y, z).applyMatrix4(M));
  const radiusNominal = def.dimensions.thickness / 2;
  if (kind === 'stroke') {
    const pts = (node.data.params?.points as number[] | undefined) ?? [];
    const points: V3[] = [];
    for (let i = 0; i + 2 < pts.length; i += 3) points.push(P(pts[i], pts[i + 1], pts[i + 2]));
    return { kind: 'polyline', points, radius: radiusNominal };
  }
  if (meshes.length === 0) return { kind: 'capsule', a: P(0, 0, 0), b: P(0, 0, 0), radius: radiusNominal };
  const box = localBox(node, meshes);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  if (kind === 'plate') {
    const sz = [size.x, size.y, size.z];
    const thin = sz.indexOf(Math.min(...sz));
    const normal = new THREE.Vector3(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0);
    const big = sz.filter((_, i) => i !== thin);
    const radius = (big[0] + big[1]) / 4;
    const solid = Math.min(1, projectedArea(node, meshes, normal) / (Math.PI * radius * radius));
    return { kind: 'disc', center: P(c.x, c.y, c.z), normal: toDir(normal, M), radius, thickness: def.dimensions.thickness, solidFraction: solid };
  }
  if (kind === 'rod') return { kind: 'capsule', a: P(0, box.min.y, 0), b: P(0, box.max.y, 0), radius: radiusNominal };
  if (kind === 'core' || def.frame === 'centered') {
    return { kind: 'capsule', a: P(c.x - size.x / 2, c.y, c.z), b: P(c.x + size.x / 2, c.y, c.z), radius: (size.y + size.z) / 4 };
  }
  // Cualquier otro bulto (aceituna, tipos nuevos): cápsula a lo largo de su eje más largo.
  const axes = [size.x, size.y, size.z];
  const long = axes.indexOf(Math.max(...axes));
  const h = axes[long] / 2;
  const others = axes.filter((_, i) => i !== long);
  const va = [c.x, c.y, c.z];
  const vb = [c.x, c.y, c.z];
  va[long] -= h;
  vb[long] += h;
  return { kind: 'capsule', a: P(va[0], va[1], va[2]), b: P(vb[0], vb[1], vb[2]), radius: (others[0] + others[1]) / 4 };
}

function toDir(v: THREE.Vector3, M: THREE.Matrix4): V3 {
  return arr(v.clone().transformDirection(M));
}

/** Cuerda y normal de salida con la forma analítica (respaldo cuando el rayo contra la malla no encuentra nada). */
function analyticChord(shape: Shape, entry: V3, dirIn: V3): { chord: number; exitNormal: V3 } | null {
  const o = addScaled(entry, dirIn, 1e-5);
  let iv: [number, number] | null = null;
  if (shape.kind === 'capsule') {
    const ax = sub(shape.b, shape.a);
    const L = len(ax);
    const k = Math.min(shape.radius, L / 2);
    const u: V3 = L < 1e-12 ? [0, 0, 0] : scale(ax, 1 / L);
    iv = rayCapsule(o, dirIn, addScaled(shape.a, u, k), addScaled(shape.b, u, -k), shape.radius);
  } else if (shape.kind === 'disc') iv = rayDisc(o, dirIn, shape.center, shape.normal, shape.thickness, shape.radius);
  if (!iv) return null;
  const chord = Math.max(0, iv[1] + 1e-5);
  return { chord, exitNormal: analyticNormal(shape, addScaled(entry, dirIn, chord), scale(dirIn, -1)) };
}

/** Normal saliente en la entrada: de la malla (suavizada) o, si falla, de la forma analítica. */
function smoothOrAnalytic(parent: Rn, entryW: THREE.Vector3, entryRoot: V3, dirIn: V3, inv: THREE.Matrix4): V3 {
  const fallbackRoot = analyticNormal(parent.shape, entryRoot, dirIn);
  if (parent.meshes.length === 0) return fallbackRoot;
  const hintW = T3(fallbackRoot).transformDirection(inv.clone().invert());
  const n = smoothNormal(parent.meshes, arr(entryW), arr(hintW));
  return arr(T3(n).transformDirection(inv));
}

function analyticNormal(shape: Shape, p: V3, dirIn: V3): V3 {
  if (shape.kind === 'capsule') {
    const ax = sub(shape.b, shape.a);
    const L2 = dot(ax, ax);
    const t = L2 < 1e-18 ? 0 : Math.min(1, Math.max(0, dot(sub(p, shape.a), ax) / L2));
    return norm(sub(p, addScaled(shape.a, ax, t)));
  }
  if (shape.kind === 'disc') return dot(shape.normal, dirIn) <= 0 ? shape.normal : scale(shape.normal, -1);
  return scale(dirIn, -1);
}
