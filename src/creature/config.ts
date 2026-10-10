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
    /** Embebido que da calidad 1: esta fracción del largo de la vara. */
    anchorFullRatio: 0.35,
  },

  /** Capacidades (tanda 5). */
  capabilities: {
    /** Peso de la heurística "arriba = brazos, abajo = piernas" (sesgo, no regla). */
    anthropoBias: 0.3,
    /** Por debajo de este valor una extremidad queda "sin rol". */
    minRole: 0.3,
    /** Una punta cuenta como apoyada si está a menos de esta fracción de la altura del suelo. */
    groundTolRatio: 0.15,
    /** Mínima componente hacia abajo para ser apoyo. */
    supportMinDown: 0.45,
    /** Zonas angulares de ataque en el perfil (grados). */
    strikeFrontDeg: 40,
    strikeArcFactor: 0.7,
    strikeBackFactor: 0.2,
    /** Referencias de normalización. */
    reachRef: 0.035,
    areaRef: 0.0004,
  },

  /** Movilidad por extremidad (tanda 5). */
  mobility: {
    /** Giro total posible desde el pivote antes de descontar (grados). */
    swingDeg: 120,
    /** Separación angular (grados) a la que un vecino empieza a recortar el arco. */
    neighbourDeg: 20,
    /** Masa de referencia de una extremidad (kg): la mitad de rango a esta masa. */
    limbMassRef: 0.0004,
  },

  /** Apoyos y locomoción (tanda 5). */
  locomotion: {
    /** Separación mínima entre dos apoyos para caminar. */
    minFeetGap: 0.008,
    /** Extremidades radiales mínimas para rodar y cobertura angular mínima (grados). */
    rollMinLimbs: 6,
    rollMinCoverageDeg: 270,
    /** Pandeo simplificado: capacidad = bucklingK · r⁴ / libre². */
    bucklingK: 3.0e6,
    /** Aceleración de juego usada para el peso. */
    gravity: 9.8,
    /** Velocidades (m/s) y referencia de masa (kg). */
    baseSpeed: 0.05,
    minSpeed: 0.008,
    maxSpeed: 0.09,
    massRef: 0.006,
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
