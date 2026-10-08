import type * as THREE from 'three';

/**
 * Definición de un tipo de pieza, basada en datos. Agregar un snack nuevo = agregar una definición
 * (ver definitions.ts), sin tocar la lógica de interacción.
 */
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
   */
  frame: 'centered' | 'tip';

  /** Generador procedural (fallback cuando no hay GLB). `seed` da variación entre instancias. */
  procedural: (seed: number, detail: 'hero' | 'prop') => THREE.Object3D;

  /** Puede atravesar otras piezas (palito: sí; papita: entra de canto). */
  canPierce: boolean;
  /** Puede ser atravesada por otras piezas. */
  canBePierced: boolean;
  /** Profundidad máxima de inserción (m). */
  maxDepth: number;

  /** Ids de sonidos del AudioManager. */
  sounds: {
    pick?: string;
    drop?: string;
    contact?: string;
    insert?: string;
  };
}
