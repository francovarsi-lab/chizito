import { CORE_COLOR, ROLE_COLOR } from './colors';
import { nf, type DecoRow, type LimbRow, type PanelModel, type Warning } from './model';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PanelHandlers {
  onHover(id: string | null): void;
  onFacing(facing: 1 | -1): void;
  onLoad(id: string): void;
}

export interface CreatureOption {
  id: string;
  label: string;
}

export interface RenderState {
  facing: 1 | -1;
  /** Texto de la última carga (avisos del cargador). */
  loadNote: string | null;
  /** Cuánto tardó el último análisis (ms). */
  ms: number;
}

const CSS = `
.cs-panel{contain:layout paint style;will-change:transform;position:fixed;top:12px;right:12px;width:392px;max-height:calc(100vh - 24px);overflow:auto;background:rgba(255,253,247,.95);color:#2b2b2b;border-radius:14px;box-shadow:0 6px 28px rgba(60,40,20,.28);font:12px/1.35 system-ui,sans-serif;z-index:40}
.cs-panel *{box-sizing:border-box}
.cs-head{display:flex;align-items:center;gap:8px;padding:10px 12px 6px;position:sticky;top:0;background:rgba(255,253,247,.97);z-index:2;border-radius:14px 14px 0 0}
.cs-head b{font-size:12.5px;letter-spacing:.06em;color:#7a4b00}
.cs-head .cs-min{margin-left:auto;border:0;background:#f1e6cf;border-radius:8px;width:24px;height:22px;cursor:pointer}
.cs-loader{padding:0 12px 8px;display:flex;flex-direction:column;gap:4px;position:sticky;top:38px;background:rgba(255,253,247,.97);z-index:2;border-bottom:1px solid #eee}
.cs-loader select{width:100%;padding:5px 6px;border-radius:8px;border:1px solid #d9c9a4;background:#fff;font:inherit}
.cs-note{color:#8a6d3b;font-size:11px}
.cs-body{padding:6px 12px 12px}
.cs-sec{margin-top:10px}
.cs-sec>h4{margin:0 0 4px;font-size:11px;letter-spacing:.07em;color:#8a6d3b;text-transform:uppercase}
.cs-kv{display:flex;justify-content:space-between;gap:8px}
.cs-bar{height:7px;border-radius:5px;background:#eee;overflow:hidden;margin:2px 0 5px}
.cs-bar i{display:block;height:100%;background:#81c784}
.cs-bar.warn i{background:#ef9a9a}
.cs-row{padding:5px 6px;border-radius:8px;margin:2px 0;background:#fbf6ea;border-left:5px solid var(--c,#ccc);cursor:default}
.cs-row:hover,.cs-row.on{background:#fff0c9}
.cs-r1{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.cs-r2{color:#555;margin-top:2px}
.cs-chip{display:inline-block;padding:0 6px;border-radius:9px;background:#e8dcc0;font-size:10.5px}
.cs-chip.deep{background:#cfe3ff}
.cs-chip.debt{background:#ffe0b2}
.cs-role{font-weight:700}
.ok{color:#2e7d32;font-weight:700}
.bad{color:#c62828;font-weight:700}
.cs-min{color:#888;font-size:10.5px}
.cs-warn{padding:6px 8px;border-radius:8px;margin:3px 0}
.cs-warn.info{background:#e8f1ff}
.cs-warn.debt{background:#fff1da}
.cs-warn.warn{background:#ffe3e0}
.cs-faces{display:flex;gap:6px;margin:2px 0 4px}
.cs-faces button{flex:1;padding:5px;border-radius:8px;border:1px solid #cdbb94;background:#fff;cursor:pointer;font:inherit}
.cs-faces button.on{background:#1565c0;color:#fff;border-color:#1565c0}
.cs-profilebox{background:#fffdf7;border:1px solid #eee;border-radius:10px;padding:4px}
.cs-profilebox svg{width:100%;height:auto;display:block}
.cs-strike{font-weight:600}.cs-strike.executes{color:#2e7d32}.cs-strike.loses,.cs-strike.crowded{color:#b26a00}.cs-strike.arc,.cs-strike.below{color:#777}
.cs-act{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:2px 0;border-bottom:1px dotted #e6dcc4}
.cs-thr{color:#666;font-size:11px}
.cs-thr li{margin:1px 0}
.cs-min-collapsed .cs-body,.cs-min-collapsed .cs-loader{display:none}
`;

function limbHtml(l: LimbRow): string {
  const color = ROLE_COLOR[l.roleKey];
  const mark = (ok: boolean) => (ok ? 'ok' : 'bad');
  const chips = [
    l.tag !== 'lanza' ? `<span class="cs-chip">${esc(l.tag)}</span>` : '',
    l.inDepth ? '<span class="cs-chip deep">en profundidad</span>' : '',
    l.droops ? '<span class="cs-chip">cuelga</span>' : '',
    l.paired ? '<span class="cs-chip">vara pasante</span>' : '',
    l.branches ? `<span class="cs-chip debt">+${l.branches} ${l.branches === 1 ? 'palito' : 'palitos'} de 2.º nivel</span>` : '',
    l.anchoredBy !== 'own' ? '<span class="cs-chip">la sostiene otra pieza</span>' : '',
  ].join(' ');
  return `<div class="cs-row" data-id="${esc(l.id)}" style="--c:${color}">
<div class="cs-r1"><b>${esc(l.label)}</b><span class="cs-role">${esc(l.role)}</span>${chips}</div>
<div class="cs-r2">sobresale <span class="${mark(l.ok.free)}">${nf(l.freeMm)} mm</span> <span class="cs-min">(mín. ${nf(l.minFreeMm)})</span> · adentro <span class="${mark(l.ok.embedded)}">${nf(l.embeddedMm)} mm</span> <span class="cs-min">(mín. ${nf(l.minEmbeddedMm)})</span> · inclin. <span class="${mark(l.ok.tilt)}">${nf(l.tiltDeg, 0)}°</span> · calidad <span class="${mark(l.ok.quality)}">${nf(l.quality, 2)}</span> · ${nf(l.massG, 2)} g</div>
<div class="cs-r2 cs-strike ${l.strike.outcome}">golpe · ${esc(l.strike.text)}</div></div>`;
}

function decoHtml(d: DecoRow): string {
  const r = d.rod;
  const mark = (ok: boolean) => (ok ? 'ok' : 'bad');
  const rod = r
    ? `<div class="cs-r2">sobresale cola <span class="${mark(r.freeTailMm >= r.minFreeMm)}">${nf(r.freeTailMm)} mm</span>${r.freeTipMm > 0 ? ` · punta <span class="${mark(r.freeTipMm >= r.minFreeMm)}">${nf(r.freeTipMm)} mm</span>` : ''} <span class="cs-min">(mín. ${nf(r.minFreeMm)})</span> · adentro <span class="${mark(r.embeddedOk)}">${nf(r.embeddedMm)} mm</span> <span class="cs-min">(mín. ${nf(r.minEmbeddedMm)})</span> · inclin. <span class="${mark(r.tiltOk)}">${nf(r.tiltDeg, 0)}°</span></div>`
    : '';
  return `<div class="cs-row" data-id="${esc(d.pieceId)}" style="--c:#ba68c8"><div class="cs-r1"><b>${esc(d.label)}</b><span>${esc(d.reason)}</span>${d.reasonKey === 'second-level' ? '<span class="cs-chip debt">deuda del MVP 1</span>' : ''}${d.reasonKey === 'unknown-type' ? '<span class="cs-chip debt">falta su perfil</span>' : ''}<span class="cs-min">${nf(d.massG, 2)} g</span></div>${rod}</div>`;
}

function warnHtml(w: Warning): string {
  return `<div class="cs-warn ${w.level}" data-kind="${w.kind}">${esc(w.text)}</div>`;
}

const bar = (n: number, max: number) => `<div class="cs-bar ${n / max >= 0.9 ? 'warn' : ''}"><i style="width:${Math.min(100, (n / max) * 100).toFixed(0)}%"></i></div>`;

/** Panel "ESTRUCTURA DETECTADA": DOM sin dependencias; solo dibuja un `PanelModel` y avisa de lo que el usuario toca. */
export class StructurePanel {
  readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly select: HTMLSelectElement;
  private readonly note: HTMLDivElement;

  constructor(host: HTMLElement, creatures: CreatureOption[], private readonly handlers: PanelHandlers) {
    if (!document.getElementById('cs-style')) {
      const st = document.createElement('style');
      st.id = 'cs-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.className = 'cs-panel';
    this.root.id = 'cs-panel';
    this.root.innerHTML = `<div class="cs-head"><b>ESTRUCTURA DETECTADA</b><button class="cs-min" title="plegar">–</button></div>
<div class="cs-loader"><select class="cs-select"><option value="">— cargar una criatura de prueba —</option>${creatures.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</select><div class="cs-note"></div></div>
<div class="cs-body"></div>`;
    host.appendChild(this.root);
    this.body = this.root.querySelector('.cs-body') as HTMLDivElement;
    this.select = this.root.querySelector('.cs-select') as HTMLSelectElement;
    this.note = this.root.querySelector('.cs-note') as HTMLDivElement;

    // El juego escucha teclado y mouse en la ventana: nada de lo que se haga acá tiene que llegarle.
    for (const t of ['keydown', 'keyup', 'wheel', 'pointerdown', 'mousedown', 'contextmenu']) this.root.addEventListener(t, (e) => e.stopPropagation());
    this.select.addEventListener('change', () => {
      if (this.select.value) this.handlers.onLoad(this.select.value);
    });
    (this.root.querySelector('.cs-min') as HTMLButtonElement).addEventListener('click', () => this.root.classList.toggle('cs-min-collapsed'));
    this.root.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest('[data-id],[data-limb]') as HTMLElement | null;
      const id = el?.dataset.id ?? el?.dataset.limb ?? null;
      this.handlers.onHover(id && id !== 'core' ? id : null);
    });
    this.root.addEventListener('mouseleave', () => this.handlers.onHover(null));
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-facing]') as HTMLElement | null;
      if (b) this.handlers.onFacing(Number(b.dataset.facing) === -1 ? -1 : 1);
    });
  }

  /** Marca en el selector la criatura cargada. */
  setSelected(id: string): void {
    this.select.value = id;
  }

  render(m: PanelModel, profileSvg: string, st: RenderState): void {
    const scroll = this.root.scrollTop;
    this.note.textContent = st.loadNote ?? '';
    const limbs = m.limbs.length ? m.limbs.map(limbHtml).join('') : '<div class="cs-min">ninguna: no hay palitos con punta libre y base clara</div>';
    const deco = m.decorative.length ? m.decorative.map(decoHtml).join('') : '<div class="cs-min">ninguna</div>';
    const actions = m.actions.length
      ? m.actions.map((a) => `<div class="cs-act"><span><b>${esc(a.kindText)}</b> <span class="cs-min">${esc(a.inputText)}${a.by ? ' · ' + esc(a.by) : ''}</span></span><span class="cs-min">${a.startup}+${a.active}+${a.recovery} cuadros · daño ${nf(a.damage)} · ${nf(a.reachCm)} cm</span></div>`).join('')
      : '<div class="cs-min">ninguna</div>';
    this.body.innerHTML = `
<div class="cs-sec"><h4>Núcleo</h4><div class="cs-kv"><span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${CORE_COLOR};margin-right:5px"></span><b>${esc(m.core.label)}</b> · ${esc(m.core.sizeText)}</span><span>${nf(m.core.massG)} g</span></div></div>
<div class="cs-sec"><h4>Piezas y trazos</h4>
<div class="cs-kv"><span>piezas clavadas</span><b>${m.budget.pieces.n} / ${m.budget.pieces.max}</b></div>${bar(m.budget.pieces.n, m.budget.pieces.max)}
<div class="cs-kv"><span>trazos de ketchup</span><b>${m.budget.strokes.n} / ${m.budget.strokes.max}</b></div>${bar(m.budget.strokes.n, m.budget.strokes.max)}</div>
<div class="cs-sec"><h4>Masa, alcance, apoyos y movimiento</h4>
<div>${esc(m.mass.text)}</div><div>${esc(m.reach.text)}</div><div>${esc(m.support.text)}</div><div><b>${esc(m.locomotion.text)}</b></div></div>
<div class="cs-sec"><h4>Extremidades (${m.limbs.length})</h4>${limbs}</div>
<div class="cs-sec"><h4>Piezas decorativas (${m.decorative.length})</h4>${deco}</div>
<div class="cs-sec"><h4>Acciones ofensivas</h4>${actions}<div class="cs-min" style="margin-top:3px">Defensa: ${esc(m.defense)}</div></div>
<div class="cs-sec"><h4>Avisos</h4>${m.warnings.length ? m.warnings.map(warnHtml).join('') : '<div class="cs-min">sin avisos</div>'}</div>
<div class="cs-sec"><h4>Perfil de combate</h4>
<div class="cs-faces"><button data-facing="1" class="${st.facing === 1 ? 'on' : ''}">→ frente a la derecha (−Y)</button><button data-facing="-1" class="${st.facing === -1 ? 'on' : ''}">← giro de 180° (+Y)</button></div>
<div class="cs-profilebox">${profileSvg}</div>
<div class="cs-min">Rojo golpea · verde apoya · azul defiende · gris alcanza. Punteado: en profundidad. Círculos: barrido del golpe con el largo real.</div></div>
<div class="cs-sec"><h4>Umbrales vigentes (src/creature/config.ts)</h4><ul class="cs-thr" style="margin:0;padding-left:16px">${m.thresholds.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><div class="cs-min">análisis: ${st.ms.toFixed(0)} ms</div></div>`;
    this.root.scrollTop = scroll;
  }

  destroy(): void {
    this.root.remove();
  }
}
