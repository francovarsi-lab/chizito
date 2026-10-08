/**
 * Normaliza mouse y teclado. La lógica de interacción consume estados (botones, teclas, deltas)
 * y eventos de alto nivel, nunca eventos DOM crudos.
 *
 * Controles de rotación (en cualquier estado): clic derecho + arrastrar, o Espacio + arrastrar.
 */
export interface PointerInfo {
  /** Coordenadas normalizadas (-1..1), y hacia arriba. */
  ndcX: number;
  ndcY: number;
  /** Píxeles CSS. */
  x: number;
  y: number;
}

type Handler<T> = (e: T) => void;

export class Input {
  readonly pointer: PointerInfo = { ndcX: 0, ndcY: 0, x: 0, y: 0 };
  readonly buttons = { left: false, right: false };
  readonly keys = new Set<string>();
  shift = false;
  ctrl = false;

  private listeners = {
    down: [] as Handler<{ button: number; pointer: PointerInfo }>[],
    up: [] as Handler<{ button: number; pointer: PointerInfo }>[],
    move: [] as Handler<{ dx: number; dy: number; pointer: PointerInfo }>[],
    key: [] as Handler<KeyboardEvent>[],
    wheel: [] as Handler<{ dy: number; ctrl: boolean }>[],
  };

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.update(e);
      if (e.button === 0) this.buttons.left = true;
      if (e.button === 2) this.buttons.right = true;
      this.listeners.down.forEach((h) => h({ button: e.button, pointer: this.pointer }));
    });
    el.addEventListener('pointerup', (e) => {
      this.update(e);
      if (e.button === 0) this.buttons.left = false;
      if (e.button === 2) this.buttons.right = false;
      this.listeners.up.forEach((h) => h({ button: e.button, pointer: this.pointer }));
    });
    el.addEventListener('pointermove', (e) => {
      // Delta calculado a partir de la posición (movementX no es confiable con eventos sintéticos).
      const dx = this.hasLast ? e.clientX - this.lastX : 0;
      const dy = this.hasLast ? e.clientY - this.lastY : 0;
      this.update(e);
      this.listeners.move.forEach((h) => h({ dx, dy, pointer: this.pointer }));
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // Normalizar: líneas/páginas → píxeles aproximados.
        const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
        this.listeners.wheel.forEach((h) => h({ dy: e.deltaY * k, ctrl: e.ctrlKey || e.metaKey }));
      },
      { passive: false },
    );
    window.addEventListener('blur', () => {
      this.buttons.left = this.buttons.right = false;
      this.keys.clear();
    });
    window.addEventListener('keydown', (e) => {
      this.shift = e.shiftKey;
      this.ctrl = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
      this.listeners.key.forEach((h) => h(e));
    });
    window.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey;
      this.ctrl = e.ctrlKey || e.metaKey;
      this.keys.delete(e.code);
    });
  }

  /** ¿Está activo el gesto de rotación? (clic derecho, o Espacio + clic izquierdo). */
  get rotateGesture(): boolean {
    return this.buttons.right || (this.keys.has('Space') && this.buttons.left);
  }

  onDown(h: Handler<{ button: number; pointer: PointerInfo }>) { this.listeners.down.push(h); }
  onUp(h: Handler<{ button: number; pointer: PointerInfo }>) { this.listeners.up.push(h); }
  onMove(h: Handler<{ dx: number; dy: number; pointer: PointerInfo }>) { this.listeners.move.push(h); }
  onKey(h: Handler<KeyboardEvent>) { this.listeners.key.push(h); }
  /** Rueda del mouse: delta vertical en píxeles (positivo = hacia el usuario) y si había Ctrl. */
  onWheel(h: Handler<{ dy: number; ctrl: boolean }>) { this.listeners.wheel.push(h); }

  private lastX = 0;
  private lastY = 0;
  private hasLast = false;

  private update(e: PointerEvent): void {
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.hasLast = true;
    const r = this.el.getBoundingClientRect();
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;
    this.pointer.ndcX = (this.pointer.x / r.width) * 2 - 1;
    this.pointer.ndcY = -(this.pointer.y / r.height) * 2 + 1;
    this.shift = e.shiftKey;
    this.ctrl = e.ctrlKey || e.metaKey;
  }
}
