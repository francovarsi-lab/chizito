import type { Input } from '../input/Input';
import type { TrackballRotator } from './TrackballRotator';

/**
 * Máquina de estados explícita de la interacción.
 *   IDLE → HOLDING (pieza en la mano) → AIMING (punto fijado) → INSERTING → PLACED
 *   IDLE → SELECTED_PLACED_PIECE
 * Fase 1: sólo IDLE con rotación. Los demás estados se implementan en las fases siguientes.
 */
export enum InteractionState {
  IDLE = 'IDLE',
  HOLDING = 'HOLDING',
  AIMING = 'AIMING',
  INSERTING = 'INSERTING',
  PLACED = 'PLACED',
  SELECTED_PLACED_PIECE = 'SELECTED_PLACED_PIECE',
}

export class InteractionController {
  state = InteractionState.IDLE;
  /** Se dispara una vez, en la primera interacción del usuario (para ocultar la ayuda). */
  onFirstInteraction: (() => void) | null = null;

  private rotating = false;

  constructor(
    input: Input,
    private readonly rotator: TrackballRotator,
  ) {
    input.onDown((e) => {
      // Rotar: clic derecho o Espacio + clic, en cualquier estado.
      if (e.button === 2 || (e.button === 0 && input.keys.has('Space'))) {
        this.startRotate();
        return;
      }
      // En IDLE, el clic izquierdo sobre el chizito o el vacío también rota el chizito.
      if (e.button === 0 && this.state === InteractionState.IDLE) this.startRotate();
    });
    input.onUp(() => {
      if (this.rotating && !input.buttons.left && !input.buttons.right) this.endRotate();
    });
    input.onMove((e) => {
      if (this.rotating) this.rotator.drag(e.dx, e.dy);
    });
  }

  private startRotate(): void {
    this.rotating = true;
    this.rotator.begin();
    this.firstInteraction();
  }

  private endRotate(): void {
    this.rotating = false;
    this.rotator.end();
  }

  private firstInteraction(): void {
    if (this.onFirstInteraction) {
      this.onFirstInteraction();
      this.onFirstInteraction = null;
    }
  }

  update(dt: number): void {
    this.rotator.update(dt);
  }
}
