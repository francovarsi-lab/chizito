import type { PieceDefinition } from './PieceDefinition';

export class PieceRegistry {
  private defs = new Map<string, PieceDefinition>();

  register(def: PieceDefinition): void {
    this.defs.set(def.type, def);
  }

  get(type: string): PieceDefinition {
    const d = this.defs.get(type);
    if (!d) throw new Error(`Tipo de pieza desconocido: ${type}`);
    return d;
  }

  all(): PieceDefinition[] {
    return [...this.defs.values()];
  }
}
