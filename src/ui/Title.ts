/**
 * Pantalla de título de la intro: "Cumpleañitos" sobre el plano general de la mesa, con confeti y
 * "tocá para empezar" titilando. La estética del juego todavía está en proceso: hay tres estilos para
 * comparar con ?titulo= (arcade | globo | neon), todos en CSS (index.html, `#title`). Cambiar el
 * texto o el estilo no toca nada del juego.
 */
export type TitleStyle = 'arcade' | 'globo' | 'neon';

const CANDY = ['#ff6f91', '#ffb547', '#3cc9b4', '#8f6be8', '#4d9cf0', '#ff8fb8'];

export class Title {
  private readonly el: HTMLElement;

  constructor(text: string, subtitle: string, style: TitleStyle) {
    this.el = document.createElement('div');
    this.el.id = 'title';
    this.el.dataset.style = style;
    const logo = document.createElement('h1');
    logo.className = 'logo';
    logo.setAttribute('aria-label', text);
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.setProperty('--c', CANDY[i % CANDY.length]);
      s.style.setProperty('--i', String(i));
      logo.appendChild(s);
    });
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = subtitle;
    const start = document.createElement('div');
    start.className = 'start';
    start.textContent = 'tocá para empezar';
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    for (let i = 0; i < 36; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = CANDY[i % CANDY.length];
      c.style.animationDelay = `${-Math.random() * 6}s`;
      c.style.animationDuration = `${4.5 + Math.random() * 3}s`;
      c.style.setProperty('--r', `${Math.random() * 360}deg`);
      confetti.appendChild(c);
    }
    this.el.append(confetti, logo, sub, start);
    document.body.appendChild(this.el);
  }

  /** Se va con las letras saltando hacia afuera; resuelve al terminar. */
  hide(): Promise<void> {
    this.el.classList.add('leaving');
    return new Promise((res) =>
      window.setTimeout(() => {
        this.el.remove();
        res();
      }, 900),
    );
  }
}
