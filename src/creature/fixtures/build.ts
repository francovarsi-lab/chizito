/**
 * Generador de criaturas de prueba. SOLO se usa desde `scripts/make-fixtures.mjs` (Node) y los tests: no
 * forma parte de la app. Arma cada criatura en términos geométricos (marco raíz) y produce DOS cosas:
 *   - el archivo real `CreatureFileV1` (lo que Ctrl+O carga en el juego), con la pose por conexiones;
 *   - el snapshot de referencia (`CreatureSnapshot`) calculado de forma analítica, contra el cual la
 *     tanda 7 va a comparar al resolver real.
 * Las poses salen de las MISMAS cuentas que usa el juego (`poseFromData`, `tailFrame`) y las medidas de
 * las mallas procedurales reales (por semilla), así que lo que se genera es lo que el juego dibujaría.
 * El frente y el "arriba" de combate son PARÁMETROS (por defecto: frente −Y = derecha de la pantalla del constructor, arriba +X).
 */
import * as THREE from 'three';
import { normalizeToFrame } from '../../assets/AssetRegistry';
import { buildChizitoGeometry } from '../../assets/procedural/chizito';
import { buildPalitoGeometry } from '../../assets/procedural/palito';
import { buildPapitaGeometry } from '../../assets/procedural/papita';
import { poseFromData } from '../../interaction/attach';
import type { PieceData } from '../../model/Construction';
import { CHIZITO, PALITO, PAPITA } from '../../pieces/definitions';
import { CREATURE_CONFIG } from '../config';
import { MAX_PIECES, MAX_STROKES } from '../limits';
import { stabilityOf } from '../profiles';
import { clipToSegment, rayCapsule, rayDisc } from '../math/ray';
import { addScaled, dot, len, mid, norm, rad, scale, sub } from '../math/vec';
import type { CreatureSnapshot, Crossing, PieceKind, Shape, SnapLink, SnapPiece, V3 } from '../types';
import { SNAPSHOT_SCHEMA, SNAPSHOT_VERSION } from '../types';

export const FILE_FORMAT = 'hombrecito-de-chizito/criatura';
/** Orientación de combate por defecto (frente −Y = derecha de la pantalla del constructor, arriba +X). Se cambia con --front / --up. */
export const DEFAULT_FRONT: V3 = CREATURE_CONFIG.orientation.defaultFront;
export const DEFAULT_UP: V3 = CREATURE_CONFIG.orientation.defaultUp;
const ROOT_ID = 'root';

type Mode = 'pierce' | 'tail' | 'paint';
type PieceType = 'chizito' | 'palito' | 'papita' | 'ketchup';

export interface Item {
  id: string;
  type: PieceType;
  seed: number;
  parent: Item | null;
  mode: Mode | 'root';
  /** Conexión tal como se guarda en el archivo (marco del padre; del hijo si es 'tail'). */
  entry: V3;
  dir: V3;
  depth: number;
  spin: number;
  params?: Record<string, unknown>;
  object: THREE.Object3D;
  matrix: THREE.Matrix4; // local de la pieza → marco raíz
  /** Medidas en el marco local de la pieza. */
  local: { length: number; radius: number; center: V3; normal: V3 };
  stroke?: { points: V3[]; normals: V3[] };
}

export interface BuiltCreature {
  id: string;
  name: string;
  file: Record<string, unknown>;
  snapshot: CreatureSnapshot;
}

const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const T = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const round3 = (v: V3): V3 => [r6(v[0]), r6(v[1]), r6(v[2])];

function measure(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  return { box: b, size: b.getSize(new THREE.Vector3()), center: b.getCenter(new THREE.Vector3()) };
}

export class CreatureBuilder {
  readonly items: Item[] = [];
  private counter = 0;
  readonly root: Item;
  /** Largo total y radio del chizito raíz (de la malla procedural real de la semilla). */
  readonly coreLen: number;
  readonly coreR: number;

  constructor(
    readonly id: string,
    readonly name: string,
    rootSeed = 3,
    private readonly front: V3 = DEFAULT_FRONT,
    private readonly up: V3 = DEFAULT_UP,
  ) {
    const obj = normalizeToFrame(new THREE.Mesh(buildChizitoGeometry(rootSeed, 'prop').geometry, new THREE.MeshBasicMaterial()), CHIZITO, false);
    const m = measure(obj);
    this.coreLen = m.size.x;
    this.coreR = (m.size.y + m.size.z) / 4;
    this.root = {
      id: ROOT_ID,
      type: 'chizito',
      seed: rootSeed,
      parent: null,
      mode: 'root',
      entry: [0, 0, 0],
      dir: [0, -1, 0],
      depth: 0,
      spin: 0,
      object: obj,
      matrix: new THREE.Matrix4(),
      local: { length: m.size.x, radius: this.coreR, center: [0, 0, 0], normal: [1, 0, 0] },
    };
    this.items.push(this.root);
  }

  // ───────────── puntos sobre la superficie del chizito raíz (marco raíz) ─────────────
  /**
   * Punto sobre el costado: x a lo largo del eje largo (X: con el chizito parado, + es más arriba); theta alrededor de X
   * desde +Y hacia +Z (0 = +Y, a la IZQUIERDA de la pantalla del constructor · 90 = +Z, hacia la cámara · 180 = −Y, a la DERECHA · 270 = −Z, hacia atrás).
   */
  side(x: number, thetaDeg: number): { point: V3; n: V3 } {
    const th = rad(thetaDeg);
    const n: V3 = [0, Math.cos(th), Math.sin(th)];
    return { point: [x, this.coreR * n[1], this.coreR * n[2]], n };
  }

  /**
   * Punto sobre una tapa: `sign` +1 = la cabeza (arriba), −1 = los pies (abajo); `tiltDeg` se aparta del eje largo hacia
   * `azDeg` (0 = +Y/izquierda de la pantalla, 90 = +Z/hacia la cámara, 180 = −Y/derecha).
   */
  end(sign: 1 | -1, tiltDeg: number, azDeg: number): { point: V3; n: V3 } {
    const t = rad(tiltDeg);
    const az = rad(azDeg);
    const n: V3 = [sign * Math.cos(t), Math.sin(t) * Math.cos(az), Math.sin(t) * Math.sin(az)];
    const c = sign * (this.coreLen / 2 - this.coreR);
    return { point: [c + this.coreR * n[0], this.coreR * n[1], this.coreR * n[2]], n };
  }

  /** Inclina `n` hacia la tangente `towards` (proyectada) `leanDeg` grados. */
  lean(n: V3, towards: V3, leanDeg: number): V3 {
    const tang = norm(sub(towards, scale(n, dot(towards, n))));
    const a = rad(leanDeg);
    return norm(addScaled(scale(n, Math.cos(a)), tang, Math.sin(a)));
  }

  // ───────────── piezas ─────────────
  private nextId(type: string): string {
    return `${type}-fx${this.id}${++this.counter}`;
  }

  private place(parent: Item, it: Omit<Item, 'matrix' | 'id'>, entryRoot: V3 | null, dirRoot: V3 | null): Item {
    const inv = parent.matrix.clone().invert();
    const item = { ...it, id: this.nextId(it.type), matrix: new THREE.Matrix4() } as Item;
    if (entryRoot && dirRoot) {
      item.entry = round3(v3(T(entryRoot).applyMatrix4(inv)));
      item.dir = round3(v3(T(dirRoot).transformDirection(inv)));
    }
    this.setPose(item, parent);
    this.items.push(item);
    return item;
  }

  private setPose(item: Item, parent: Item): void {
    const def = item.type === 'chizito' ? CHIZITO : item.type === 'palito' ? PALITO : PAPITA;
    const data: PieceData = {
      id: item.id,
      type: item.type,
      parentId: parent.id,
      seed: item.seed,
      entryPoint: [...item.entry],
      direction: norm(item.dir) as V3 as [number, number, number],
      depth: item.depth,
      spin: item.spin,
      mount: item.mode === 'tail' ? 'tail' : undefined,
      localMatrix: [],
    };
    const local = poseFromData(data, def, parent.object);
    item.matrix = parent.matrix.clone().multiply(local);
  }

  /** Palito clavado desde `entry` (marco raíz) hacia afuera según `outward`. */
  rod(parent: Item, entry: V3, outward: V3, depth: number, o: { seed?: number; spin?: number; params?: Record<string, unknown> } = {}): Item {
    const seed = o.seed ?? 4000 + this.counter * 17;
    const obj = normalizeToFrame(new THREE.Mesh(buildPalitoGeometry(seed, 'prop'), new THREE.MeshBasicMaterial()), PALITO, false);
    const m = measure(obj);
    return this.place(
      parent,
      {
        type: 'palito',
        seed,
        parent,
        mode: 'pierce',
        entry,
        dir: scale(norm(outward), -1),
        depth,
        spin: o.spin ?? 0,
        params: o.params,
        object: obj,
        local: { length: m.size.y, radius: PALITO.dimensions.thickness / 2, center: [0, m.size.y / 2, 0], normal: [0, 1, 0] },
      },
      entry,
      scale(norm(outward), -1),
    );
  }

  /** Papita clavada de canto en la superficie. */
  plate(parent: Item, entry: V3, outward: V3, depth: number, o: { seed?: number; spin?: number } = {}): Item {
    const seed = o.seed ?? 5000 + this.counter * 13;
    const obj = normalizeToFrame(new THREE.Mesh(buildPapitaGeometry(seed, 'prop'), new THREE.MeshBasicMaterial()), PAPITA, false);
    const m = measure(obj);
    const sz = [m.size.x, m.size.y, m.size.z];
    const thin = sz.indexOf(Math.min(...sz));
    const normal: V3 = thin === 0 ? [1, 0, 0] : thin === 1 ? [0, 1, 0] : [0, 0, 1];
    const big = sz.filter((_, i) => i !== thin);
    return this.place(
      parent,
      {
        type: 'papita',
        seed,
        parent,
        mode: 'pierce',
        entry,
        dir: scale(norm(outward), -1),
        depth,
        spin: o.spin ?? 0,
        object: obj,
        local: { length: Math.max(...big), radius: (big[0] + big[1]) / 4, center: v3(m.center), normal },
      },
      entry,
      scale(norm(outward), -1),
    );
  }

  /** Ensarta un chizito en la cola libre de un palito (`mount:'tail'`), con el palito entrando por su tapa −X. */
  mountChizito(rod: Item, depth: number, o: { seed?: number; spin?: number } = {}): Item {
    const seed = o.seed ?? 7;
    const obj = normalizeToFrame(new THREE.Mesh(buildChizitoGeometry(seed, 'prop').geometry, new THREE.MeshBasicMaterial()), CHIZITO, false);
    const m = measure(obj);
    return this.place(
      rod,
      {
        type: 'chizito',
        seed,
        parent: rod,
        mode: 'tail',
        entry: [-m.size.x / 2, 0, 0],
        dir: [1, 0, 0],
        depth,
        spin: o.spin ?? 0,
        object: obj,
        local: { length: m.size.x, radius: (m.size.y + m.size.z) / 4, center: [0, 0, 0], normal: [1, 0, 0] },
      },
      null,
      null,
    );
  }

  /** Trazo de ketchup (cosmético) sobre una pieza; los puntos van en marco raíz. */
  stroke(parent: Item, points: V3[], normals: V3[]): Item {
    const inv = parent.matrix.clone().invert();
    const pts = points.map((p) => round3(v3(T(p).applyMatrix4(inv))));
    const nrm = normals.map((n) => round3(v3(T(n).transformDirection(inv))));
    const obj = new THREE.Group();
    const item = this.place(
      parent,
      {
        type: 'ketchup',
        seed: 9000 + this.counter,
        parent,
        mode: 'paint',
        entry: [0, 0, 0],
        dir: [0, -1, 0],
        depth: 0,
        spin: 0,
        params: { points: pts.flat(), normals: nrm.flat() },
        object: obj,
        local: { length: 0, radius: 0.0011, center: [0, 0, 0], normal: [0, 1, 0] },
      },
      null,
      null,
    );
    item.matrix = parent.matrix.clone(); // el trazo está en coordenadas del padre
    item.stroke = { points: points.map((p) => [...p] as V3), normals: normals.map((n) => [...n] as V3) };
    return item;
  }

  // ───────────── formas en marco raíz ─────────────
  private worldPoint(it: Item, p: V3): V3 {
    return v3(T(p).applyMatrix4(it.matrix));
  }
  private worldDir(it: Item, d: V3): V3 {
    return norm(v3(T(d).transformDirection(it.matrix)));
  }

  private kindOf(it: Item): PieceKind {
    if (it === this.root) return 'core';
    return it.type === 'palito' ? 'rod' : it.type === 'papita' ? 'plate' : it.type === 'ketchup' ? 'stroke' : 'blob';
  }

  /** Forma de una pieza en marco raíz (la usan las criaturas para apoyar piezas sobre otras). */
  shapeOfItem(it: Item): Shape {
    return this.shapeOf(it);
  }

  private shapeOf(it: Item): Shape {
    if (it.type === 'ketchup') return { kind: 'polyline', points: it.stroke!.points, radius: it.local.radius };
    if (it.type === 'papita') {
      return {
        kind: 'disc',
        center: this.worldPoint(it, it.local.center),
        normal: this.worldDir(it, it.local.normal),
        radius: it.local.radius,
        thickness: PAPITA.dimensions.thickness,
        solidFraction: 1,
      };
    }
    if (it.type === 'palito') return { kind: 'capsule', a: this.worldPoint(it, [0, 0, 0]), b: this.worldPoint(it, [0, it.local.length, 0]), radius: it.local.radius };
    const h = it.local.length / 2;
    return { kind: 'capsule', a: this.worldPoint(it, [-h, 0, 0]), b: this.worldPoint(it, [h, 0, 0]), radius: it.local.radius };
  }

  /** Cápsula como centros de tapas (para los rayos) a partir de una forma con extremos reales. */
  private capsuleCore(s: Extract<Shape, { kind: 'capsule' }>): { a: V3; b: V3; r: number } {
    const ax = sub(s.b, s.a);
    const L = len(ax);
    const k = Math.min(s.radius, L / 2);
    const u = L < 1e-12 ? ([0, 0, 0] as V3) : scale(ax, 1 / L);
    return { a: addScaled(s.a, u, k), b: addScaled(s.b, u, -k), r: s.radius };
  }

  private hit(origin: V3, dirU: V3, s: Shape): [number, number] | null {
    if (s.kind === 'capsule') {
      const c = this.capsuleCore(s);
      return rayCapsule(origin, dirU, c.a, c.b, c.r);
    }
    if (s.kind === 'disc') return rayDisc(origin, dirU, s.center, s.normal, s.thickness, s.radius);
    return null;
  }

  private surfaceNormal(s: Shape, p: V3, towards: V3): V3 {
    if (s.kind === 'capsule') {
      const c = this.capsuleCore(s);
      const ax = sub(c.b, c.a);
      const L2 = dot(ax, ax);
      const t = L2 < 1e-18 ? 0 : Math.min(1, Math.max(0, dot(sub(p, c.a), ax) / L2));
      return norm(sub(p, addScaled(c.a, ax, t)));
    }
    if (s.kind === 'disc') return dot(s.normal, towards) >= 0 ? s.normal : scale(s.normal, -1);
    return towards;
  }

  private descendants(it: Item): Set<Item> {
    const out = new Set<Item>();
    for (const c of this.items) {
      for (let p = c.parent; p; p = p.parent) if (p === it) out.add(c);
    }
    return out;
  }

  // ───────────── salida ─────────────
  build(): BuiltCreature {
    const shapes = new Map<Item, Shape>(this.items.map((it) => [it, this.shapeOf(it)]));
    const pieces: SnapPiece[] = this.items.map((it) => {
      const kind = this.kindOf(it);
      const mode = it.mode === 'root' ? undefined : it.mode;
      return {
        id: it.id,
        type: it.type,
        seed: it.seed,
        kind,
        shape: shapes.get(it)!,
        cosmetic: kind === 'stroke',
        stability: stabilityOf(it.type, { mode, params: it.params }),
        ...(it.params?.proxyDe ? { proxyDe: String(it.params.proxyDe) } : {}),
        ...(it.params ? { params: structuredCloneJson(it.params) } : {}),
      };
    });

    const links: SnapLink[] = [];
    for (const it of this.items) {
      if (!it.parent || it.mode === 'root') continue;
      const parent = it.parent;
      const mine = shapes.get(it)!;
      const pShape = shapes.get(parent)!;
      const base = {
        id: `link-${it.id}`,
        parentId: parent.id,
        childId: it.id,
        mode: it.mode as Mode,
        attach: { entryPoint: round3(it.entry), direction: round3(it.dir), depth: r6(it.depth), spin: r6(it.spin), frame: (it.mode === 'tail' ? 'child' : 'parent') as 'parent' | 'child' },
        integrity: 'ok' as const,
      };
      if (it.mode === 'paint') {
        const p0 = it.stroke!.points[0];
        links.push({ ...base, anchor: p0, normal: it.stroke!.normals[0], axis: [0, 0, 0], tiltFromNormal: 0, embedded: 0, chord: null, freeTail: 0, exit: null, crossings: [] });
        continue;
      }
      if (it.mode === 'tail') {
        // parent = palito (cola libre), hijo = chizito ensartado. Soldadura en la cola del palito.
        const rod = pShape as Extract<Shape, { kind: 'capsule' }>;
        const weld = rod.b;
        const axisOut = norm(sub(rod.b, rod.a));
        const c2 = (mine as Extract<Shape, { kind: 'capsule' }>);
        links.push({
          ...base,
          anchor: weld,
          normal: axisOut,
          axis: norm(sub(mid(c2.a, c2.b), weld)),
          tiltFromNormal: 0,
          embedded: it.depth,
          chord: null,
          freeTail: 0,
          exit: null,
          crossings: [],
        });
        continue;
      }
      // pierce
      const entryRoot = this.worldPoint(parent, it.entry);
      const dirIn = this.worldDir(parent, it.dir);
      const rodShape = mine.kind === 'capsule' ? mine : null;
      const normal = this.surfaceNormal(pShape, entryRoot, scale(dirIn, -1));
      const axisOut = scale(dirIn, -1);
      const tilt = Math.acos(Math.min(1, Math.max(-1, dot(axisOut, normal))));
      const iv = this.hit(addScaled(entryRoot, dirIn, 1e-5), dirIn, pShape);
      const chord = iv ? Math.max(0, iv[1] + 1e-5) : null;
      const embedded = chord === null ? it.depth : Math.min(it.depth, chord);
      const exitPoint = chord !== null ? addScaled(entryRoot, dirIn, chord) : null;
      const exit =
        exitPoint && chord !== null && it.depth > chord + 1e-6
          ? { point: exitPoint, freeTip: it.depth - chord, normal: this.surfaceNormal(pShape, exitPoint, dirIn) }
          : null;
      // Cola libre del lado de entrada. Si hay un chizito ensartado en la cola, solo cuenta el tramo de vara a la vista.
      const mounted = this.items.find((c) => c.mode === 'tail' && c.parent === it);
      const L = rodShape ? len(sub(rodShape.b, rodShape.a)) : 0;
      const freeTail = rodShape ? Math.max(0, L - it.depth - (mounted ? mounted.depth : 0)) : 0;
      // Otros sólidos que atraviesa (no su padre, ni él mismo, ni lo que cuelga de él).
      const crossings: Crossing[] = [];
      if (rodShape) {
        const mine2 = this.descendants(it);
        const tipPt = addScaled(entryRoot, dirIn, it.depth);
        const tailPt = addScaled(entryRoot, dirIn, -(L - it.depth));
        const segDir = norm(sub(tailPt, tipPt));
        for (const other of this.items) {
          if (other === it || other === parent || mine2.has(other) || other.type === 'ketchup') continue;
          const sh = shapes.get(other)!;
          const seg = clipToSegment(this.hit(tipPt, segDir, sh), L);
          if (seg) {
            const entryPt = addScaled(tipPt, segDir, seg.tIn);
            crossings.push({ pieceId: other.id, entry: entryPt, normal: this.surfaceNormal(sh, entryPt, scale(segDir, -1)), exit: addScaled(tipPt, segDir, seg.tOut), chord: seg.chord });
          }
        }
      }
      links.push({ ...base, anchor: entryRoot, normal, axis: axisOut, tiltFromNormal: tilt, embedded, chord, freeTail, exit, crossings });
    }

    const strokeCount = this.items.filter((i) => i.mode === 'paint').length;
    const pieceCount = this.items.filter((i) => i !== this.root && i.mode !== 'paint').length;
    const snapshot: CreatureSnapshot = {
      schema: SNAPSHOT_SCHEMA,
      version: SNAPSHOT_VERSION,
      source: { fileFormat: FILE_FORMAT, fileVersion: 1, name: this.name },
      orientation: { front: this.front, up: this.up },
      coreId: ROOT_ID,
      pieces,
      links,
      budget: { pieceCount, maxPieces: MAX_PIECES, strokeCount, maxStrokes: MAX_STROKES },
      warnings: [],
    };

    const file = {
      format: FILE_FORMAT,
      version: 1,
      units: 'm',
      creature: {
        name: this.name,
        savedAt: '2026-10-10T00:00:00.000Z',
        pieceCount,
        root: { type: 'chizito', seed: this.root.seed },
        // Frente de combate de la criatura (dato por criatura): el mismo que lleva el snapshot.
        front: { direction: round3(this.front), up: round3(this.up) },
      },
      pieces: this.items
        .filter((i) => i !== this.root)
        .map((i) => ({
          id: i.id,
          type: i.type,
          parentId: i.parent === this.root ? ROOT_ID : i.parent!.id,
          seed: i.seed,
          attach: { mode: i.mode, entryPoint: round3(i.entry), direction: round3(i.dir), depth: r6(i.depth), spin: r6(i.spin) },
          ...(i.params ? { params: i.params } : {}),
        })),
    };
    return { id: this.id, name: this.name, file, snapshot };
  }
}

function structuredCloneJson<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

