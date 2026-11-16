import * as THREE from 'three';
import { MAX_PIECES } from './creature/limits';

const CAMERA_POSITION = new THREE.Vector3(0, 0.243, 0.307);
const CAMERA_TARGET = new THREE.Vector3(0, 0.088, -0.04);
/** rad: cuánto mira la cámara hacia abajo (24°). El chizito se presenta inclinado eso mismo: se lo ve DE FRENTE, no picado. */
const CAMERA_PITCH = Math.atan2(CAMERA_POSITION.y - CAMERA_TARGET.y, CAMERA_POSITION.z - CAMERA_TARGET.z);

/** Parámetros de puesta en escena (metros). Centralizados para ajustar el look sin tocar la lógica. */
export const CONFIG = {
  /** Centro del chizito: flota ~7 cm sobre la mesa (la mesa está en y = 0). */
  chizitoCenter: new THREE.Vector3(0, 0.1, 0),
  camera: {
    // Más alta (24°) y con lente de 45 mm: se ve la mesa alrededor del chizito con todo lo que se le puede agregar CERCA y en
    // foco (pedido del usuario: las opciones no pueden estar lejos ni desenfocadas; el ángulo bajo de 65 mm se veía feo).
    position: CAMERA_POSITION,
    target: CAMERA_TARGET,
    // Rincón de fiesta íntimo: lente más larga desde más lejos. El chizito queda del mismo tamaño, pero se ve un pedazo más chico
    // de la mesa y el fondo se comprime y se desenfoca (como una foto de producto); las cosas no se movieron de lugar.
    focalLength: 45, // mm, equivalente full frame (36 mm)
    /** Distancia inicial al chizito y límites del zoom (m). `position` sólo define la dirección de mirada. */
    distance: 0.38,
    minDistance: 0.22,
    maxDistance: 0.6,
    near: 0.01,
    far: 6,
  },
  light: {
    /**
     * Dirección HACIA la luz (ventana adelante a la izquierda, ALTA: ~55°). Así todas las sombras de la mesa caen cortas, cerca
     * de cada cosa y hacia el mismo lado; con la luz rasante (33°) la del chizito caía 15 cm atrás y no se la asociaba con él.
     */
    direction: new THREE.Vector3(-0.28, 0.82, 0.5).normalize(),
    color: new THREE.Color('#fff4ea'),
    intensity: 2.7,
  },
  environment: {
    /** HDRI opcional: si existe se usa automáticamente en lugar del entorno procedural. */
    hdriUrl: 'assets/hdri/interior.hdr',
    /** Giro del HDRI (rad) para alinear su ventana con la luz direccional. */
    hdriRotationY: 0,
    hdriIntensity: 1.0,
    hdriBackgroundIntensity: 0.9,
    proceduralIntensity: 1.15,
    backgroundBlurriness: 0.04,
  },
  /**
   * Fondo con foto real (opcional): public/assets/backdrop.jpg, ya desenfocada. Si existe, reemplaza la
   * pared y los objetos de fondo modelados; la mesa 3D se funde con la foto entre fadeStart y fadeEnd (z).
   */
  photoBackdrop: {
    url: 'assets/backdrop.jpg',
    /** Distancia (m) del telón a la cámara, a lo largo de la mirada. */
    distance: 0.95,
    /** Corrimiento vertical de la foto (fracción de su alto) para alinear la mesa de la foto con la 3D. */
    offsetY: 0,
    /** Brillo de la foto (1 = tal cual). */
    exposure: 1,
    /** Fundido de la mesa 3D hacia la foto (coordenada z del mundo). */
    fadeStart: -0.28,
    fadeEnd: -0.55,
  },
  /** Sombra de contacto suave del chizito (y sus piezas) sobre la mesa. */
  contactShadow: {
    opacity: 0.62,
    /** Desenfoque (m): penumbra amplia y suave (luz envolvente). */
    softness: 0.012,
  },
  dof: {
    /** Banda nítida alrededor del foco, en dioptrías (1/m). ±1 dpt a 20 cm ≈ de 17 a 25 cm. */
    // Amplia: todo lo que está sobre la mesa (los recipientes) queda nítido; sólo el fondo se desenfoca.
    focusBand: 1.5,
    /** Dioptrías extra hasta el desenfoque máximo. */
    blurRamp: 1.9,
    /** Desenfoque máximo (radio) como fracción de la altura de la imagen. */
    maxBlur: 0.034,
  },
  ao: {
    radius: 0.01,
    distanceFalloff: 0.35,
    intensity: 1.6,
  },
  /** 'neutral' (Khronos PBR Neutral: respeta los colores, look de foto de producto) | 'aces' | 'agx' */
  toneMapping: (new URLSearchParams(location.search).get('tm') ?? 'neutral') as 'neutral' | 'aces' | 'agx',
  /**
   * Ajuste de color final: suave y luminoso. `lift` levanta las sombras con un tono cálido pastel
   * (negros lavados, como una foto de revista de repostería).
   */
  // Más contraste que el look pastel original (el chizito se perdía entre los pasteles).
  // Un paso hacia la pelea (mismo juego, misma estética): más contraste y color, sombras sin levantar tanto.
  // Color de verdad (no pasteles): más saturación y contraste, negros firmes.
  look: { saturation: 0.24, brightness: 0.0, contrast: 0.16, lift: [0.002, 0.001, 0.002] as [number, number, number] },
  /** Brillo suave alrededor de las zonas claras (sueño, no neón). */
  bloom: { intensity: 0.1, threshold: 0.9, smoothing: 0.25, radius: 0.7 },
  pixelRatioMax: 1.5,
  /** Criaturas: tope de piezas clavadas (los trazos de ketchup no cuentan). */
  creature: {
    maxPieces: MAX_PIECES, // el tope compartido con el intérprete (src/creature/limits.ts)
    /**
     * Posición inicial ("de casa") del chizito raíz: PARADO (su eje largo, X local, hacia arriba) y con
     * el frente (+Z local) mirando A LA CÁMARA: como la cámara mira desde arriba, se echa atrás ese mismo ángulo
     * (si no, se lo veía en picado). F vuelve a esta posición.
     */
    homeRotation: new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -CAMERA_PITCH)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))),
  },
};
