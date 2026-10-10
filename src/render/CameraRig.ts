import * as THREE from 'three';

/**
 * Cámara casi fija con zoom: se acerca o aleja en línea recta hacia el chizito (dolly), con
 * movimiento suave y límites. La dirección de mirada nunca cambia (no hay órbita).
 *
 * Intro: arranca en un plano general de la mesa (`startIntro`), que deriva despacio, y con `flyIn`
 * viaja en curva hasta la pose de juego. `focus` es el punto que tiene que quedar nítido.
 */
export interface IntroShot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Lente del plano general (mm); vuelve a la del juego durante el viaje. */
  focalLength: number;
}
export class CameraRig {
  private readonly dir = new THREE.Vector3();
  private distance: number;
  private targetDistance: number;
  /** true en el frame en que la cámara se movió (para reacomodar lo que depende de ella). */
  moved = false;
  /** Punto de foco (el chizito en el juego; el centro de la mesa en el plano general). */
  readonly focus = new THREE.Vector3();
  private intro: { shot: IntroShot; t: number; fly: number; duration: number; onDone?: () => void } | null = null;
  private baseFocal = 50;

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

  /** true mientras dura la intro (plano general o viaje). */
  get inIntro(): boolean {
    return this.intro !== null;
  }

  startIntro(shot: IntroShot): void {
    this.baseFocal = this.camera.getFocalLength();
    this.intro = { shot, t: 0, fly: -1, duration: 3.2 };
    this.applyIntro();
  }

  /** Viaja del plano general a la pose de juego; `onDone` al llegar. */
  flyIn(duration = 3.2, onDone?: () => void): void {
    if (!this.intro) {
      onDone?.();
      return;
    }
    this.intro.fly = 0;
    this.intro.duration = duration;
    this.intro.onDone = onDone;
  }

  /** Rueda: delta en píxeles (positivo = hacia el usuario = alejarse). Zoom exponencial. */
  zoom(dy: number): void {
    if (this.intro) return;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * Math.exp(dy * 0.0011), this.min, this.max);
  }

  update(dt: number): void {
    if (this.intro) {
      this.intro.t += dt;
      if (this.intro.fly >= 0) this.intro.fly = Math.min(1, this.intro.fly + dt / this.intro.duration);
      this.applyIntro();
      this.moved = true;
      if (this.intro.fly >= 1) {
        const done = this.intro.onDone;
        this.intro = null;
        this.camera.setFocalLength(this.baseFocal);
        this.apply();
        done?.();
      }
      return;
    }
    const before = this.distance;
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-dt * 9));
    this.moved = Math.abs(this.distance - before) > 1e-7;
    if (this.moved) this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.target).addScaledVector(this.dir, this.distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.focus.copy(this.target);
  }

  /** Plano general con deriva lenta, o el viaje en curva (ease in-out) hasta la pose de juego. */
  private applyIntro(): void {
    const it = this.intro!;
    const drift = new THREE.Vector3(Math.sin(it.t * 0.23) * 0.05, Math.sin(it.t * 0.17) * 0.012, -Math.min(it.t, 20) * 0.004);
    const wide = it.shot.position.clone().add(drift);
    const wideTarget = it.shot.target;
    const end = this.target.clone().addScaledVector(this.dir, this.distance);
    const f = Math.max(0, it.fly);
    const k = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    // Curva: baja y se acerca, con un punto de control alto para que "planee" hacia el chizito.
    const ctrl = wide.clone().lerp(end, 0.55).add(new THREE.Vector3(0, 0.12, 0));
    const a = wide.clone().lerp(ctrl, k);
    const b = ctrl.clone().lerp(end, k);
    this.camera.position.copy(a.lerp(b, k));
    const look = wideTarget.clone().lerp(this.target, k * k * (3 - 2 * k));
    this.camera.setFocalLength(THREE.MathUtils.lerp(it.shot.focalLength, this.baseFocal, k));
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
    this.focus.copy(look);
  }
}
