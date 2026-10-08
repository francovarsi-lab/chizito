import * as THREE from 'three';

/**
 * Movimiento del chizito (y todo lo clavado), aplicado sobre el pivote:
 *  - entrada: cae desde arriba con un rebote elástico al abrir el juego;
 *  - flotación: respira suave (sube y baja ~1,5 mm, se mece apenas) mientras nadie lo toca;
 *  - golpecito (`kick`): resorte amortiguado de pocos mm en la dirección de la inserción;
 *  - squash (`squash`): pulso elástico de escala, muy leve, al recibir una pieza;
 *  - temblor (`tremble`): mínimo y continuo mientras la pieza entra.
 * La posición de reposo nunca cambia: todo es un desvío que vuelve a cero.
 */
export class Shake {
  private readonly offset = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private trembleAmount = 0;
  private t = 0;
  /** Rigidez (1/s²) y amortiguación (1/s) del resorte del golpecito. */
  stiffness = 1400;
  damping = 18;

  // Entrada (resorte vertical) y squash (resorte de escala).
  private introY = 0;
  private introV = 0;
  private squashX = 0;
  private squashV = 0;
  /** 0 = quieto, 1 = flotación completa (se apaga suave mientras se interactúa). */
  private calm = 1;
  busy = false;

  constructor(
    private readonly target: THREE.Object3D,
    private readonly rest: THREE.Vector3,
  ) {}

  /** Arranca la animación de entrada (cae desde `height` metros con rebote). */
  intro(height = 0.05): void {
    this.introY = height;
    this.introV = 0;
  }

  /** Golpecito: velocidad inicial en la dirección dada (m/s). 0,1 ≈ 2-3 mm de recorrido. */
  kick(dir: THREE.Vector3, strength = 0.1): void {
    this.vel.addScaledVector(dir.clone().normalize(), strength);
  }

  /** Pulso elástico de escala (0,04 ≈ 4 %). */
  squash(amount = 0.035): void {
    this.squashV -= amount * 40;
  }

  /** Temblor mientras se hunde (0..1); decae solo si no se renueva. */
  tremble(amount: number): void {
    this.trembleAmount = Math.max(this.trembleAmount, amount);
  }

  update(dt: number): void {
    this.t += dt;
    // Golpecito: a = -k·x - c·v
    const ax = -this.stiffness * this.offset.x - this.damping * this.vel.x;
    const ay = -this.stiffness * this.offset.y - this.damping * this.vel.y;
    const az = -this.stiffness * this.offset.z - this.damping * this.vel.z;
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.vel.z += az * dt;
    this.offset.addScaledVector(this.vel, dt);

    // Entrada: resorte subamortiguado (cae, rebota dos o tres veces y se asienta).
    this.introV += (-90 * this.introY - 7.5 * this.introV) * dt;
    this.introY += this.introV * dt;

    // Squash: resorte de escala, rápido y gomoso.
    this.squashV += (-520 * this.squashX - 11 * this.squashV) * dt;
    this.squashX += this.squashV * dt;

    // Flotación: se calma mientras se interactúa, vuelve sola.
    this.calm += ((this.busy ? 0.25 : 1) - this.calm) * Math.min(1, dt * 2);
    const bob = Math.sin(this.t * 2 * Math.PI * 0.32) * 0.0015 * this.calm;
    const sway = Math.sin(this.t * 2 * Math.PI * 0.19 + 1.3) * 0.0008 * this.calm;

    const tr = this.trembleAmount * 0.00012;
    this.trembleAmount *= Math.exp(-dt * 12);
    this.target.position.set(
      this.rest.x + this.offset.x + sway + Math.sin(this.t * 97) * tr,
      this.rest.y + this.offset.y + this.introY + bob + Math.sin(this.t * 83 + 1) * tr,
      this.rest.z + this.offset.z + Math.sin(this.t * 71 + 2) * tr,
    );
    // Squash & stretch: se achata un poco y recupera (volumen aproximadamente constante).
    const sq = this.squashX;
    this.target.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
  }
}
