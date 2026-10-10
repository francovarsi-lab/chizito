import * as THREE from 'three';

/**
 * Rota un objeto (el chizito raíz, con todas sus piezas hijas) como un trackball:
 * el arrastre en pantalla define un eje perpendicular en el plano de la cámara.
 * Cuaterniones (sin gimbal lock) + inercia con amortiguación exponencial.
 * La cámara nunca se mueve.
 */
export class TrackballRotator {
  /** rad por píxel arrastrado. */
  sensitivity = 0.0062;
  /** Amortiguación de la inercia (1/s): más alto = frena antes. */
  damping = 4.2;

  private dragging = false;
  /** Velocidad angular en espacio mundo (eje * rad/s). */
  private readonly velocity = new THREE.Vector3();
  /** Rotación pendiente: el arrastre se aplica con un leve suavizado para que se sienta físico. */
  private readonly pending = new THREE.Vector3();
  private readonly tmpAxis = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  /** Vuelta animada a la posición inicial (F). */
  private homing: { from: THREE.Quaternion; t: number; onDone?: () => void } | null = null;

  constructor(
    private readonly target: THREE.Object3D,
    private readonly camera: THREE.Camera,
    /** Posición inicial ("de casa"): parado y de frente. */
    private readonly home = target.quaternion.clone(),
  ) {}

  /** Vuelve suave (0,7 s, con un leve rebote) a la posición inicial; cancela la inercia. */
  goHome(onDone?: () => void): void {
    this.stop();
    this.homing = { from: this.target.quaternion.clone(), t: 0, onDone };
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  begin(): void {
    this.homing = null; // agarrar el chizito corta la vuelta a casa
    this.dragging = true;
    this.velocity.set(0, 0, 0);
  }

  /** Delta de puntero en píxeles. */
  drag(dx: number, dy: number): void {
    if (!this.dragging) return;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    // Eje en espacio de cámara perpendicular al arrastre, llevado a mundo.
    this.tmpAxis.set(dy, dx, 0).normalize().applyQuaternion(this.camera.quaternion);
    this.pending.addScaledVector(this.tmpAxis, len * this.sensitivity);
  }

  end(): void {
    this.dragging = false;
  }

  /** Frena en seco (p. ej. al agarrar algo). */
  stop(): void {
    this.velocity.set(0, 0, 0);
    this.pending.set(0, 0, 0);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    if (this.homing) {
      const h = this.homing;
      h.t = Math.min(1, h.t + dt / 0.7);
      // easeOutBack suave: llega, se pasa apenas y se acomoda.
      const c = 1.2;
      const k = 1 + (c + 1) * Math.pow(h.t - 1, 3) + c * Math.pow(h.t - 1, 2);
      this.target.quaternion.slerpQuaternions(h.from, this.home, k).normalize();
      if (h.t >= 1) {
        this.target.quaternion.copy(this.home);
        this.homing = null;
        h.onDone?.();
      }
      return;
    }
    if (this.dragging || this.pending.lengthSq() > 0) {
      // Aplicar una fracción de lo pendiente por frame (seguimiento suave, ~25 ms).
      const k = 1 - Math.exp(-dt / 0.025);
      const step = this.tmpAxis.copy(this.pending).multiplyScalar(k);
      this.pending.sub(step);
      this.applyRotation(step);
      if (this.dragging) {
        // Estimar velocidad para la inercia (filtrada).
        const inst = step.clone().divideScalar(dt);
        this.velocity.lerp(inst, Math.min(1, dt * 18));
      }
      if (!this.dragging && this.pending.lengthSq() < 1e-10) this.pending.set(0, 0, 0);
    }
    if (!this.dragging) {
      if (this.velocity.lengthSq() > 1e-8) {
        this.applyRotation(this.tmpAxis.copy(this.velocity).multiplyScalar(dt));
        this.velocity.multiplyScalar(Math.exp(-this.damping * dt));
      } else {
        this.velocity.set(0, 0, 0);
      }
    }
  }

  private applyRotation(rotVec: THREE.Vector3): void {
    const angle = rotVec.length();
    if (angle < 1e-9) return;
    this.tmpQ.setFromAxisAngle(rotVec.clone().divideScalar(angle), angle);
    this.target.quaternion.premultiply(this.tmpQ).normalize();
  }
}
