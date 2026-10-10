import * as THREE from 'three';
import type { PieceNode } from '../../model/Construction';

/**
 * Mallas PROPIAS de una pieza: las que la dibujan a ella, sin las de las piezas que cuelgan de ella (palitos
 * clavados, chizito ensartado, ketchup) ni la decoración (migas, marca del frente: `noPick`). Es el mismo criterio
 * con el que `Picker` decide qué se puede apuntar.
 */
export function ownMeshes(node: PieceNode): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.userData.pieceId) continue; // otra pieza
      if (c.userData.noPick) continue;
      const m = c as THREE.Mesh;
      if (m.isMesh && m.visible) out.push(m);
      walk(c);
    }
  };
  const self = node.object as THREE.Mesh;
  if (self.isMesh && self.visible && !self.userData.noPick) out.push(self);
  walk(node.object);
  return out;
}

/** Caja de las mallas propias en el marco local de la pieza (el de su objeto). */
export function localBox(node: PieceNode, meshes: THREE.Mesh[]): THREE.Box3 {
  node.object.updateMatrixWorld(true);
  const toLocal = node.object.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const m of meshes) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!;
    const mat = toLocal.clone().multiply(m.matrixWorld);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) box.expandByPoint(corner.set(x, y, z).applyMatrix4(mat));
  }
  return box;
}

/**
 * Área de material de una pieza plana vista desde `normal` (en el marco local de la pieza): suma de los triángulos
 * proyectados sobre el plano, dividida por 2 porque una losa tiene cara y contracara.
 */
export function projectedArea(node: PieceNode, meshes: THREE.Mesh[], normal: THREE.Vector3): number {
  const toLocal = node.object.matrixWorld.clone().invert();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let sum = 0;
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position');
    const idx = m.geometry.getIndex();
    const mat = toLocal.clone().multiply(m.matrixWorld);
    const tri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mat);
      b.fromBufferAttribute(pos, i1).applyMatrix4(mat);
      c.fromBufferAttribute(pos, i2).applyMatrix4(mat);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      sum += Math.abs(ab.cross(ac).dot(normal)) / 2;
    }
  }
  return sum / 2;
}
