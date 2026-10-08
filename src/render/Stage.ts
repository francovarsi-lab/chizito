import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { CONFIG } from '../config';
import { BokehDofPass } from './BokehDofPass';
import { LookEffect } from './LookEffect';

/**
 * Renderer, cámara fija (50 mm), luz de ventana con sombras suaves y postprocesado:
 * AO (N8AO) → profundidad de campo bokeh → tone mapping AgX → viñeta → grano → SMAA.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly composer: EffectComposer;
  readonly dof: BokehDofPass;
  /** Punto que la profundidad de campo mantiene en foco (el chizito o la pieza en la mano). */
  readonly focusTarget = new THREE.Vector3();
  private focusDistance = 0.2;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: new URLSearchParams(location.search).has('capture'),
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioMax));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const cam = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(30, 1, cam.near, cam.far);
    this.camera.filmGauge = 36;
    this.camera.setFocalLength(cam.focalLength);
    this.camera.position.copy(cam.position);
    this.camera.lookAt(cam.target);
    this.focusTarget.copy(CONFIG.chizitoCenter);

    // Luz de ventana de tarde: cálida, suave, con sombras de borde difuso.
    const L = CONFIG.light;
    this.sun = new THREE.DirectionalLight(L.color, L.intensity);
    this.sun.position.copy(CONFIG.chizitoCenter).addScaledVector(L.direction, 1.5);
    this.sun.target.position.set(0, 0, -0.2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -0.6;
    sc.right = 0.6;
    sc.top = 0.6;
    sc.bottom = -0.6;
    sc.near = 0.5;
    sc.far = 3;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.radius = 7;
    this.sun.shadow.blurSamples = 16;
    this.sun.shadow.bias = -0.00004;
    this.sun.shadow.normalBias = 0.0004;
    this.scene.add(this.sun, this.sun.target);

    // Postprocesado
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const ao = new N8AOPostPass(this.scene, this.camera, 1, 1);
    ao.configuration.aoRadius = CONFIG.ao.radius;
    ao.configuration.distanceFalloff = CONFIG.ao.distanceFalloff;
    ao.configuration.intensity = CONFIG.ao.intensity;
    ao.configuration.aoSamples = 16;
    ao.configuration.denoiseSamples = 8;
    ao.configuration.denoiseRadius = 8;
    ao.configuration.halfRes = true;
    ao.configuration.depthAwareUpsampling = true;
    ao.configuration.gammaCorrection = false;
    ao.configuration.color = new THREE.Color(0.08, 0.04, 0.02);
    if (!new URLSearchParams(location.search).has('noao')) this.composer.addPass(ao);

    this.dof = new BokehDofPass(this.camera);
    this.dof.focusBand = CONFIG.dof.focusBand;
    this.dof.blurRamp = CONFIG.dof.blurRamp;
    this.dof.maxBlur = CONFIG.dof.maxBlur;
    this.composer.addPass(this.dof);
    const tone = new ToneMappingEffect({
      mode:
        CONFIG.toneMapping === 'agx'
          ? ToneMappingMode.AGX
          : CONFIG.toneMapping === 'aces'
            ? ToneMappingMode.ACES_FILMIC
            : ToneMappingMode.NEUTRAL,
    });
    const vignette = new VignetteEffect({ offset: 0.42, darkness: 0.16 });
    // Look alegre y apetitoso: un poco más de color y de brillo.
    const look = new LookEffect(CONFIG.look);
    const bloom = new BloomEffect({
      intensity: CONFIG.bloom.intensity,
      luminanceThreshold: CONFIG.bloom.threshold,
      luminanceSmoothing: CONFIG.bloom.smoothing,
      mipmapBlur: true,
      radius: CONFIG.bloom.radius,
    });
    const grain = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false });
    grain.blendMode.opacity.value = 0.035;
    this.composer.addPass(new EffectPass(this.camera, bloom, tone, look, vignette));
    this.composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH }), grain));

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // filmGauge = 36 mm sobre el lado mayor: el encuadre horizontal de un 50 mm se mantiene.
    this.camera.setFocalLength(CONFIG.camera.focalLength);
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    // Enfoque suave hacia el objetivo (como un autofoco lento de cámara real).
    const d = this.camera.position.distanceTo(this.focusTarget);
    this.focusDistance += (d - this.focusDistance) * Math.min(1, dt * 6);
    this.dof.focusDistance = this.focusDistance;
    this.composer.render(dt);
  }
}
