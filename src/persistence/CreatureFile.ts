import type { Snapshot, Vec3 } from '../commands/CommandStack';
import { CONFIG } from '../config';
import { attachModeOf, type AttachMode } from '../interaction/attach';
import type { PieceData } from '../model/Construction';
import type { PieceRegistry } from '../pieces/PieceRegistry';

/**
 * Archivo de una criatura (JSON versionado). Se guarda CÓMO está conectada cada pieza, no dónde
 * quedó: padre, punto de clavado, dirección, profundidad, giro y modo de conexión. Al cargar, la pose
 * se reconstruye desde esos datos (`poseFromData`), así que sigue valiendo aunque un modelo
 * procedural se reemplace por un GLB. Las piezas van en orden padre → hijo. Unidades: metros.
 *
 *   {
 *     "format": "hombrecito-de-chizito/criatura", "version": 1, "units": "m",
 *     "creature": {
 *       "name": "…", "savedAt": "2026-10-09T…", "pieceCount": 12,
 *       "root":  { "type": "chizito", "seed": 3 },
 *       "front": { "direction": [0, 0, 1], "up": [0, 1, 0] }        ← en coordenadas del chizito raíz
 *     },
 *     "pieces": [
 *       { "id": "palito-…", "type": "palito", "parentId": "root", "seed": 4711,
 *         "attach": { "mode": "pierce", "entryPoint": [x, y, z], "direction": [x, y, z], "depth": 0.012, "spin": 0.4 },
 *         "params": { … } }                                          ← opcional (mordiscos, variante, trazo)
 *     ]
 *   }
 */
export const CREATURE_FORMAT = 'hombrecito-de-chizito/criatura';
export const CREATURE_VERSION = 1;

export interface PieceRecord {
  id: string;
  type: string;
  parentId: string;
  seed: number;
  attach: {
    mode: AttachMode;
    /** Punto de clavado: en coordenadas del padre ('pierce', 'paint') o de la propia pieza ('tail'). */
    entryPoint: Vec3;
    /** Dirección de avance hacia adentro, unitaria (mismo marco que `entryPoint`). */
    direction: Vec3;
    depth: number;
    spin: number;
  };
  params?: Record<string, unknown>;
}

export interface CreatureFileV1 {
  format: typeof CREATURE_FORMAT;
  version: 1;
  units: 'm';
  creature: {
    name: string;
    savedAt: string;
    pieceCount: number;
    root: { type: string; seed: number };
    front: { direction: Vec3; up: Vec3 };
  };
  pieces: PieceRecord[];
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const v6 = (v: number[]): Vec3 => [r6(v[0]), r6(v[1]), r6(v[2])];

export function toCreatureFile(s: Snapshot, pieces: PieceRegistry, rootType: string, name = 'Criatura'): CreatureFileV1 {
  const records: PieceRecord[] = s.pieces.map((d) => {
    const rec: PieceRecord = {
      id: d.id,
      type: d.type,
      parentId: d.parentId ?? 'root',
      seed: d.seed,
      attach: {
        mode: attachModeOf(d, pieces.get(d.type)),
        entryPoint: v6(d.entryPoint),
        direction: v6(d.direction),
        depth: r6(d.depth),
        spin: r6(d.spin),
      },
    };
    if (d.params && Object.keys(d.params).length) rec.params = structuredClone(d.params);
    return rec;
  });
  return {
    format: CREATURE_FORMAT,
    version: CREATURE_VERSION,
    units: 'm',
    creature: {
      name,
      savedAt: new Date().toISOString(),
      pieceCount: records.filter((r) => r.attach.mode !== 'paint').length,
      root: { type: rootType, seed: s.rootSeed },
      front: { direction: v6(s.front), up: v6(s.up) },
    },
    pieces: records,
  };
}

/** Error de archivo con un mensaje para mostrarle al jugador. */
export class CreatureFileError extends Error {}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const vec = (x: unknown): x is Vec3 => Array.isArray(x) && x.length === 3 && x.every(num);
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const unit = (v: Vec3): Vec3 => {
  const l = len(v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Lee y valida un archivo de criatura. Lo que no se puede usar (tipo desconocido, padre inexistente,
 * conexión imposible, piezas de más) se descarta con un aviso; un archivo que no es de criatura tira
 * `CreatureFileError`.
 */
export function fromCreatureFile(json: unknown, pieces: PieceRegistry): { snapshot: Snapshot; name: string; warnings: string[] } {
  if (!isObj(json) || json.format !== CREATURE_FORMAT) throw new CreatureFileError('ese archivo no es una criatura de chizito');
  if (!num(json.version) || json.version > CREATURE_VERSION) throw new CreatureFileError('la criatura es de una versión más nueva del juego');
  // (Versiones viejas: acá irían las migraciones. La 1 es la primera.)
  const cr = json.creature;
  if (!isObj(cr) || !isObj(cr.root) || !num(cr.root.seed)) throw new CreatureFileError('a la criatura le falta el chizito raíz');
  const warnings: string[] = [];

  let front: Vec3 = [0, 0, 1];
  let up: Vec3 = [0, 1, 0];
  if (isObj(cr.front) && vec(cr.front.direction) && len(cr.front.direction) > 1e-6) {
    front = unit(cr.front.direction);
    if (vec(cr.front.up) && len(cr.front.up) > 1e-6) {
      const u = cr.front.up;
      const d = u[0] * front[0] + u[1] * front[1] + u[2] * front[2];
      const o: Vec3 = [u[0] - d * front[0], u[1] - d * front[1], u[2] - d * front[2]];
      if (len(o) > 1e-6) up = unit(o);
    }
  } else {
    warnings.push('no traía frente: se usa el de fábrica');
  }

  const list = Array.isArray(json.pieces) ? json.pieces : [];
  const accepted = new Map<string, PieceData>(); // id → pieza aceptada (para validar padres)
  const rootType = typeof cr.root.type === 'string' ? cr.root.type : 'chizito';
  const parentType = (id: string) => (id === 'root' ? rootType : accepted.get(id)?.type);
  const out: PieceData[] = [];
  let count = 0;
  let dropped = 0;
  let overLimit = 0;
  // Orden padre → hijo; si viniera desordenado, se reintenta hasta que no avance.
  let pending = list.slice();
  for (let pass = 0; pass < 64 && pending.length; pass++) {
    const next: unknown[] = [];
    for (const raw of pending) {
      if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.type !== 'string' || typeof raw.parentId !== 'string') {
        dropped++;
        continue;
      }
      if (raw.parentId !== 'root' && !accepted.has(raw.parentId)) {
        next.push(raw);
        continue;
      }
      const d = toPieceData(raw, pieces, parentType(raw.parentId), accepted);
      if (!d) {
        dropped++;
        continue;
      }
      const isPiece = pieces.get(d.type).frame !== 'free';
      if (isPiece && count >= CONFIG.creature.maxPieces) {
        overLimit++;
        continue;
      }
      if (isPiece) count++;
      accepted.set(d.id, d);
      out.push(d);
    }
    if (next.length === pending.length) {
      dropped += next.length; // padres que no existen
      break;
    }
    pending = next;
  }
  if (dropped) warnings.push(dropped === 1 ? '1 pieza no se pudo cargar' : `${dropped} piezas no se pudieron cargar`);
  if (overLimit) warnings.push(`${overLimit} pieza${overLimit === 1 ? '' : 's'} de más (el tope es ${CONFIG.creature.maxPieces})`);

  return {
    snapshot: { pieces: out, front, up, rootSeed: cr.root.seed },
    name: typeof cr.name === 'string' ? cr.name : 'Criatura',
    warnings,
  };
}

function toPieceData(raw: Record<string, unknown>, pieces: PieceRegistry, parentType: string | undefined, accepted: Map<string, PieceData>): PieceData | null {
  const type = raw.type as string;
  const id = raw.id as string;
  if (accepted.has(id) || id === 'root' || !parentType) return null;
  let def;
  let parentDef;
  try {
    def = pieces.get(type);
    parentDef = pieces.get(parentType);
  } catch {
    return null;
  }
  const at = raw.attach;
  if (!isObj(at) || !vec(at.entryPoint) || !vec(at.direction) || len(at.direction) < 1e-6) return null;
  const mode = at.mode as AttachMode;
  // La conexión tiene que ser posible con las reglas de las piezas.
  if (mode === 'paint' && def.frame !== 'free') return null;
  if (mode === 'pierce' && !(def.canPierce && parentDef.canBePierced)) return null;
  if (mode === 'tail' && !(def.mountsOnTail && parentDef.tailMount)) return null;
  if (mode !== 'paint' && mode !== 'pierce' && mode !== 'tail') return null;
  const depth = num(at.depth) ? Math.max(0, at.depth) : 0;
  const params = isObj(raw.params) ? (structuredClone(raw.params) as Record<string, unknown>) : undefined;
  return {
    id,
    type,
    parentId: raw.parentId as string,
    seed: num(raw.seed) ? raw.seed : 1,
    params,
    mount: mode === 'tail' ? 'tail' : undefined,
    entryPoint: [...at.entryPoint] as Vec3,
    direction: unit(at.direction),
    depth: mode === 'pierce' ? Math.min(depth, def.maxDepth) : depth,
    spin: num(at.spin) ? at.spin : 0,
    localMatrix: [], // se reconstruye al cargar
  };
}
