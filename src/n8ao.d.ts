declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three';
  import { Pass } from 'postprocessing';
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoSamples: number;
      aoRadius: number;
      denoiseSamples: number;
      denoiseRadius: number;
      distanceFalloff: number;
      intensity: number;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      gammaCorrection: boolean;
      color: Color;
      screenSpaceRadius: boolean;
      [k: string]: unknown;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
