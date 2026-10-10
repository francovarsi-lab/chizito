import * as THREE from 'three';

/**
 * Modelo de la construcción: un ÁRBOL de piezas. La raíz es el chizito central, que es una
 * pieza más (tipo 'chizito', sin padre). Cada pieza clavada guarda cómo se clavó, en coordenadas
 * locales de su padre, para poder reconstruirla y serializarla.
 */
export interface PieceData {
  id: string;
  type: string;
  parentId: string | null;
  /** Semilla de variación del modelo procedural. */
  seed: number;
  /** Parámetros de forma/variante elegidos por el jugador (mordiscos, variante…). Opcional. */
  params?: Record<string, unknown>;
  /**
   * 'tail': la pieza se ensartó en la cola libre de su padre (chizito sobre un palito). En ese caso
   * `entryPoint` y `direction` están en coordenadas de la PROPIA pieza (por dónde le entra el palito).
   */
  mount?: 'tail';
  /** Punto de entrada en coordenadas locales del padre. */
  entryPoint: [number, number, number];
  /** Dirección de inserción (unitaria, local al padre). */
  direction: [number, number, number];
  /** Profundidad de inserción (m) a lo largo de `direction`. */
  depth: number;
  /** Rotación propia alrededor de su eje (rad). */
  spin: number;
  /**
   * Transformación local resultante (matriz 4×4, column-major). Es un DERIVADO (caché para deshacer):
   * no se guarda en el archivo de la criatura; al cargar se reconstruye con `poseFromData`.
   */
  localMatrix: number[];
}

export interface PieceNode {
  data: PieceData;
  object: THREE.Object3D;
  children: PieceNode[];
  parent: PieceNode | null;
}

let counter = 0;
export function newPieceId(type: string): string {
  counter++;
  return `${type}-${Date.now().toString(36)}-${counter}`;
}

/** Frente de combate por defecto (+X) y su "arriba" (+Y), en coordenadas del chizito raíz. */
export const DEFAULT_COMBAT_FRONT: [number, number, number] = [1, 0, 0];
export const DEFAULT_COMBAT_UP: [number, number, number] = [0, 1, 0];

/**
 * Lado de cara del CONSTRUCTOR (fijo): el costado +Z del chizito raíz, el que mira a la cámara en la
 * posición inicial (parado). F vuelve a esa pose y marca este lado. No es el frente de combate.
 */
export const BUILDER_FACE: [number, number, number] = [0, 0, 1];

export class Construction {
  readonly nodes = new Map<string, PieceNode>();
  root: PieceNode;
  /**
   * FRENTE DE COMBATE de la criatura: dato por criatura, ±X del chizito raíz (por defecto +X), con +Y
   * "arriba". Se elige en la vista de combate (intérprete); el constructor no lo toca: lo conserva, lo
   * guarda en el archivo y lo respeta al cargar. (No confundir con el lado de cara del constructor,
   * `BUILDER_FACE`, que es fijo y sólo sirve para la pose inicial y la marca de F.)
   */
  readonly front = new THREE.Vector3(1, 0, 0);
  readonly up = new THREE.Vector3(0, 1, 0);

  constructor(rootType: string, rootSeed: number, rootObject: THREE.Object3D) {
    const data: PieceData = {
      id: 'root',
      type: rootType,
      parentId: null,
      seed: rootSeed,
      entryPoint: [0, 0, 0],
      direction: [0, -1, 0],
      depth: 0,
      spin: 0,
      localMatrix: new THREE.Matrix4().toArray(),
    };
    this.root = { data, object: rootObject, children: [], parent: null };
    rootObject.userData.pieceId = data.id;
    this.nodes.set(data.id, this.root);
  }

  get(id: string): PieceNode | undefined {
    return this.nodes.get(id);
  }

  /** Agrega una pieza ya posicionada como hija de `parentId` (en el grafo de escena y en el árbol). */
  add(data: PieceData, object: THREE.Object3D): PieceNode {
    const parent = this.nodes.get(data.parentId ?? '');
    if (!parent) throw new Error(`Padre inexistente: ${data.parentId}`);
    const node: PieceNode = { data, object, children: [], parent };
    object.userData.pieceId = data.id;
    parent.children.push(node);
    parent.object.add(object);
    this.nodes.set(data.id, node);
    return node;
  }

  /** Quita una pieza y todo su subárbol. Devuelve los nodos quitados (para deshacer). */
  remove(id: string): PieceNode[] {
    const node = this.nodes.get(id);
    if (!node || node === this.root) return [];
    const removed: PieceNode[] = [];
    const walk = (n: PieceNode) => {
      removed.push(n);
      this.nodes.delete(n.data.id);
      n.children.forEach(walk);
    };
    walk(node);
    node.parent?.children.splice(node.parent.children.indexOf(node), 1);
    node.object.removeFromParent();
    return removed;
  }

  /**
   * Lleva la construcción a `list` (piezas sin la raíz, en orden padre→hijo). Reutiliza los nodos
   * existentes por id; los que faltan se crean con `factory`. Base de deshacer/rehacer y de la carga.
   * Devuelve los objetos quitados (por si se quieren reutilizar después).
   */
  restore(
    list: PieceData[],
    factory: (d: PieceData) => THREE.Object3D,
    /** Si se da, la pose se reconstruye desde los datos de conexión (carga de archivo) en vez de `localMatrix`. */
    pose?: (d: PieceData, parent: THREE.Object3D) => THREE.Matrix4,
  ): THREE.Object3D[] {
    const want = new Set(list.map((d) => d.id));
    const removed: THREE.Object3D[] = [];
    // Quitar lo que sobra (de las hojas hacia arriba).
    const toRemove = [...this.nodes.values()].filter((n) => n !== this.root && !want.has(n.data.id)).reverse();
    for (const n of toRemove) {
      n.parent?.children.splice(n.parent.children.indexOf(n), 1);
      n.object.removeFromParent();
      this.nodes.delete(n.data.id);
      removed.push(n.object);
    }
    // Agregar / actualizar en orden padre→hijo.
    for (const src of list) {
      const d: PieceData = {
        ...src,
        entryPoint: [...src.entryPoint] as [number, number, number],
        direction: [...src.direction] as [number, number, number],
        localMatrix: [...src.localMatrix],
        params: src.params ? structuredClone(src.params) : undefined,
      };
      const parent = this.nodes.get(d.parentId ?? '');
      if (!parent) continue;
      let node = this.nodes.get(d.id);
      if (!node) {
        const object = factory(d);
        object.userData.pieceId = d.id;
        node = { data: d, object, children: [], parent };
        this.nodes.set(d.id, node);
        parent.children.push(node);
      } else {
        node.data = d;
        if (node.parent !== parent) {
          node.parent?.children.splice(node.parent.children.indexOf(node), 1);
          parent.children.push(node);
          node.parent = parent;
        }
      }
      parent.object.add(node.object);
      if (pose) d.localMatrix = pose(d, parent.object).toArray();
      new THREE.Matrix4().fromArray(d.localMatrix).decompose(node.object.position, node.object.quaternion, node.object.scale);
    }
    return removed;
  }

  /** Todas las piezas en orden padre→hijo (apto para serializar). */
  list(): PieceData[] {
    const out: PieceData[] = [];
    const walk = (n: PieceNode) => {
      out.push(n.data);
      n.children.forEach(walk);
    };
    walk(this.root);
    return out;
  }
}
