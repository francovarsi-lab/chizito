import type { Construction } from '../../model/Construction';
import type { PieceRegistry } from '../../pieces/PieceRegistry';
import { interpret } from '../interpret';
import { resolveSnapshot } from '../resolve';
import type { CreatureAnalysis, CreatureSnapshot } from '../types';
import { LimbHighlighter } from './highlight';
import { buildPanelModel, type PanelModel } from './model';
import { StructurePanel, type CreatureOption } from './panel';
import { renderProfileSvg } from './profileSvg';

/** Lo que el panel necesita del juego (todo ya existe: `__chizito.construction`, `.interaction`, `.persistence`). */
export interface PanelDeps {
  construction: Construction;
  interaction: { onChange: (() => void) | null };
  persistence: { loadText(text: string, record?: boolean): string[] };
  pieces: PieceRegistry;
  host?: HTMLElement;
  /** Carpeta de las criaturas de prueba (por defecto `assets/creatures/` del sitio). */
  creaturesUrl?: string;
}

export const TEST_CREATURES: CreatureOption[] = [
  { id: 'A', label: 'A · cuerpo + 2 brazos + 2 piernas' },
  { id: 'B', label: 'B · cuerpo + 4 brazos, sin piernas' },
  { id: 'C', label: 'C · cuerpo + 1 brazo, sin piernas' },
  { id: 'D', label: 'D · erizo (muchas extremidades)' },
  { id: 'E', label: 'E · asimétrica / extraña' },
  { id: 'veg', label: 'Rival vegetal (proxy)' },
];

/** El aviso del cargador viejo del chat 3D (frente de combate ±X): se explica en vez de mostrarlo como error. */
const OLD_FRONT = 'el frente de combate no era ±X: se usa +X';

export interface PanelState {
  snapshot: CreatureSnapshot;
  analysis: CreatureAnalysis;
  model: PanelModel;
  facing: 1 | -1;
  ms: number;
  hover: string | null;
}

export interface PanelController {
  readonly panel: StructurePanel;
  readonly highlighter: LimbHighlighter;
  /** Recalcula ya (con `force`, aunque la construcción no haya cambiado). */
  refresh(force?: boolean): void;
  setFacing(f: 1 | -1): void;
  loadCreature(id: string): Promise<string[]>;
  state(): PanelState | null;
  destroy(): void;
}

/** Firma barata de la construcción para no recalcular si no cambió nada. */
function signature(c: Construction): string {
  return JSON.stringify(c.list().map((d) => [d.id, d.parentId, d.type, d.depth, d.spin, d.entryPoint, d.direction, d.mount ?? '', d.params ? JSON.stringify(d.params).length : 0]));
}

/**
 * Monta el panel "ESTRUCTURA DETECTADA": resuelve la criatura viva, la interpreta y dibuja. Se engancha a `interaction.onChange`
 * (como hace `Persistence`), que el juego dispara al clavar, sacar, quitar, deshacer, rehacer y cargar.
 */
export function mountCreaturePanel(deps: PanelDeps): PanelController {
  const highlighter = new LimbHighlighter();
  let facing: 1 | -1 = 1;
  let last: PanelState | null = null;
  let lastSig = '';
  let loadNote: string | null = null;
  let hover: string | null = null;
  let timer = 0;
  const base = deps.creaturesUrl ?? `${import.meta.env.BASE_URL}assets/creatures/`;

  const panel = new StructurePanel(deps.host ?? document.body, TEST_CREATURES, {
    onHover: (id) => {
      if (id === hover) return;
      hover = id;
      if (last) {
        highlighter.apply(deps.construction, last.analysis, hover);
        last.hover = hover;
        draw();
      }
    },
    onFacing: (f) => controller.setFacing(f),
    onLoad: (id) => void controller.loadCreature(id),
  });

  const draw = () => {
    if (!last) return;
    const svg = renderProfileSvg(last.analysis, { highlightLimbId: hover && last.analysis.limbs.some((l) => l.id === hover) ? hover : null });
    panel.render(last.model, svg, { facing, loadNote, ms: last.ms });
  };

  const compute = (force = false) => {
    const sig = `${signature(deps.construction)}|${facing}`;
    if (!force && sig === lastSig && last) return;
    lastSig = sig;
    const t0 = performance.now();
    const snapshot = resolveSnapshot({ construction: deps.construction, pieces: deps.pieces });
    const analysis = interpret(snapshot, { facing });
    const model = buildPanelModel(snapshot, analysis);
    last = { snapshot, analysis, model, facing, ms: performance.now() - t0, hover };
    highlighter.apply(deps.construction, analysis, hover);
    draw();
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => compute(), 120);
  };
  const prev = deps.interaction.onChange;
  deps.interaction.onChange = () => {
    prev?.();
    schedule();
  };

  const controller: PanelController = {
    panel,
    highlighter,
    refresh: (force = false) => {
      window.clearTimeout(timer);
      compute(force);
    },
    setFacing(f) {
      facing = f;
      compute(true);
    },
    async loadCreature(id) {
      const text = await (await fetch(`${base}${id}.json`)).text();
      const warnings = deps.persistence.loadText(text, true);
      const real = warnings.filter((w) => w !== OLD_FRONT);
      loadNote = warnings.includes(OLD_FRONT)
        ? 'El cargador del juego todavía usa el frente de combate viejo (±X) y lo ignora: el frente de combate lo elige este panel.' + (real.length ? ' · ' + real.join(' · ') : '')
        : real.join(' · ') || null;
      panel.setSelected(id);
      controller.refresh(true);
      return warnings;
    },
    state: () => last,
    destroy() {
      window.clearTimeout(timer);
      deps.interaction.onChange = prev;
      highlighter.clear();
      panel.destroy();
    },
  };
  compute(true);
  return controller;
}
