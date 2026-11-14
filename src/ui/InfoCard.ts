import { GUARD_KEY, QUAD_KEYS } from '../creature/zones';
import { FIGHT } from '../creature/fight/tuning';

/**
 * Cartel informativo del constructor: qué se puede hacer con cada ingrediente y cómo se reparte el chizito para pelear (la
 * misma línea punteada que se ve sobre él: cabeza, brazos, piernas, izquierda/derecha, con sus teclas). Sale al llegar a la
 * mesa, se cierra con el botón, con la primera pieza que se agarra, o con I (que también lo vuelve a abrir).
 */
/** Puntos de vida que saca cada pieza al pegar (los del juego, `FIGHT.pieceDmg`), de más a menos. */
const POINTS = (
  [
    ['Chupetín', 'chupetin'],
    ['Aceituna', 'aceituna'],
    ['Palito de la selva', 'palito-selva'],
    ['Palito', 'palito'],
    ['Espadita', 'escarbadientes:espadita'],
    ['Escarbadientes', 'escarbadientes'],
  ] as const
)
  .map(([name, key]) => {
    const v = FIGHT.pieceDmg[key];
    return `<div><span>${name}</span><s style="width:${Math.round((v / FIGHT.pieceDmg.chupetin) * 100)}%"></s><b>${Math.round(v)}</b></div>`;
  })
  .join('');

export class InfoCard {
  private readonly el: HTMLElement;
  open = false;

  constructor() {
    const css = document.createElement('style');
    css.textContent = `
#info{position:fixed;left:22px;top:50%;z-index:30;width:min(330px,calc(100vw - 44px));transform:translate(-24px,-50%);opacity:0;pointer-events:none;
  transition:opacity .35s ease,transform .45s cubic-bezier(.2,1.3,.4,1);padding:18px 20px 16px;border-radius:22px;background:rgba(255,250,247,.9);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 0 0 2px #fff,0 18px 40px rgba(110,76,82,.25);color:#5a3a40;
  font:600 14px/1.38 "Nunito",ui-rounded,system-ui,sans-serif}
#info.on{opacity:1;transform:translate(0,-50%);pointer-events:auto}
#info h2{margin:0 0 10px;font:400 21px/1 "Bungee",Impact,sans-serif;color:#e8352b;letter-spacing:.02em}
#info .row{display:flex;gap:14px;align-items:center;margin-bottom:10px}
#info ul{margin:0;padding:0 0 0 2px;list-style:none}
#info li{margin:0 0 7px;padding-left:16px;position:relative}
#info li::before{content:"";position:absolute;left:2px;top:.55em;width:7px;height:7px;border-radius:50%;background:#f6cb43;box-shadow:0 0 0 2px #e8ad2c}
#info b{color:#3a2328}
#info kbd{display:inline-grid;place-items:center;min-width:17px;height:17px;padding:0 3px;border-radius:5px;font:400 10px/1 "Bungee",Impact,sans-serif;color:#fff;background:#e8352b;box-shadow:0 2px 0 #8e1d16}
#info .chz{flex:none;position:relative;width:54px;height:104px;border-radius:27px;overflow:hidden;background:linear-gradient(90deg,#e8ad2c,#f6cb43 38%,#fbe189 58%,#f0bb36);box-shadow:0 0 0 2px #fff,0 4px 12px rgba(110,76,82,.25)}
#info .chz i{position:absolute;left:0;right:0;border-top:2px dashed rgba(90,58,64,.6)}
#info .chz u{position:absolute;top:19%;bottom:0;left:50%;border-left:2px dashed rgba(90,58,64,.6)}
#info .chz span{position:absolute;display:grid;place-items:center;font:400 12px/1 "Bungee",Impact,sans-serif;color:#5a3a40}
#info .go{margin-top:10px;width:100%;border:0;border-radius:14px;padding:10px 0 9px;cursor:pointer;font:400 15px/1 "Bungee",Impact,sans-serif;color:#0d1024;background:linear-gradient(#fff7a8,#ffd23f 50%,#ff9f1c);box-shadow:0 0 0 2px #0d1024,0 4px 0 2px #0d1024}
#info .go:active{transform:translateY(2px)}
#info .pts{margin:10px 0 2px;padding:9px 10px 6px;border-radius:14px;background:rgba(90,58,64,.07)}
#info .pts h3{margin:0 0 6px;font:400 12px/1 "Bungee",Impact,sans-serif;letter-spacing:.06em;color:#5a3a40}
#info .pts div{display:grid;grid-template-columns:104px 1fr 22px;gap:6px;align-items:center;margin-bottom:4px;font-size:12px}
#info .pts s{display:block;height:8px;border-radius:4px;background:linear-gradient(90deg,#ff9f1c,#e8352b);text-decoration:none}
#info .pts b{text-align:right;font:400 12px/1 "Bungee",Impact,sans-serif;color:#e8352b}
#info .pts p{margin:4px 0 0;font-size:11px;opacity:.8}
#info .tip{margin-top:8px;text-align:center;font-size:11px;opacity:.7}`;
    document.head.appendChild(css);
    const K = QUAD_KEYS;
    this.el = document.createElement('div');
    this.el.id = 'info';
    this.el.innerHTML = `<h2>ELEGÍ LOS INGREDIENTES</h2>
<div class="row"><div class="chz"><i style="top:19%"></i><i style="top:75%"></i><u></u>
<span style="left:0;right:0;top:3%;font-size:8px">cabeza</span><span style="left:0;width:50%;top:19%;height:56%">${K.LA}</span><span style="left:50%;width:50%;top:19%;height:56%">${K.RA}</span>
<span style="left:0;width:50%;top:75%;height:25%">${K.LL}</span><span style="left:50%;width:50%;top:75%;height:25%">${K.RL}</span></div>
<div>La línea punteada divide al chizito para pelear: arriba los <b>brazos</b> (<kbd>${K.LA}</kbd> izquierda, <kbd>${K.RA}</kbd> derecha), abajo las <b>piernas</b>, un pedacito (<kbd>${K.LL}</kbd> <kbd>${K.RL}</kbd>). <kbd>${GUARD_KEY}</kbd> se cubre.</div></div>
<ul>
<li>Tocá un recipiente y clavá lo que quieras: palitos, escarbadientes, palitos de la selva…</li>
<li>En la <b>cabeza</b> no hay brazo: lo que pongas ahí pesa y protege.</li>
<li><b>Papitas y nachos</b> son escudos; una <b>aceituna</b> en la punta de un palito pega más fuerte, pero más lento.</li>
<li>El <b>ketchup</b> es para dibujarle la cara (de frente, donde marca la <kbd>F</kbd>).</li>
</ul>
<div class="pts"><h3>CUÁNTO SACA CADA GOLPE</h3>${POINTS}<p>Las piernas pegan un poco más. Lo pesado carga más lento, y si pesa más que el chizito lo vuelve lento y torpe.</p></div>
<button class="go" type="button">¡A ARMAR!</button>
<div class="tip"><kbd>I</kbd> abre y cierra este cartel · cuando esté listo, PELEAR</div>`;
    document.body.appendChild(this.el);
    this.el.querySelector('.go')!.addEventListener('click', () => this.show(false));
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyI' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (document.getElementById('cfh') && !(document.getElementById('cfh') as HTMLElement).hidden) return; // en la pelea no
      this.show(!this.open);
    });
  }

  show(on: boolean): void {
    this.open = on;
    this.el.classList.toggle('on', on);
  }
}
