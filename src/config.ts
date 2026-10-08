import * as THREE from 'three';

/** Parámetros de puesta en escena (metros). Centralizados para ajustar el look sin tocar la lógica. */
export const CONFIG = {
  /** Centro del chizito: flota ~7 cm sobre la mesa (la mesa está en y = 0). */
  chizitoCenter: new THREE.Vector3(0, 0.1, 0),
  camera: {
    position: new THREE.Vector3(0, 0.15, 0.2),
    target: new THREE.Vector3(0, 0.098, 0),
    focalLength: 50, // mm, equivalente full frame (36 mm)
    /** Distancia inicial al chizito y límites del zoom (m). `position` sólo define la dirección de mirada. */
    distance: 0.3,
    minDistance: 0.16,
    maxDistance: 0.5,
    near: 0.01,
    far: 6,
  },
  light: {
    /** Dirección HACIA la luz (ventana de tarde, adelante a la izquierda, alta). */
    direction: new THREE.Vector3(-0.2, 0.55, 0.81).normalize(),
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
    focusBand: 1.0,
    /** Dioptrías extra hasta el desenfoque máximo. */
    blurRamp: 2.4,
    /** Desenfoque máximo (radio) como fracción de la altura de la imagen. */
    maxBlur: 0.03,
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
  look: { saturation: 0.1, brightness: 0.0, contrast: -0.015, lift: [0.022, 0.014, 0.018] as [number, number, number] },
  /** Brillo suave alrededor de las zonas claras (sueño, no neón). */
  bloom: { intensity: 0.16, threshold: 0.86, smoothing: 0.25, radius: 0.7 },
  pixelRatioMax: 1.5,
};
