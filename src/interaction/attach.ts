import * as THREE from 'three';
import type { PieceData } from '../model/Construction';
import type { PieceDefinition } from '../pieces/PieceDefinition';

/**
 * Conexiones entre piezas: la pose de una pieza se DERIVA de cómo se conectó (punto de clavado,
 * dirección, profundidad, giro y modo), nunca se guarda suelta. La misma cuenta usan el juego
 * (`Aim.pose`) y la carga de criaturas (`poseFromData`).
 *
 * Modos:
 *  - 'pierce': la punta (marco 'tip') entró en el padre por `entryPoint` (coordenadas del padre),
 *              avanzando según `direction` una distancia `depth`; `spin` gira la pieza sobre su eje.
 *  - 'tail':   la pieza se ensartó en la cola libre del padre; `entryPoint`/`direction` están en
 *              coordenadas de la PROPIA pieza (por dónde le entra la cola del palito).
 *  - 'paint':  trazo dibujado sobre el padre (ketchup): su geometría ya está en coordenadas del padre.
 */
export type AttachMode = 'pierce' | 'tail' | 'paint';

export function attachModeOf(d: PieceData, def: PieceDefinition): AttachMode {
  if (def.frame === 'free') return 'paint';
  return d.mount === 'tail' ? 'tail' : 'pierce';
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

/** Pose de una punta clavada: posición = entrada − eje·profundidad; +Y en el eje saliente; giro propio. */
export function tipPose(entry: THREE.Vector3, axis: THREE.Vector3, depth: number, spin: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, axis);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(Y_UP, spin));
  const pos = entry.clone().addScaledVector(axis, -depth);
  return out.compose(pos, q, ONE);
}

/** Matriz local de una pieza respecto de su padre, reconstruida desde los datos de conexión. */
export function poseFromData(d: PieceData, def: PieceDefinition, parentObject: THREE.Object3D): THREE.Matrix4 {
  const mode = attachModeOf(d, def);
  if (mode === 'paint') return new THREE.Matrix4();
  const entry = new THREE.Vector3().fromArray(d.entryPoint);
  const axis = new THREE.Vector3().fromArray(d.direction).negate().normalize();
  const tip = tipPose(entry, axis, Math.max(0, d.depth), d.spin);
  if (mode === 'pierce') return tip;
  // Ensartada: la cola del padre es una "punta virtual" clavada en esta pieza.
  return tailFrame(parentObject).clone().multiply(tip.invert());
}

/**
 * Marco de la cola de una pieza larga, local a la pieza: origen en el centro del corte de la cola y
 * +Y mirando de vuelta hacia el cuerpo (como la punta de una pieza que se clava). Se calcula una vez
 * a partir de la malla (sirve igual para el procedural y para un GLB).
 */
export function tailFrame(obj: THREE.Object3D): THREE.Matrix4 {
  const cached = obj.userData.tailFrame as THREE.Matrix4 | undefined;
  if (cached) return cached;
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert();
  const meshes: { m: THREE.Mesh; toLocal: THREE.Matrix4 }[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // Sólo la malla propia: nada de lo que tenga colgado (otras piezas).
    for (let cur: THREE.Object3D | null = m; cur && cur !== obj; cur = cur.parent) if (cur.userData.pieceId) return;
    meshes.push({ m, toLocal: inv.clone().multiply(m.matrixWorld) });
  });
  const v = new THREE.Vector3();
  let maxY = -Infinity;
  for (const { m, toLocal } of meshes) {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, v.fromBufferAttribute(pos, i).applyMatrix4(toLocal).y);
  }
  const acc = new THREE.Vector3();
  let n = 0;
  for (const { m, toLocal } of meshes) {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
      if (v.y > maxY - 0.0004) {
        acc.add(v);
        n++;
      }
    }
  }
  acc.divideScalar(Math.max(1, n));
  const frame = new THREE.Matrix4().makeRotationX(Math.PI).setPosition(acc.x, maxY, acc.z);
  obj.userData.tailFrame = frame;
  return frame;
}
