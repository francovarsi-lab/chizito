import * as THREE from 'three';

/**
 * Micro-sacudida del chizito (y todo lo clavado): un resorte amortiguado sobre la posición del pivote.
 * `kick` da un golpecito en una dirección (unos mm); `tremble` agrega un temblor mínimo continuo
 * mientras la pieza entra. La posición de reposo nunca cambia.
 */
export class Shake {
  private readonly offset = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private trembleAmount = 0;
  private t = 0;
  /** Rigidez (1/s²) y amortiguación (1/s) del resorte. */
  stiffness = 1400;
  damping = 18;

  constructor(
    private readonly target: THREE.Object3D,
    private readonly rest: THREE.Vector3,
  ) {}

  /** Golpecito: velocidad inicial en la dirección dada (m/s). 0,12 ≈ 2-3 mm de recorrido. */
  kick(dir: THREE.Vector3, strength = 0.12): void {
    this.vel.addScaledVector(dir.clone().normalize(), strength);
  }

  /** Temblor mientras se hunde (0..1); decae solo si no se renueva. */
  tremble(amount: number): void {
    this.trembleAmount = Math.max(this.trembleAmount, amount);
  }

  update(dt: number): void {
    this.t += dt;
    // Resorte amortiguado: a = -k·x - c·v
    const ax = -this.stiffness * this.offset.x - this.damping * this.vel.x;
    const ay = -this.stiffness * this.offset.y - this.damping * this.vel.y;
    const az = -this.stiffness * this.offset.z - this.damping * this.vel.z;
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.vel.z += az * dt;
    this.offset.addScaledVector(this.vel, dt);
    const tr = this.trembleAmount * 0.00012;
    this.trembleAmount *= Math.exp(-dt * 12);
    this.target.position
      .copy(this.rest)
      .add(this.offset)
      .add(new THREE.Vector3(Math.sin(this.t * 97) * tr, Math.sin(this.t * 83 + 1) * tr, Math.sin(this.t * 71 + 2) * tr));
  }
}
