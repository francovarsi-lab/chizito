import * as THREE from 'three';
import type { V3 } from '../types';

export interface Chord {
  /** Distancia a lo largo del rayo donde entra y donde sale del sólido. */
  tIn: number;
  tOut: number;
  /** Normales salientes en cada punto (suavizadas). */
  entryNormal: V3 | null;
  exitNormal: V3;
}

const ray = new THREE.Raycaster();
const T = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

function faceNormal(h: THREE.Intersection): THREE.Vector3 {
  return (h.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().transformDirection(h.object.matrixWorld);
}

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
    ray.set(origin, n.clone().negate());
    ray.near = 0;
    ray.far = 0.012;
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) {
      const fn = faceNormal(hit);
      if (fn.dot(n) > 0) acc.add(fn);
    }
  }
  return arr(acc.normalize());
}

/**
 * Tramo de un rayo que está dentro de los sólidos dados. Se busca de los dos lados (hacia adelante desde
 * `origin` y hacia atrás desde el otro extremo `origin + dir·maxLen`) porque las mallas solo se ven de afuera:
 * así se encuentra la salida aunque el origen esté adentro. Con `startsInside` el origen ya está sobre la
 * superficie de entrada (una vara que entra) y el tramo arranca en 0.
 */
export function chordAlong(meshes: THREE.Mesh[], origin: V3, dir: V3, maxLen: number, startsInside = false): Chord | null {
  const o = T(origin);
  const d = T(dir).normalize();
  let fwd: THREE.Intersection | undefined;
  if (!startsInside) {
    ray.set(o, d);
    ray.near = 0;
    ray.far = maxLen;
    fwd = ray.intersectObjects(meshes, false)[0];
    if (!fwd) return null;
  }
  ray.set(o.clone().addScaledVector(d, maxLen), d.clone().negate());
  ray.near = 0;
  ray.far = maxLen;
  const rev = ray.intersectObjects(meshes, false)[0];
  if (!rev) return null;
  const tOut = maxLen - rev.distance;
  const tIn = fwd ? fwd.distance : 0;
  if (tOut <= tIn + 1e-9) return null;
  let en = fwd ? faceNormal(fwd) : null;
  if (en && en.dot(d) > 0) en.negate();
  const ex = faceNormal(rev);
  if (ex.dot(d) < 0) ex.negate();
  const entryNormal = en && fwd ? smoothNormal(meshes, arr(fwd.point), arr(en)) : null;
  return { tIn, tOut, entryNormal, exitNormal: smoothNormal(meshes, arr(rev.point), arr(ex)) };
}
