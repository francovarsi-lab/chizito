/**
 * Capa de ayudas mínimas (sin HUD): una línea de ayuda discreta por situación, que aparece sólo la
 * primera vez y se desvanece, y el ángulo de entrada junto al palito. H oculta/muestra todo.
 */
export class Overlay {
  private readonly help: HTMLElement;
  private readonly angle: HTMLElement;
  private readonly shown = new Set<string>();
  private hideTimer = 0;
  hidden = false;

  constructor() {
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
