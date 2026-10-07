import * as THREE from 'three';
import type { PieceData } from '../model/Construction';

/**
 * Geometría del clavado (todo en coordenadas locales del padre):
 *  - `entry`: punto de entrada sobre la superficie.
 *  - `normal`: normal saliente en ese punto; `u`, `v`: tangentes (u ≈ derecha de la cámara al apuntar).
 *  - `tiltX`, `tiltY`: inclinación del palito respecto de la normal, hacia u y hacia v (rad).
 *  - `depth`: cuánto avanzó la punta hacia adentro desde `entry` (negativo = todavía afuera).
 * La pieza usa el marco 'tip': punta en el origen, cuerpo hacia +Y, así que su +Y local apunta
 * hacia afuera (eje `axis`) y la inserción avanza en −axis.
 */
export const MAX_TILT = THREE.MathUtils.degToRad(85);
/** Separación de la punta respecto de la superficie mientras se apunta (m). */
export const AIM_GAP = 0.0006;

export class Aim {
  readonly entry = new THREE.Vector3();
  readonly normal = new THREE.Vector3(0, 1, 0);
  readonly u = new THREE.Vector3(1, 0, 0);
  readonly v = new THREE.Vector3(0, 0, 1);
  tiltX = 0;
  tiltY = 0;
  depth = -AIM_GAP;
  spin = 0;
  /** Una vez que la punta entra, el ángulo queda trabado. */
  get locked(): boolean {
    return this.depth > 0;
  }

  /** Fija el marco en el punto: n y la "derecha" de la cámara, ambos ya en el espacio del padre. */
  setFrame(entry: THREE.Vector3, normal: THREE.Vector3, cameraRight: THREE.Vector3): void {
    this.entry.copy(entry);
    this.normal.copy(normal).normalize();
    this.u.copy(cameraRight).addScaledVector(this.normal, -cameraRight.dot(this.normal));
    if (this.u.lengthSq() < 1e-8) this.u.set(1, 0, 0).addScaledVector(this.normal, -this.normal.x);
    this.u.normalize();
    this.v.crossVectors(this.normal, this.u).normalize();
  }

  /** Suma inclinación (rad) respetando el límite de 85° respecto de la normal. */
  addTilt(dx: number, dy: number): void {
    if (this.locked) return;
    this.tiltX = THREE.MathUtils.clamp(this.tiltX + dx, -MAX_TILT, MAX_TILT);
    this.tiltY = THREE.MathUtils.clamp(this.tiltY + dy, -MAX_TILT, MAX_TILT);
    // Ángulo total = acos(cos tx · cos ty): si se pasa, se escalan ambos.
    const minCos = Math.cos(MAX_TILT);
    for (let i = 0; i < 20 && Math.cos(this.tiltX) * Math.cos(this.tiltY) < minCos; i++) {
      this.tiltX *= 0.97;
      this.tiltY *= 0.97;
    }
  }

  /** Eje saliente del palito (de la punta hacia la cola), local al padre. */
  axis(out = new THREE.Vector3()): THREE.Vector3 {
    const sx = Math.sin(this.tiltX);
    const cx = Math.cos(this.tiltX);
    const sy = Math.sin(this.tiltY);
    const cy = Math.cos(this.tiltY);
    return out
      .copy(this.u)
      .multiplyScalar(sx)
      .addScaledVector(this.v, cx * sy)
      .addScaledVector(this.normal, cx * cy)
      .normalize();
  }

  /** Posición y orientación locales de la pieza para el estado actual. */
  pose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    const a = this.axis();
    position.copy(this.entry).addScaledVector(a, -this.depth);
    quaternion.setFromUnitVectors(Y_UP, a);
    quaternion.multiply(SPIN.setFromAxisAngle(Y_UP, this.spin));
  }

  /** Ángulos para mostrar: respecto de la superficie, en cada eje (90° = perpendicular). */
  displayAngles(): [number, number] {
    const d = THREE.MathUtils.radToDeg;
    return [Math.round(90 - Math.abs(d(this.tiltX))), Math.round(90 - Math.abs(d(this.tiltY)))];
  }

  /** Vuelca el estado al formato persistible de la pieza. */
  writeData(data: PieceData, object: THREE.Object3D): void {
    const a = this.axis();
    data.entryPoint = this.entry.toArray() as [number, number, number];
    data.direction = a.clone().negate().toArray() as [number, number, number];
    data.depth = Math.max(0, this.depth);
    data.spin = this.spin;
    object.updateMatrix();
    data.localMatrix = object.matrix.toArray();
  }
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const SPIN = new THREE.Quaternion();
