import * as THREE from 'three';
import { PIECE_DEFS, PieceType } from './pieces';

let idCounter = 1;
export function nextId() { return 'p' + idCounter++; }

export interface PieceData {
  id: string;
  type: PieceType;
  parentId: string | null;
  entry: [number, number, number]; // en espacio local del padre
  dir: [number, number, number];   // normalizado, espacio local del padre
  depth: number;
  spin: number;
  dir0?: [number, number, number];
  seed: number;
}

export class PieceNode {
  data: PieceData;
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  children: PieceNode[] = [];
  parent: PieceNode | null = null;

  constructor(data: PieceData, overrideMesh?: THREE.Object3D) {
    this.data = data;
    this.pivot = new THREE.Group();
    const def = PIECE_DEFS[data.type];
    this.mesh = (overrideMesh as THREE.Mesh) ?? def.buildMesh(data.seed);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.applyTransform();
    this.pivot.add(this.mesh);
  }

  applyTransform() {
    const def = PIECE_DEFS[this.data.type];
    const dir = new THREE.Vector3(...this.data.dir).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.pivot.position.set(...this.data.entry);
    this.pivot.quaternion.copy(q);
    this.mesh.position.set(0, this.data.depth - def.length / 2, 0);
    this.mesh.rotation.y = this.data.spin;
  }

  maxDepth() {
    const def = PIECE_DEFS[this.data.type];
    return def.length - def.minDepthOutside;
  }

  setHighlight(on: boolean) {
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.emissive = new THREE.Color(on ? 0x554422 : 0x000000);
  }
}

export class Construction {
  root: PieceNode;
  nodes = new Map<string, PieceNode>();
  group: THREE.Group; // va a la escena, se rota libremente

  constructor() {
    this.group = new THREE.Group();
    const rootData: PieceData = { id: 'root', type: 'chizito', parentId: null, entry: [0, 0, 0], dir: [0, 1, 0], depth: 0, spin: 0, seed: Math.random() * 100 };
    this.root = new PieceNode(rootData);
    this.nodes.set('root', this.root);
    this.group.add(this.root.pivot);
  }

  add(parent: PieceNode, type: PieceType, entry: THREE.Vector3, dir: THREE.Vector3, seed = Math.random() * 100): PieceNode {
    const data: PieceData = {
      id: nextId(), type, parentId: parent.data.id,
      entry: [entry.x, entry.y, entry.z], dir: [dir.x, dir.y, dir.z],
      depth: 0, spin: Math.random() * Math.PI * 2, seed,
    };
    const node = new PieceNode(data);
    node.parent = parent;
    parent.children.push(node);
    parent.pivot.add(node.pivot);
    this.nodes.set(data.id, node);
    return node;
  }

  remove(node: PieceNode) {
    if (node === this.root) return;
    // ponytail: se quita el subárbol completo con la pieza (límite conocido:
    // no se puede "rescatar" lo que colgaba de una pieza eliminada).
    for (const child of [...node.children]) this.remove(child);
    node.parent?.pivot.remove(node.pivot);
    node.parent?.children.splice(node.parent.children.indexOf(node), 1);
    this.nodes.delete(node.data.id);
  }

  reset() {
    for (const child of [...this.root.children]) this.remove(child);
  }

  serialize(): { version: 1; pieces: PieceData[] } {
    const order: PieceData[] = [];
    const walk = (n: PieceNode) => { order.push(n.data); for (const c of n.children) walk(c); };
    walk(this.root);
    return { version: 1, pieces: order };
  }

  static fromJSON(json: { version: number; pieces: PieceData[] }): Construction {
    const c = new Construction();
    const rootData = json.pieces.find(p => p.parentId === null);
    if (rootData) { c.root.data = rootData; c.root.applyTransform(); c.nodes.delete('root'); c.nodes.set(rootData.id, c.root); }
    for (const data of json.pieces) {
      if (data.parentId === null) continue;
      const parent = c.nodes.get(data.parentId);
      if (!parent) continue;
      const node = new PieceNode(data);
      node.parent = parent;
      parent.children.push(node);
      parent.pivot.add(node.pivot);
      c.nodes.set(data.id, node);
    }
    return c;
  }
}
