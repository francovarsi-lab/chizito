import { Uniform } from 'three';
import { Effect } from 'postprocessing';

/**
 * Ajuste final de color (después del tone mapping): saturación, brillo y contraste, acotado a
 * [0, 1] para no generar negativos (que en la conversión a sRGB se vuelven negro).
 */
export class LookEffect extends Effect {
  constructor({ saturation = 0, brightness = 0, contrast = 0 } = {}) {
    super(
      'LookEffect',
      /* glsl */ `
      uniform float saturation, brightness, contrast;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = clamp(inputColor.rgb, 0.0, 1.0);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, 1.0 + saturation);
        c = (c - 0.5) * (1.0 + contrast) + 0.5 + brightness;
        outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
      }
    `,
      {
        uniforms: new Map([
          ['saturation', new Uniform(saturation)],
          ['brightness', new Uniform(brightness)],
          ['contrast', new Uniform(contrast)],
        ]),
      },
    );
  }
}
