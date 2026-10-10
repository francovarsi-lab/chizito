import type * as THREE from 'three';

/** Parámetros de forma/variante de una instancia (serializables). */
export type PieceParams = Record<string, unknown>;

/**
 * Definición de un tipo de pieza, basada en datos. Agregar un snack nuevo = agregar una definición
 * (ver definitions.ts), sin tocar la lógica de interacción.
 */
/** Profundidad máxima de una pieza concreta: la de su variante si la tiene, si no la del tipo. */
export function maxDepthOf(def: PieceDefinition, params?: PieceParams): number {
  const v = def.variants?.find((x) => x.id === params?.variant);
  return v?.maxDepth ?? def.maxDepth;
}

export interface PieceDefinition {
  /** Identificador estable; también nombra el GLB opcional: public/assets/models/<type>.glb */
  type: string;
  displayName: string;

  /** Medidas reales en metros, usadas para normalizar cualquier modelo (procedural o GLB). */
  dimensions: {
    /** Dimensión más larga del modelo (largo del chizito/palito, diámetro de la papita). */
    length: number;
    /** Grosor característico (diámetro del palito, grosor del chizito, espesor de la papita). */
    thickness: number;
  };

  /**
   * Marco local del modelo:
   *  - 'centered': centrado en el origen, eje largo en X (piezas raíz como el chizito).
   *  - 'tip':      punta/borde de entrada en el origen, cuerpo hacia +Y (piezas que se clavan).
   *  - 'free':     sin normalizar ni GLB: la geometría ya viene en coordenadas de la pieza padre
   *                (trazos de ketchup dibujados sobre una pieza).
   */
  frame: 'centered' | 'tip' | 'free';

  /**
   * El procedural ya viene orientado (punta de entrada hacia −Y): no se gira el eje más largo a Y,
   * sólo se ubica el origen en la punta. Ej.: el nacho entra por una de sus puntas, derecho.
   */
  keepOrientation?: boolean;

  /**
   * Generador procedural (fallback cuando no hay GLB). `seed` da variación entre instancias y `params`
   * guarda decisiones del jugador sobre la forma (p. ej. mordiscos de la papita, variante).
   */
  procedural: (seed: number, detail: 'hero' | 'prop', params?: PieceParams) => THREE.Object3D;

  /**
   * Variantes elegibles al agarrar la pieza (tecla V en la mano). Se guardan en `params.variant`;
   * la primera es la de fábrica. GLB opcional por variante: public/assets/models/<type>-<variant>.glb
   */
  variants?: { id: string; label: string; /** Profundidad máxima propia de la variante (m). */ maxDepth?: number }[];

  /**
   * Envoltorio que se desenrolla al agarrar la pieza (palito de la selva): se cuelga de la pieza en la
   * mano, `setProgress` 0→1 lo abre y después se cae. La pieza clavada nunca lo lleva.
   */
  wrapper?: (seed: number, piece: THREE.Object3D) => { object: THREE.Object3D; setProgress(p: number): void };

  /** Ayuda que se muestra al tener la pieza en la mano. */
  holdHint?: string;

  /** La forma se puede partir en la mano (tecla B). Sólo con modelo procedural. */
  breakable?: boolean;

  /** Pieza larga con la cola libre afuera: se le puede ensartar otra pieza en la punta (palito). */
  tailMount?: boolean;
  /** Se agarra del bowl y se ensarta en la cola libre de una pieza `tailMount` (chizito extra). */
  mountsOnTail?: boolean;

  /** Puede atravesar otras piezas (palito: sí; papita: entra de canto). */
  canPierce: boolean;
  /** Puede ser atravesada por otras piezas. */
  canBePierced: boolean;
  /** Profundidad máxima de inserción (m). Una variante puede tener la suya (ver `maxDepthOf`). */
  maxDepth: number;

  /** Ids de sonidos del AudioManager. */
  sounds: {
    pick?: string;
    drop?: string;
    contact?: string;
    insert?: string;
  };
}
