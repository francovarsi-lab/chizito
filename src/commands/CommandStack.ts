import type { PieceData } from '../model/Construction';

/**
 * Deshacer / rehacer. Cada comando guarda la construcción antes y después (lista de PieceData sin la
 * raíz). Deshacer/rehacer = restaurar uno de esos estados; la restauración reutiliza los objetos que
 * ya existen (diff por id), así que es barata aunque haya muchas piezas.
 */
export type Snapshot = PieceData[];

export interface Command {
  label: string;
  before: Snapshot;
  after: Snapshot;
}

export function cloneSnapshot(list: PieceData[]): Snapshot {
  return list.map((d) => ({
    ...d,
    entryPoint: [...d.entryPoint] as [number, number, number],
    direction: [...d.direction] as [number, number, number],
    localMatrix: [...d.localMatrix],
  }));
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((d) => [d.id, d]));
  return a.every((d) => {
    const o = byId.get(d.id);
    return !!o && o.parentId === d.parentId && Math.abs(o.depth - d.depth) < 1e-6 && o.spin === d.spin;
  });
}

export class CommandStack {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private readonly limit = 200;

  constructor(private readonly restore: (s: Snapshot) => void) {}

  /** Registra un cambio ya aplicado (no lo ejecuta). Ignora los que no cambian nada. */
  record(label: string, before: Snapshot, after: Snapshot): void {
    if (sameSnapshot(before, after)) return;
    this.undoStack.push({ label, before, after });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): boolean {
    const c = this.undoStack.pop();
    if (!c) return false;
    this.restore(c.before);
    this.redoStack.push(c);
    return true;
  }

  redo(): boolean {
    const c = this.redoStack.pop();
    if (!c) return false;
    this.restore(c.after);
    this.undoStack.push(c);
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
