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
    direction: new THREE.Vector3(-0.5, 0.55, 0.67).normalize(),
    color: new THREE.Color('#ffd2a1'),
    intensity: 4.6,
  },
  environment: {
    /** HDRI opcional: si existe se usa automáticamente en lugar del entorno procedural. */
    hdriUrl: 'assets/hdri/interior.hdr',
    /** Giro del HDRI (rad) para alinear su ventana con la luz direccional. */
    hdriRotationY: 0,
    hdriIntensity: 1.0,
    hdriBackgroundIntensity: 0.9,
    proceduralIntensity: 0.5,
    backgroundBlurriness: 0.04,
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
  /** 'agx' | 'aces' */
  toneMapping: (new URLSearchParams(location.search).get('tm') ?? 'aces') as 'agx' | 'aces',
  pixelRatioMax: 1.5,
};
