import { MAX_PIECES, MAX_STROKES } from './limits';

/**
 * ÚNICO archivo de umbrales y densidades del intérprete. Todo se mide en metros, kilogramos y grados
 * salvo que se diga otra cosa. Son valores iniciales de JUEGO (no físicos), pensados para calibrarse
 * jugando: cambiar un número acá cambia el resultado en todo el intérprete sin tocar la lógica.
 * (Los topes de piezas y trazos están en `limits.ts` y se reexportan acá.)
 */
export const CREATURE_CONFIG = {
  limits: { maxPieces: MAX_PIECES, maxStrokes: MAX_STROKES },

  /**
   * Orientación de COMBATE (decisión del usuario): el frente de combate es por criatura, sobre el eje ±X
   * del chizito raíz, con +X por defecto; "arriba" es +Y salvo que el snapshot diga otra cosa. Es independiente
   * del frente fijo del constructor (`Construction.front`, +Z), que no se toca. Cambiar de lado = girar 180°.
   */
  orientation: {
    defaultFront: [1, 0, 0] as readonly [number, number, number],
    defaultUp: [0, 1, 0] as readonly [number, number, number],
    /** Ejes de frente que se consideran válidos de combate (cualquiera de los dos sentidos). */
    allowedFrontAxes: [[1, 0, 0]] as readonly (readonly [number, number, number])[],
    /** Tolerancia angular (grados) para decir que un frente "está sobre" un eje permitido. */
    axisTolDeg: 2,
  },

  /** Cuándo un extremo libre de una vara cuenta como extremidad (tanda 4). */
  limb: {
    /** Largo libre mínimo: el mayor entre el absoluto y la fracción del largo de la vara. */
    minFreeAbs: 0.010,
    minFreeRatio: 0.25,
    /** Largo mínimo embebido en el sólido que la sostiene: el mayor entre absoluto y fracción. */
    minEmbeddedAbs: 0.006,
    minEmbeddedRatio: 0.20,
    /** Inclinación máxima respecto de la normal de la superficie (grados). */
    maxTiltDeg: 70,
    /** Calidad mínima del ancla (0..1). */
    minAnchorQuality: 0.35,
    /** Por debajo de este largo libre (m) se considera que no hay punta libre (en vez de "corta"). */
    minVisibleFree: 0.001,
    /** Embebido que da calidad 1: esta fracción del largo de la vara. */
    anchorFullRatio: 0.35,
  },

  /** Capacidades de cada extremidad (tanda 5). */
  capabilities: {
    /** Peso de la heurística "arriba = brazos, abajo = piernas": un SESGO, no una regla (manda la geometría). */
    anthropoBias: 0.3,
    /** Por debajo de este valor una capacidad no cuenta como rol. */
    minRole: 0.3,
    /** Una punta cuenta como apoyada si está a menos de esta fracción de la altura del punto más bajo. */
    groundTolRatio: 0.15,
    /** Mínima componente hacia abajo (0..1) para poder ser apoyo. */
    supportMinDown: 0.45,
    /** Golpe hacia el frente dentro de ± esta apertura (grados): factor pleno. */
    strikeFrontDeg: 40,
    /** Hasta ± este ángulo (grados) el golpe es de arco (alto o bajo); más allá, hacia atrás. */
    strikeArcDeg: 140,
    strikeArcFactor: 0.7,
    strikeBackFactor: 0.2,
    /** Una extremidad en profundidad puede girar al plano en cualquier sentido: factor de arco. */
    inDepthStrikeFactor: 0.7,
    /** Largo (m) desde el que una extremidad golpea con todo su alcance. */
    strikeRefLen: 0.02,
    /** Largo (m) de referencia para el alcance. */
    reachRef: 0.035,
    /** Defensa: largo de referencia, escala y factor para las que están en profundidad. */
    defendRefLen: 0.03,
    defendScale: 0.8,
    defendDepthFactor: 0.3,
    /** Empuje = apoyo × (base + ganancia · distancia al centro de masa normalizada). */
    pushBase: 0.4,
    pushGain: 0.6,
  },

  /** Fuerza y resistencia de cada extremidad (tanda 5). */
  strength: {
    /** Radio y largo libre de referencia (un palito de fábrica clavado 9 mm): da fuerza 1. */
    refRadius: 0.0017,
    refFree: 0.0287,
    material: 1,
    /** Puntos de integridad de referencia de una vara de fábrica. */
    baseHp: 100,
    /** Parte de la integridad que aporta la unión (el resto es de la vara). */
    jointShare: 0.5,
  },

  /** Movilidad por extremidad (tanda 5). */
  mobility: {
    /** Giro total posible desde el pivote antes de descontar (grados). */
    swingDeg: 120,
    /** Otra extremidad cuenta como "vecina" si su pivote está a menos de esta distancia (m) y apunta a menos de este ángulo. */
    crowdRadius: 0.013,
    crowdAngleDeg: 60,
    /** Masa de referencia de una extremidad (kg): a esta masa el giro se reduce a la mitad. */
    limbMassRef: 0.0004,
    /** Momento máximo (N·m) que aguanta una unión = k · r³ · calidad. Si lo supera, la extremidad "cuelga". */
    anchorMomentK: 1.0e5,
    /** Paso (grados) con el que se recorta el giro para que la punta no entre en el cuerpo. */
    clipStepDeg: 5,
  },

  /** Apoyos y locomoción (tanda 5). */
  locomotion: {
    /** Separación mínima entre dos apoyos para caminar. */
    minFeetGap: 0.008,
    /** Extremidades mínimas y cobertura angular mínima (grados) para rodar. */
    rollMinLimbs: 6,
    rollMinCoverageDeg: 270,
    /** Pandeo simplificado: capacidad de un apoyo = bucklingK · r⁴ / largo². */
    bucklingK: 6.0e6,
    /** Aceleración de juego usada para el peso. */
    gravity: 9.8,
    /** Velocidades (m/s) y masa de referencia (kg). */
    baseSpeed: 0.05,
    minSpeed: 0.008,
    maxSpeed: 0.09,
    massRef: 0.006,
    /** Con más de esta cantidad de masaRef la criatura queda casi inmóvil, y a esa velocidad (m/s). */
    immobileMassMult: 3,
    immobileSpeed: 0.002,
    /** Suma de empuje a la que el avance es pleno, y fracción de avance con empuje cero. */
    pushSaturation: 2,
    pushFloor: 0.5,
    /** Altura de salto (m) de un saltarín liviano. */
    jumpHeight: 0.012,
    /** Cuánto se mueve, gira y frena según el modo (1 = lo normal). Rodar: rápido pero casi sin control ni freno. */
    modeSpeed: { walk: 1, hop: 0.8, drag: 0.5, roll: 1.2, immobile: 0 } as Record<string, number>,
    modeTurn: { walk: 1, hop: 0.7, drag: 0.4, roll: 0.2, immobile: 0.1 } as Record<string, number>,
    modeBrake: { walk: 1, hop: 0.7, drag: 0.9, roll: 0.1, immobile: 1 } as Record<string, number>,
  },

  /** Acciones ofensivas (tanda 6). */
  actions: {
    /** Cuadros a 60 fps: startup = base + k · masa de la punta normalizada. */
    startupBase: 6,
    startupPerMass: 14,
    activeFrames: 6,
    recoveryBase: 10,
    /** Una vara cuenta como "larga y rígida" desde este largo libre. */
    longRodMin: 0.022,
    /** Maza: fracción de masa en el extremo y relación con la vara. */
    maceEndRatio: 0.5,
    maceMassVsRod: 1.5,
    /** Fracción de la extremidad (desde la punta) que se considera "extremo". */
    endFraction: 0.4,
  },

  /** Perfil 2D (tanda 2 y 6). */
  profile: {
    /** Puntos del borde de un disco (papita, nacho) para su casco convexo. */
    discRimPoints: 12,
    /** Grosor mínimo de cualquier forma proyectada. */
    minShapeThickness: 0.0015,
    /** Por debajo de este cociente (largo 2D / largo 3D) una vara está "casi de frente a la cámara" (hoja de perfiles). */
    foreshortenWarn: 0.35,
    /**
     * Una extremidad está "en profundidad" cuando su componente de profundidad domina sobre las del plano de
     * perfil: |z| > hypot(x, y), es decir largo 2D / largo 3D < 0,7071. Se ve corta en reposo, pero ataca con su
     * largo real al girar al plano.
     */
    inDepthMaxRatio: Math.SQRT1_2,
  },

  /** Densidades en kg/m³ por tipo de pieza (valores de juego, a calibrar). */
  densities: {
    chizito: 250,
    palito: 550,
    escarbadientes: 600,
    papita: 350,
    nacho: 500,
    aceituna: 1000,
    ketchup: 0,
    /** Tipos desconocidos. */
    default: 400,
  } as Record<string, number>,

  /** Corrección de volumen de una cápsula grumosa (el chizito no es un cilindro perfecto). */
  lumpiness: { chizito: 0.85, default: 1 } as Record<string, number>,

  /** Tipos cuya forma todavía puede cambiar en el chat 3D: se marcan inestables (§N8). */
  unstableTypes: ['ketchup'] as string[],
} as const;

export type CreatureConfig = typeof CREATURE_CONFIG;
