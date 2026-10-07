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
  /** Punto de entrada en coordenadas locales del padre. */
  entryPoint: [number, number, number];
  /** Dirección de inserción (unitaria, local al padre). */
  direction: [number, number, number];
  /** Profundidad de inserción (m) a lo largo de `direction`. */
  depth: number;
  /** Rotación propia alrededor de su eje (rad). */
  spin: number;
  /** Transformación local resultante (matriz 4×4, column-major), derivada de lo anterior. */
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

export class Construction {
  readonly nodes = new Map<string, PieceNode>();
  root: PieceNode;

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
