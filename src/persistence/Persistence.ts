import type { InteractionController } from '../interaction/InteractionController';
import type { PieceRegistry } from '../pieces/PieceRegistry';
import type { Overlay } from '../ui/Overlay';
import { CreatureFileError, fromCreatureFile, toCreatureFile } from './CreatureFile';

const AUTOSAVE_KEY = 'chizito.criatura.v1';

/**
 * Guardar y cargar criaturas:
 *  - Ctrl+S descarga el .json de la criatura; Ctrl+O abre uno (o se arrastra el archivo a la ventana);
 *  - autoguardado en el navegador después de cada cambio, y se recupera al volver a abrir el juego.
 * Cargar se puede deshacer (Ctrl+Z vuelve a la criatura anterior).
 */
export class Persistence {
  private saveTimer = 0;

  constructor(
    private readonly interaction: InteractionController,
    private readonly pieces: PieceRegistry,
    private readonly overlay: Overlay,
    private readonly rootType: string,
  ) {}

  /** Activa atajos, arrastrar-y-soltar y autoguardado. */
  install(): void {
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.code === 'KeyS') {
        e.preventDefault();
        this.download();
      } else if (e.code === 'KeyO') {
        e.preventDefault();
        this.openPicker();
      }
    });
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      e.preventDefault();
      void file.text().then((t) => this.loadText(t));
    });
    const prev = this.interaction.onChange;
    this.interaction.onChange = () => {
      prev?.();
      window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => this.autosave(), 400);
    };
  }

  toJSON(): string {
    return JSON.stringify(toCreatureFile(this.interaction.snapshot(), this.pieces, this.rootType), null, 2);
  }

  download(): void {
    const blob = new Blob([this.toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = `criatura-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.overlay.flash(`criatura guardada · ${this.interaction.pieceCount()} piezas`, 1800);
  }

  openPicker(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void f.text().then((t) => this.loadText(t));
    };
    input.click();
  }

  /** Carga una criatura desde el texto del archivo. Devuelve los avisos (o tira si no se pudo). */
  loadText(text: string, record = true): string[] {
    try {
      const { snapshot, warnings } = fromCreatureFile(JSON.parse(text), this.pieces);
      this.interaction.load(snapshot, record);
      if (record) this.overlay.flash(['criatura cargada', ...warnings].join(' · '), warnings.length ? 3600 : 1600);
      return warnings;
    } catch (err) {
      const msg = err instanceof CreatureFileError ? err.message : 'no se pudo leer ese archivo';
      if (record) this.overlay.flash(msg, 2600);
      throw err;
    }
  }

  private autosave(): void {
    try {
      localStorage.setItem(AUTOSAVE_KEY, this.toJSON());
    } catch {
      // Sin almacenamiento (modo privado, cuota): se juega igual, sólo no se recupera al volver.
    }
  }

  /** Recupera la última criatura del navegador, si hay. */
  restoreAutosave(): boolean {
    let text: string | null = null;
    try {
      text = localStorage.getItem(AUTOSAVE_KEY);
    } catch {
      return false;
    }
    if (!text) return false;
    try {
      this.loadText(text, false);
      return true;
    } catch {
      return false;
    }
  }
}
