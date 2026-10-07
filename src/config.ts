import * as THREE from 'three';

/** Parámetros de puesta en escena (metros). Centralizados para ajustar el look sin tocar la lógica. */
export const CONFIG = {
  /** Centro del chizito: flota ~7 cm sobre la mesa (la mesa está en y = 0). */
  chizitoCenter: new THREE.Vector3(0, 0.072, 0),
  camera: {
    position: new THREE.Vector3(0, 0.122, 0.2),
    target: new THREE.Vector3(0, 0.068, 0),
    focalLength: 50, // mm, equivalente full frame (36 mm)
    near: 0.01,
    far: 6,
  },
  light: {
    /** Dirección HACIA la luz (ventana de tarde, adelante a la izquierda, alta). */
    direction: new THREE.Vector3(-0.2, 0.55, 0.81).normalize(),
    color: new THREE.Color('#fff8ee'),
    intensity: 4.0,
  },
  environment: {
    /** HDRI opcional: si existe se usa automáticamente en lugar del entorno procedural. */
    hdriUrl: 'assets/hdri/interior.hdr',
    /** Giro del HDRI (rad) para alinear su ventana con la luz direccional. */
    hdriRotationY: 0,
    hdriIntensity: 1.0,
    hdriBackgroundIntensity: 0.9,
    proceduralIntensity: 0.85,
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
    opacity: 0.8,
    /** Desenfoque (m): ≈ penumbra de un objeto a 7 cm bajo luz de ventana. */
    softness: 0.0065,
  },
  dof: {
    /** Banda nítida alrededor del foco, en dioptrías (1/m). ±1 dpt a 20 cm ≈ de 17 a 25 cm. */
    focusBand: 1.0,
    /** Dioptrías extra hasta el desenfoque máximo. */
    blurRamp: 2.4,
    /** Desenfoque máximo (radio) como fracción de la altura de la imagen. */
    maxBlur: 0.022,
  },
  ao: {
    radius: 0.01,
    distanceFalloff: 0.35,
    intensity: 2.2,
  },
  /** 'neutral' (Khronos PBR Neutral: respeta los colores, look de foto de producto) | 'aces' | 'agx' */
  toneMapping: (new URLSearchParams(location.search).get('tm') ?? 'neutral') as 'neutral' | 'aces' | 'agx',
  /** Ajuste de color final: alegre y apetitoso, sin llegar a dibujo animado. */
  look: { saturation: 0.14, brightness: 0.02, contrast: 0.04 },
  pixelRatioMax: 1.5,
};
