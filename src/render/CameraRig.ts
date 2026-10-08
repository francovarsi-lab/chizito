import * as THREE from 'three';

/**
 * Cámara casi fija con zoom: se acerca o aleja en línea recta hacia el chizito (dolly), con
 * movimiento suave y límites. La dirección de mirada nunca cambia (no hay órbita).
 */
export class CameraRig {
  private readonly dir = new THREE.Vector3();
  private distance: number;
  private targetDistance: number;
  /** true en el frame en que la cámara se movió (para reacomodar lo que depende de ella). */
  moved = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly target: THREE.Vector3,
    start: THREE.Vector3,
    readonly min: number,
    readonly max: number,
    initialDistance: number,
  ) {
    this.dir.subVectors(start, target).normalize();
    this.distance = this.targetDistance = THREE.MathUtils.clamp(initialDistance, min, max);
    this.apply();
  }

  /** Rueda: delta en píxeles (positivo = hacia el usuario = alejarse). Zoom exponencial. */
  zoom(dy: number): void {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * Math.exp(dy * 0.0011), this.min, this.max);
  }

  update(dt: number): void {
    const before = this.distance;
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-dt * 9));
    this.moved = Math.abs(this.distance - before) > 1e-7;
    if (this.moved) this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.target).addScaledVector(this.dir, this.distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}
