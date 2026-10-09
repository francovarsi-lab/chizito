import * as THREE from 'three';
import type { Construction, PieceNode } from '../model/Construction';
import type { PieceRegistry } from '../pieces/PieceRegistry';

export interface SurfaceHit {
  node: PieceNode;
  point: THREE.Vector3; // mundo
  normal: THREE.Vector3; // mundo, saliente, suavizada
}

/**
 * Raycasting de la interacción: bowls y superficies que se pueden atravesar (piezas con
 * `canBePierced`, empezando por el chizito raíz). Todo en coordenadas de mundo.
 */
export class Picker {
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  /** Objetos a ignorar (la pieza en la mano, indicadores). */
  readonly ignore = new Set<THREE.Object3D>();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly construction: Construction,
    private readonly pieces: PieceRegistry,
    readonly bowls: Map<string, THREE.Object3D>,
  ) {}

  private setRay(ndcX: number, ndcY: number): THREE.Raycaster {
    this.ndc.set(ndcX, ndcY);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray;
  }

  /** Tipo de pieza del bowl bajo el cursor, o null. */
  pickBowl(ndcX: number, ndcY: number): string | null {
    const ray = this.setRay(ndcX, ndcY);
    let best: { type: string; d: number } | null = null;
    for (const [type, bowl] of this.bowls) {
      const hit = ray.intersectObject(bowl, true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { type, d: hit.distance };
    }
    // Un bowl tapado por el chizito no cuenta.
    if (best) {
      const s = this.pickSurfaceRaw(ray);
      if (s && s.distance < best.d) return null;
    }
    return best?.type ?? null;
  }

  /**
   * Pieza YA COLOCADA bajo el cursor (no la raíz), o null. Si lo primero que toca el rayo es el
   * chizito u otra superficie, devuelve null.
   */
  pickPlaced(ndcX: number, ndcY: number): PieceNode | null {
    const ray = this.setRay(ndcX, ndcY);
    const hits = ray.intersectObject(this.construction.root.object, true);
    for (const h of hits) {
      if (!(h.object as THREE.Mesh).isMesh || h.object.userData.noPick) continue;
      const node = this.ownerNode(h.object);
      if (!node) continue; // ignorado (pieza en la mano)
      return node === this.construction.root ? null : node;
    }
    return null;
  }

  /** Superficie atravesable bajo el cursor (con normal suavizada), o null. */
  pickSurface(ndcX: number, ndcY: number): SurfaceHit | null {
    const raw = this.pickSurfaceRaw(this.setRay(ndcX, ndcY));
    if (!raw) return null;
    return { node: raw.node, point: raw.point, normal: this.smoothNormal(raw.node, raw.point, raw.normal) };
  }

  /** Primera superficie de CUALQUIER pieza colocada (incluida la raíz) bajo el cursor: para pintar. */
  pickAnyPiece(ndcX: number, ndcY: number): SurfaceHit | null {
    const ray = this.setRay(ndcX, ndcY);
    const hits = ray.intersectObject(this.construction.root.object, true);
    for (const h of hits) {
      // Sobre el ketchup no se pinta: se sigue a la pieza que está debajo.
      if (!(h.object as THREE.Mesh).isMesh || h.object.userData.noPick || h.object.userData.stroke) continue;
      const node = this.ownerNode(h.object);
      if (!node) continue;
      const own: THREE.Mesh[] = [];
      node.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.visible && !m.userData.noPick && !m.userData.stroke && this.ownerNode(m) === node) own.push(m);
      });
      const n = hitNormal(h, h.object as THREE.Mesh);
      // En piezas finitas (palitos) los rayos vecinos se caerían por el costado: normal directa.
      const thin = this.pieces.get(node.data.type).dimensions.thickness < 0.006;
      return { node, point: h.point.clone(), normal: thin ? n : this.averageNormal(own, h.point, n) };
    }
    return null;
  }

  /**
   * Superficie de un objeto suelto (p. ej. el chizito en la mano que se va a ensartar), aunque esté
   * en `ignore`. Normal suavizada como en `pickSurface`.
   */
  pickObject(ndcX: number, ndcY: number, obj: THREE.Object3D): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    const ray = this.setRay(ndcX, ndcY);
    const meshes: THREE.Mesh[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible && !m.userData.noPick && !this.belongsToOtherPiece(m, obj)) meshes.push(m);
    });
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const n = hitNormal(hit, hit.object as THREE.Mesh);
    return { point: hit.point.clone(), normal: this.averageNormal(meshes, hit.point, n) };
  }

  /** true si la malla es de una pieza clavada dentro de `obj` (y no de `obj` mismo). */
  private belongsToOtherPiece(m: THREE.Object3D, obj: THREE.Object3D): boolean {
    for (let cur: THREE.Object3D | null = m; cur && cur !== obj; cur = cur.parent) if (cur.userData.pieceId) return true;
    return false;
  }

  private targets(): { mesh: THREE.Mesh; node: PieceNode }[] {
    const out: { mesh: THREE.Mesh; node: PieceNode }[] = [];
    for (const node of this.construction.nodes.values()) {
      if (!this.pieces.get(node.data.type).canBePierced) continue;
      node.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible || m.userData.noPick) return;
        // Sólo las mallas propias de la pieza, no las de sus hijas.
        if (this.ownerNode(m) !== node) return;
        out.push({ mesh: m, node });
      });
    }
    return out;
  }

  /** Nodo dueño de un objeto: el ancestro más cercano con pieceId. */
  ownerNode(o: THREE.Object3D): PieceNode | null {
    let cur: THREE.Object3D | null = o;
    while (cur) {
      if (this.ignore.has(cur)) return null;
      const id = cur.userData.pieceId as string | undefined;
      if (id) return this.construction.get(id) ?? null;
      cur = cur.parent;
    }
    return null;
  }

  private pickSurfaceRaw(ray: THREE.Raycaster) {
    let best: { node: PieceNode; point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null = null;
    for (const { mesh, node } of this.targets()) {
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit || (best && hit.distance >= best.distance)) continue;
      best = { node, point: hit.point.clone(), normal: hitNormal(hit, mesh), distance: hit.distance };
    }
    return best;
  }

  /**
   * La superficie de un chizito es grumosa: la normal de un solo triángulo salta mucho.
   * Se promedian las normales de 4 rayos vecinos (±1,8 mm) disparados contra la superficie.
   */
  private smoothNormal(node: PieceNode, p: THREE.Vector3, n: THREE.Vector3): THREE.Vector3 {
    return this.averageNormal(this.targets().filter((t) => t.node === node).map((t) => t.mesh), p, n);
  }

  private averageNormal(meshes: THREE.Mesh[], p: THREE.Vector3, n: THREE.Vector3): THREE.Vector3 {
    const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1);
    const acc = n.clone();
    const r = 0.0018;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const origin = p.clone().addScaledVector(n, 0.006).addScaledVector(t1, a * r).addScaledVector(t2, b * r);
      this.ray.set(origin, n.clone().negate());
      const hits = this.ray.intersectObjects(meshes, false);
      if (hits[0] && hits[0].distance < 0.012) acc.add(hitNormal(hits[0], hits[0].object as THREE.Mesh));
    }
    return acc.normalize();
  }
}

function hitNormal(hit: THREE.Intersection, mesh: THREE.Mesh): THREE.Vector3 {
  const n = (hit.normal ?? hit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();
  return n.transformDirection(mesh.matrixWorld).normalize();
}
