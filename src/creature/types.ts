/**
 * Contrato `CreatureSnapshot`: la vista DERIVADA de una criatura que lee el intérprete.
 * No se persiste. La fuente de verdad persistida es `CreatureFileV1` (src/persistence/CreatureFile.ts,
 * del chat 3D); el resolver (tanda 7) lo convierte en esto añadiendo la geometría calculada.
 * JSON puro: sin three.js ni referencias a la escena. Coordenadas en el marco local del chizito raíz
 * (eje largo = X), metros.
 */
export type V3 = readonly [number, number, number];
export type V2 = readonly [number, number];

export const SNAPSHOT_SCHEMA = 'chizito.creature-snapshot' as const;
export const SNAPSHOT_VERSION = 1 as const;

export interface CreatureSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  version: typeof SNAPSHOT_VERSION;
  source: { fileFormat: string; fileVersion: number; name: string };
  /** Hoy fijo en la rama 3D (frente +Z, arriba +Y); el contrato lo lee de acá y no lo da por sentado. */
  orientation: { front: V3; up: V3 };
  /** Siempre el chizito raíz: es el único cuerpo. */
  coreId: string;
  /** Núcleo primero, luego padre → hijo. */
  pieces: SnapPiece[];
  /** Una por pieza no raíz. */
  links: SnapLink[];
  budget: { pieceCount: number; maxPieces: number; strokeCount: number; maxStrokes: number };
  warnings: string[];
}

export type PieceKind = 'core' | 'blob' | 'rod' | 'plate' | 'stroke';

/**
 * Forma 3D de una pieza. En 'capsule', `a` y `b` son los EXTREMOS REALES del objeto (punta y cola, o las dos
 * puntas del chizito), no los centros de las tapas; el largo total es |b − a|.
 * Convención de las varas (palito, escarbadientes): `a` es la PUNTA (el extremo que entra) y `b` la COLA.
 */
export type Shape =
  | { kind: 'capsule'; a: V3; b: V3; radius: number }
  | { kind: 'disc'; center: V3; normal: V3; radius: number; thickness: number; solidFraction: number }
  | { kind: 'polyline'; points: V3[]; radius: number };

export interface SnapPiece {
  id: string;
  type: string;
  variant?: string;
  seed: number;
  kind: PieceKind;
  /** Tamaño real resuelto de la malla (no el nominal). */
  shape: Shape;
  /** Ketchup: sin masa, sin caja, sin extremidad. */
  cosmetic: boolean;
  stability: 'stable' | 'unstable';
  /** Fixtures vegetales: la pieza real que esta representa ('zanahoria', 'apio'…). No cambia ningún cálculo. */
  proxyDe?: string;
  params?: Record<string, unknown>;
}

export type LinkMode = 'pierce' | 'tail' | 'paint';

export interface Crossing {
  pieceId: string;
  entry: V3;
  /** Normal saliente de ese sólido en el punto de entrada. */
  normal: V3;
  exit: V3 | null;
  chord: number;
}

export interface SnapLink {
  id: string;
  parentId: string;
  childId: string;
  mode: LinkMode;
  /** Textual del archivo (fuente de verdad). `frame: 'child'` solo en 'tail'. */
  attach: { entryPoint: V3; direction: V3; depth: number; spin: number; frame: 'parent' | 'child' };
  // ── Derivados por el resolver, en marco raíz ──
  /** pierce: entrada en la superficie del padre · tail: punto de soldadura vara↔chizito. */
  anchor: V3;
  /** Normal saliente del sólido en el ancla. */
  normal: V3;
  /** Eje del hijo, de la base hacia su extremo libre. */
  axis: V3;
  tiltFromNormal: number;
  /** Largo del hijo dentro del sólido que lo sostiene. */
  embedded: number;
  /** Espesor de sólido cruzado a lo largo del camino. */
  chord: number | null;
  /** Largo libre del lado de entrada (0 si está empotrada en un chizito). */
  freeTail: number;
  /** Si atraviesa y sale. */
  exit: { point: V3; freeTip: number; normal: V3 } | null;
  /** OTROS sólidos que el hijo también atraviesa (cierra el hueco árbol vs grafo). */
  crossings: Crossing[];
  integrity: 'ok' | 'damaged' | 'broken';
}

// ───────────────────────── Salida del intérprete ─────────────────────────

export type Role = 'support' | 'push' | 'strike' | 'reach' | 'defend';
/** 0..1, no excluyentes. */
export type Caps = Record<Role, number>;

/** Extremidad detectada (tanda 4), todavía sin capacidades ni movilidad (tanda 5). */
export interface LimbDraft {
  id: string;
  /** Pieza que la sostiene del núcleo: la vara. */
  rootPieceId: string;
  end: 'tail' | 'tip' | 'whole';
  /** Grupo rígido: la vara y todo lo que cuelga de ella (chizito ensartado, lo clavado en él, trazos). */
  pieceIds: string[];
  /** Piezas de segundo nivel dentro del grupo (palitos clavados en un chizito ensartado): no son extremidades propias. */
  branchIds: string[];
  pairedWith?: string;
  pivot: V3;
  tip: V3;
  /** |punta − pivote|. */
  length: number;
  /** Lo que sobresale del lado libre (para la condición de largo libre). */
  freeLength: number;
  embedded: number;
  tiltDeg: number;
  anchorQuality: number;
  /** 'own' si la sostiene su propia conexión; si no, el id del otro sólido que también atraviesa. */
  anchoredBy: string;
  /** Fracción de la masa de la vara que le toca (una vara pasante reparte su masa entre sus dos extremidades). */
  massShare: number;
  mass: number;
  endMassRatio: number;
  tag: 'lanza' | 'maza' | 'rama' | 'placa-con-vara';
}

export interface Limb {
  id: string;
  rootPieceId: string;
  end: 'tail' | 'tip' | 'whole';
  /** Grupo rígido: toda la rama que cuelga de ese ancla. */
  pieceIds: string[];
  /** La otra mitad de una vara pasante (comparte integridad). */
  pairedWith?: string;
  pivot: V3;
  tip: V3;
  length: number;
  mass: number;
  endMassRatio: number;
  tag: 'lanza' | 'maza' | 'rama' | 'placa-con-vara';
  caps: Caps;
  dominant: Role | null;
  reach: number;
  strength: number;
  durability: number;
  anchorQuality: number;
  mobility: { restDeg: number; minDeg: number; maxDeg: number; droops: boolean };
  profile: {
    pivot: V2;
    tip: V2;
    angleDeg: number;
    length2D: number;
    foreshortening: number;
    /** Componente de profundidad dominante: se ve corta en reposo, ataca con su largo real al girar al plano. */
    inDepth: boolean;
  };
}

export type DecorativeReason = 'no-free-tip' | 'weak-anchor' | 'too-short' | 'plate' | 'stroke' | 'broken' | 'unknown-type' | 'second-level';
export interface DecorativePiece {
  pieceId: string;
  reason: DecorativeReason;
  mass: number;
}

/** En 2D, 'capsule' es el segmento a→b (centros de las tapas) engrosado en `r`. */
export type Shape2D = { kind: 'capsule'; a: V2; b: V2; r: number } | { kind: 'poly'; pts: V2[] };

export interface HurtGroup {
  id: string;
  /** 'core' o el id de la extremidad dueña. */
  owner: string;
  shapes: Shape2D[];
}

export interface Profile2D {
  facing: 1 | -1;
  origin: V2;
  groups: HurtGroup[];
  bounds: { min: V2; max: V2 };
}

export interface AttackAction {
  id: string;
  kind: 'jab' | 'estocada' | 'golpe-alto' | 'barrida' | 'mazazo' | 'rodada' | 'embestida';
  limbId?: string;
  input: 'attack' | 'forward+attack' | 'up+attack' | 'down+attack' | 'hold+attack';
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  reach: number;
  hitRadius: number;
}

export interface CreatureAnalysis {
  mass: { total: number; core: number; byPiece: Record<string, number>; com: V3; comProfile: V2 };
  limbs: Limb[];
  /** Suman masa, NO son extremidades; el panel lo avisa. */
  decorative: DecorativePiece[];
  support: { feet: string[]; intervalX: [number, number] | null; margin: number; loadRatio: number };
  locomotion: { mode: 'walk' | 'hop' | 'drag' | 'roll' | 'immobile'; speed: number; jump: number; turn: number };
  actions: AttackAction[];
  defense: { kind: 'guard' | 'curl'; limbId?: string; reduction: number };
  profile2D: Profile2D;
  warnings: string[];
}
