import * as THREE from 'three';
import type { V3 } from '../types';
import { nearestHit } from './bvh';

export interface Chord {
  /** Distancia a lo largo del rayo donde entra y donde sale del sólido. */
  tIn: number;
  tOut: number;
  /** Normales salientes de la cara tocada (sin suavizar) y punto de salida (mundo). */
  entryNormal: V3 | null;
  exitNormal: V3;
  exitPoint: V3;
}

const T = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

/**
 * Normal saliente en un punto de la superficie. La superficie de un chizito es grumosa: se promedian las
 * normales de 4 rayos vecinos (±1,8 mm), igual que `Picker.smoothNormal`.
 */
export function smoothNormal(meshes: THREE.Mesh[], point: V3, hint: V3): V3 {
  const n = T(hint).normalize();
  const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1);
  const acc = n.clone();
  const r = 0.0018;
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const origin = T(point).addScaledVector(n, 0.006).addScaledVector(t1, a * r).addScaledVector(t2, b * r);
    const hit = nearestHit(meshes, origin, n.clone().negate(), 0.012);
    if (hit && hit.normal.dot(n) > 0) acc.add(hit.normal);
  }
  return arr(acc.normalize());
}

/**
 * Tramo de un rayo que está dentro de los sólidos dados. Se busca de los dos lados (hacia adelante desde
 * `origin` y hacia atrás desde el otro extremo `origin + dir·maxLen`) porque las mallas solo se ven de afuera:
 * así se encuentra la salida aunque el origen esté adentro. Con `startsInside` el origen ya está sobre la
 * superficie de entrada (una vara que entra) y el tramo arranca en 0.
 * Las normales salen SIN suavizar (baratas); quien las necesite llama a `smoothNormal` en el punto que quiera.
 */
export function chordAlong(meshes: THREE.Mesh[], origin: V3, dir: V3, maxLen: number, startsInside = false): Chord | null {
  const o = T(origin);
  const d = T(dir).normalize();
  let fwd: ReturnType<typeof nearestHit> = null;
  if (!startsInside) {
    fwd = nearestHit(meshes, o, d, maxLen);
    if (!fwd) return null;
  }
  const rev = nearestHit(meshes, o.clone().addScaledVector(d, maxLen), d.clone().negate(), maxLen);
  if (!rev) return null;
  const tOut = maxLen - rev.distance;
  const tIn = fwd ? fwd.distance : 0;
  if (tOut <= tIn + 1e-9) return null;
  const en = fwd ? fwd.normal.clone() : null;
  if (en && en.dot(d) > 0) en.negate();
  const ex = rev.normal.clone();
  if (ex.dot(d) < 0) ex.negate();
  return { tIn, tOut, entryNormal: en ? arr(en) : null, exitNormal: arr(ex), exitPoint: arr(rev.point) };
}
