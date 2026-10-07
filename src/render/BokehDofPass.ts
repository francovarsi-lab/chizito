import * as THREE from 'three';
import { Pass } from 'postprocessing';

/**
 * Profundidad de campo con bokeh circular por "gather" en espiral (técnica de D. Gustafsson),
 * calculada a media resolución y compuesta sobre la imagen nítida.
 *
 * El círculo de confusión se mide en dioptrías (|1/foco − 1/d|), como en una lente real, pero
 * con una banda de foco garantizada: todo lo que esté a ±`focusBand` dioptrías del foco queda
 * perfectamente nítido (el chizito y la pieza en la mano), y a partir de ahí crece hasta `maxBlur`.
 */
export class BokehDofPass extends Pass {
  focusDistance = 0.2;
  /** Banda nítida en dioptrías alrededor del foco. */
  focusBand = 1.0;
  /** Dioptrías (más allá de la banda) hasta llegar al desenfoque máximo. */
  blurRamp = 3.2;
  /** Desenfoque máximo como fracción de la altura de la imagen. */
  maxBlur = 0.022;
  /** Distancia del telón fotográfico (ya viene desenfocado: se le aplica menos blur). */
  photoDistance = 1e9;
  photoBlurScale = 0.35;

  private readonly gather: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly half: THREE.WebGLRenderTarget;

  constructor(private readonly cam: THREE.PerspectiveCamera) {
    super('BokehDofPass');
    this.needsDepthTexture = true;
    this.half = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.half.texture.minFilter = THREE.LinearFilter;
    this.half.texture.magFilter = THREE.LinearFilter;

    const cocFn = /* glsl */ `
      uniform sampler2D depthBuffer;
      uniform float cameraNear, cameraFar, focusDistance, focusBand, blurRamp, maxBlurPx, photoDistance, photoBlurScale;
      float viewDist(vec2 uv) {
        float d = texture2D(depthBuffer, uv).r;
        return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
      }
      // Radio del círculo de confusión en píxeles de ESTA pasada.
      float cocPx(float dist) {
        float dpt = abs(1.0 / focusDistance - 1.0 / max(dist, 1e-3));
        float t = clamp((dpt - focusBand) / blurRamp, 0.0, 1.0);
        float k = dist > photoDistance - 0.01 ? photoBlurScale : 1.0;
        return maxBlurPx * pow(t, 0.85) * k;
      }
    `;

    this.gather = new THREE.ShaderMaterial({
      name: 'BokehDof.Gather',
      uniforms: {
        inputBuffer: { value: null },
        depthBuffer: { value: null },
        texelSize: { value: new THREE.Vector2() },
        cameraNear: { value: 0.01 },
        cameraFar: { value: 6 },
        focusDistance: { value: 0.2 },
        focusBand: { value: 1 },
        blurRamp: { value: 3 },
        maxBlurPx: { value: 12 },
        photoDistance: { value: 1e9 },
        photoBlurScale: { value: 0.35 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D inputBuffer;
        uniform vec2 texelSize;
        varying vec2 vUv;
        ${cocFn}
        const float GOLDEN_ANGLE = 2.39996323;
        const float RAD_SCALE = 0.55;
        void main() {
          float centerDist = viewDist(vUv);
          float centerSize = cocPx(centerDist);
          vec3 color = texture2D(inputBuffer, vUv).rgb;
          float tot = 1.0;
          float fg = 0.0; // cobertura de primer plano desenfocado sobre este píxel
          float radius = RAD_SCALE;
          float ang = 0.0;
          for (int i = 0; i < 256; i++) {
            if (radius >= maxBlurPx) break;
            vec2 tc = vUv + vec2(cos(ang), sin(ang)) * texelSize * radius;
            vec3 sc = texture2D(inputBuffer, tc).rgb;
            float sd = viewDist(tc);
            float ss = cocPx(sd);
            // Lo que está detrás no puede desparramarse sobre algo más cercano y nítido.
            if (sd > centerDist) ss = clamp(ss, 0.0, centerSize * 2.0);
            float m = smoothstep(radius - 0.5, radius + 0.5, ss);
            if (sd < centerDist) fg = max(fg, m * clamp(ss / (maxBlurPx * 0.25), 0.0, 1.0));
            color += mix(color / tot, sc, m);
            tot += 1.0;
            radius += RAD_SCALE / radius;
            ang += GOLDEN_ANGLE;
          }
          float a = max(clamp(centerSize / 1.5, 0.0, 1.0), fg);
          gl_FragColor = vec4(color / tot, a);
        }
      `,
      depthWrite: false,
      depthTest: false,
    });

    this.composite = new THREE.ShaderMaterial({
      name: 'BokehDof.Composite',
      uniforms: {
        inputBuffer: { value: null },
        blurBuffer: { value: this.half.texture },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D inputBuffer;
        uniform sampler2D blurBuffer;
        varying vec2 vUv;
        void main() {
          vec4 sharp = texture2D(inputBuffer, vUv);
          vec4 blur = texture2D(blurBuffer, vUv);
          gl_FragColor = vec4(mix(sharp.rgb, blur.rgb, smoothstep(0.0, 1.0, blur.a)), sharp.a);
        }
      `,
      depthWrite: false,
      depthTest: false,
    });
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    this.gather.uniforms.depthBuffer.value = depthTexture;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width / 2));
    const h = Math.max(1, Math.round(height / 2));
    this.half.setSize(w, h);
    this.gather.uniforms.texelSize.value.set(1 / w, 1 / h);
    this.gather.uniforms.maxBlurPx.value = Math.min(48, this.maxBlur * h);
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, outputBuffer: THREE.WebGLRenderTarget): void {
    const u = this.gather.uniforms;
    u.inputBuffer.value = inputBuffer.texture;
    u.cameraNear.value = this.cam.near;
    u.cameraFar.value = this.cam.far;
    u.focusDistance.value = this.focusDistance;
    u.focusBand.value = this.focusBand;
    u.blurRamp.value = this.blurRamp;
    u.photoDistance.value = this.photoDistance;
    u.photoBlurScale.value = this.photoBlurScale;
    this.fullscreenMaterial = this.gather;
    renderer.setRenderTarget(this.half);
    renderer.render(this.scene, this.camera);

    this.composite.uniforms.inputBuffer.value = inputBuffer.texture;
    this.fullscreenMaterial = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }
}
