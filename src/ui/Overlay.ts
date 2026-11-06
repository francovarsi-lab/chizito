/**
 * Capa de ayudas mínimas (sin HUD): una línea de ayuda discreta por situación, que aparece sólo la
 * primera vez y se desvanece, y el ángulo de entrada junto al palito. H oculta/muestra todo.
 */
export class Overlay {
  private readonly help: HTMLElement;
  private readonly angle: HTMLElement;
  private readonly shown = new Set<string>();
  private hideTimer = 0;
  private readonly factCard: HTMLElement;
  private readonly factText: HTMLElement;
  private factTimer = 0;
  hidden = false;

  constructor() {
    this.factCard = document.createElement('div');
    this.factCard.id = 'fact';
    this.factCard.setAttribute('aria-live', 'polite');
    this.factCard.innerHTML = '<div class="band"></div><div class="body"><div class="kicker">¿Sabías que…?</div><div class="text"></div></div><div class="band"></div>';
    this.factText = this.factCard.querySelector('.text')!;
    document.body.appendChild(this.factCard);

    this.help = document.getElementById('help')!;
    this.angle = document.createElement('div');
    this.angle.id = 'angle';
    document.body.appendChild(this.angle);
  }

  /** Muestra una ayuda (sólo la primera vez que se pide esa clave). */
  hint(key: string, text: string, ms = 5200): void {
    if (this.shown.has(key)) return;
    this.shown.add(key);
    this.help.textContent = text;
    this.help.classList.toggle('hidden', this.hidden);
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.help.classList.add('hidden'), ms);
  }

  /**
   * Papel con un dato curioso, de frente a la pantalla: sale volando desde (fromX, fromY) (px CSS, donde
   * se soltó el papel), se queda el tiempo de leerlo y se va. No bloquea el mouse (se sigue jugando).
   */
  fact(text: string, fromX: number, fromY: number): void {
    const card = this.factCard;
    window.clearTimeout(this.factTimer);
    card.classList.remove('in', 'out');
    this.factText.textContent = text;
    // Punto de partida: el centro del papel suelto, relativo a donde va a quedar.
    card.style.setProperty('--dx', '0px');
    card.style.setProperty('--dy', '0px');
    const r = card.getBoundingClientRect();
    card.style.setProperty('--dx', `${Math.round(fromX - (r.left + r.width / 2))}px`);
    card.style.setProperty('--dy', `${Math.round(fromY - (r.top + r.height / 2))}px`);
    void card.offsetWidth; // fija el estado inicial antes de animar
    card.classList.add('in');
    // Tiempo de lectura: base + ~0,05 s por letra (≈ 4,5–6,5 s según el largo).
    const ms = 3200 + text.length * 50;
    this.factTimer = window.setTimeout(() => {
      card.classList.add('out');
      this.factTimer = window.setTimeout(() => card.classList.remove('in', 'out'), 700);
    }, ms);
  }

  /** Mensaje breve que se muestra siempre (confirmaciones, deshacer). */
  flash(text: string, ms = 2200): void {
    this.help.textContent = text;
    this.help.classList.remove('hidden');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.help.classList.add('hidden'), ms);
  }

  /** Oculta la ayuda actual (p. ej. al interactuar). */
  dismissHint(delay = 900): void {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.help.classList.add('hidden'), delay);
  }

  toggle(): void {
    this.hidden = !this.hidden;
    if (this.hidden) {
      this.help.classList.add('hidden');
      this.angle.classList.add('hidden');
    }
  }

  /** Texto del ángulo en una posición de pantalla (px CSS), o null para ocultarlo. */
  setAngle(text: string | null, x = 0, y = 0): void {
    if (text === null || this.hidden) {
      this.angle.classList.add('hidden');
      return;
    }
    this.angle.textContent = text;
    this.angle.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.angle.classList.remove('hidden');
  }
}
