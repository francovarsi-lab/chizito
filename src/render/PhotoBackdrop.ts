import * as THREE from 'three';
import { CONFIG } from '../config';
import { probeFile } from '../assets/probe';

/**
 * Telón fotográfico: si existe public/assets/backdrop.jpg (una foto real de mesa de cumpleaños, ya
 * desenfocada) se coloca como un plano perpendicular a la cámara fija, a `distance` metros, cubriendo
 * todo el encuadre (modo "cover"). Como la cámara no se mueve, la perspectiva de la foto queda coherente.
 *
 * La foto ya es una imagen final (sRGB "revelada"), pero pasa por el mismo tone mapping que la escena:
 * para que salga tal cual, el shader aplica la inversa exacta del ACES de three.js.
 */
export interface PhotoBackdrop {
  mesh: THREE.Mesh;
  /** Uniforms compartidos (los usa también el fundido de la mesa). */
  uniforms: Record<string, THREE.IUniform>;
  layout(): void;
}

/** Sobredimensión del telón respecto del encuadre (para que no se vean los bordes). */
const OVERSCAN = 1.03;

/** GLSL: color lineal de la foto en una UV de imagen, con la inversa del ACES de three.js. */
const PHOTO_GLSL = /* glsl */ `
  uniform sampler2D photoMap;
  uniform vec2 photoUvScale, photoUvOffset;
  uniform float photoExposure, photoInvertAces;
  uniform mat3 photoInvIn, photoInvOut;
  // Inversa de RRTAndODTFit: y = (v(v+a) - b) / (v(c v + d) + e)
  vec3 photoInvFit(vec3 y) {
    const float a = 0.0245786, b = 0.000090537, c = 0.983729, d = 0.4329510, e = 0.238081;
    vec3 A = y * c - 1.0;
    vec3 B = y * d - a;
    vec3 C = y * e + b;
    return (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  }
  vec3 photoColor(vec2 planeUv) {
    vec3 c = texture2D(photoMap, planeUv * photoUvScale + photoUvOffset).rgb * photoExposure;
    if (photoInvertAces > 0.5) {
      c = clamp(c, 0.0, 0.985);
      c = photoInvOut * c;
      c = photoInvFit(clamp(c, 0.0, 1.0));
      c = photoInvIn * c * 0.6;
    }
    return max(c, 0.0);
  }
`;

export async function loadPhotoBackdrop(camera: THREE.PerspectiveCamera): Promise<PhotoBackdrop | null> {
  const cfg = CONFIG.photoBackdrop;
  const buf = await probeFile(`${import.meta.env.BASE_URL}${cfg.url}`, [0xff, 0xd8, 0xff]);
  if (!buf) return null;
  const url = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
  const tex = await new THREE.TextureLoader().loadAsync(url);
  URL.revokeObjectURL(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const img = tex.image as { width: number; height: number };
  const imageAspect = img.width / img.height;

  const col = (c0: number[], c1: number[], c2: number[]) =>
    new THREE.Matrix3().set(c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]);
  // Columnas tal cual figuran en tonemapping_pars_fragment de three.js.
  const acesIn = col([0.59719, 0.076, 0.0284], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]);
  const acesOut = col([1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]);

  const uniforms: Record<string, THREE.IUniform> = {
    photoMap: { value: tex },
    photoUvScale: { value: new THREE.Vector2(1, 1) },
    photoUvOffset: { value: new THREE.Vector2(0, 0) },
    photoExposure: { value: cfg.exposure },
    photoInvertAces: { value: CONFIG.toneMapping === 'aces' ? 1 : 0 },
    photoInvIn: { value: acesIn.clone().invert() },
    photoInvOut: { value: acesOut.clone().invert() },
    photoResolution: { value: new THREE.Vector2(1, 1) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'PhotoBackdrop',
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: PHOTO_GLSL + /* glsl */ `
      varying vec2 vUv;
      void main() { gl_FragColor = vec4(photoColor(vUv), 1.0); }
    `,
    depthWrite: true,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.name = 'photo-backdrop';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;

  const layout = () => {
    const D = cfg.distance;
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    mesh.position.copy(camera.position).addScaledVector(fwd, D);
    mesh.quaternion.copy(camera.quaternion);
    const h = 2 * D * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2) * OVERSCAN;
    const w = h * camera.aspect;
    mesh.scale.set(w, h, 1);
    const screenAspect = camera.aspect;
    const sc = uniforms.photoUvScale.value as THREE.Vector2;
    if (imageAspect > screenAspect) sc.set(screenAspect / imageAspect, 1);
    else sc.set(1, imageAspect / screenAspect);
    (uniforms.photoUvOffset.value as THREE.Vector2).set((1 - sc.x) / 2, (1 - sc.y) / 2 + cfg.offsetY);
  };
  layout();
  console.info('[backdrop] usando foto', cfg.url);
  return { mesh, uniforms, layout };
}

/**
 * Funde la mesa 3D con la foto: según la z del mundo (opaca en z ≥ start, foto pura en z ≤ end),
 * mezcla el color final con el píxel de la foto que queda detrás en pantalla. Sin transparencia,
 * así el fundido es suave y la profundidad sigue siendo la de la mesa (DoF/AO coherentes).
 */
export function addPhotoFade(material: THREE.Material, photo: PhotoBackdrop, start: number, end: number): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, photo.uniforms, { fadeStart: { value: start }, fadeEnd: { value: end } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFadeZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFadeZ = (modelMatrix * vec4(transformed, 1.0)).z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vFadeZ;\nuniform float fadeStart, fadeEnd;\nuniform vec2 photoResolution;\n${PHOTO_GLSL}`)
      .replace(
        '#include <dithering_fragment>',
        `{
          float f = 1.0 - smoothstep(fadeEnd, fadeStart, vFadeZ);
          vec2 s = gl_FragCoord.xy / photoResolution;
          vec2 planeUv = (s - 0.5) / ${OVERSCAN.toFixed(3)} + 0.5;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, photoColor(planeUv), f);
        }
        #include <dithering_fragment>`,
      );
  };
  material.needsUpdate = true;
}

/** Mantiene la resolución que usa el fundido (tamaño del drawing buffer). */
export function updatePhotoResolution(photo: PhotoBackdrop, renderer: THREE.WebGLRenderer): void {
  renderer.getDrawingBufferSize(photo.uniforms.photoResolution.value as THREE.Vector2);
}
