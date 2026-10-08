import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * "Hornea" un grupo estático (p. ej. el contenido de un bowl) en una malla por material,
 * para reducir draw calls. Funciona igual con mallas procedurales o provenientes de GLB.
 */
export function bakeStatic(group: THREE.Object3D, name: string): THREE.Group {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const g = mesh.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    const list = byMat.get(mesh.material) ?? [];
    list.push(g);
    byMat.set(mesh.material, list);
  });
  const out = new THREE.Group();
  out.name = name;
  out.position.copy(group.position);
  out.quaternion.copy(group.quaternion);
  out.scale.copy(group.scale);
  for (const [mat, geos] of byMat) {
    // Piezas de distinto origen (p. ej. hoja y guarda de la espadita) pueden traer atributos
    // distintos: se fusiona sólo lo que tienen todas en común.
    const common = Object.keys(geos[0].attributes).filter((k) => geos.every((g) => g.getAttribute(k)));
    for (const g of geos) {
      for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
      if (!g.index) g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}
