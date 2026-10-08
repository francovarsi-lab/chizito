import { Uniform, Vector3 } from 'three';
import { Effect } from 'postprocessing';

/**
 * Ajuste final de color (después del tone mapping): saturación, brillo, contraste y "lift", acotado a
 * [0, 1] para no generar negativos (que en la conversión a sRGB se vuelven negro).
 */
export class LookEffect extends Effect {
  constructor({ saturation = 0, brightness = 0, contrast = 0, lift = [0, 0, 0] as [number, number, number] } = {}) {
    super(
      'LookEffect',
      /* glsl */ `
      uniform float saturation, brightness, contrast;
      uniform vec3 lift;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = clamp(inputColor.rgb, 0.0, 1.0);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, 1.0 + saturation);
        c = (c - 0.5) * (1.0 + contrast) + 0.5 + brightness;
        c = c + lift * (1.0 - c); // sombras levantadas con un tono cálido
        outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
      }
    `,
      {
        uniforms: new Map<string, Uniform<number | Vector3>>([
          ['saturation', new Uniform(saturation)],
          ['brightness', new Uniform(brightness)],
          ['contrast', new Uniform(contrast)],
          ['lift', new Uniform(new Vector3(...lift))],
        ]),
      },
    );
  }
}
