import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CONFIG } from '../config';

/** Capa de las piezas "héroe" (chizito + todo lo clavado): las ve la cámara de la sombra de contacto. */
export const HERO_LAYER = 1;
/** Capa de los recipientes de la mesa (bowls, vasitos, platitos): comparten UNA sombra suave agrupada. */
export const BOWL_LAYER = 2;

/** Pasa los recipientes a la capa de su sombra de grupo y les saca la sombra dura del sol. */
export function markBowl(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.layers.enable(BOWL_LAYER);
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
}

export interface ContactShadowOptions {
  layer?: number;
  /** Semilado (m) del mapa de la sombra, visto desde la luz. */
  halfExtent?: number;
  size?: number;
  opacity?: number;
  /** Penumbra (m). */
  softness?: number;
  /** Posición (x, z) y lado (m) del plano sobre la mesa donde se proyecta. */
  decal?: { x: number; z: number; size: number };
  /** Si nada se mueve, se dibuja una sola vez (hasta `invalidate()`). */
  isStatic?: boolean;
}

/**
 * Prepara una pieza héroe: entra en la capa de la sombra de contacto y deja de proyectar la sombra
 * dura del sol (la reemplaza la sombra suave). Sigue recibiendo luz, AO e IBL normalmente.
 */
export function markHero(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.layers.enable(HERO_LAYER);
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
}

/**
 * Sombra de contacto suave de un objeto que flota: se renderiza la silueta de las piezas héroe vista
 * desde la luz (cámara ortográfica), se desenfoca (penumbra de una ventana grande) y se proyecta sobre
 * la mesa con la misma matriz. Barato, estable y mucho más difuso que un shadow map PCF.
 */
export class ContactShadow {
  readonly decal: THREE.Mesh;
  private readonly cam: THREE.OrthographicCamera;
  private readonly rtA: THREE.WebGLRenderTarget;
  private readonly rtB: THREE.WebGLRenderTarget;
  private readonly silhouette = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  private readonly blurQuad: FullScreenQuad;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly shadowMatrix = new THREE.Matrix4();
  private readonly size: number;
  private readonly halfExtent: number;
  private readonly softness: number;
  private readonly isStatic: boolean;
  private done = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly center: THREE.Vector3,
    opts: ContactShadowOptions = {},
  ) {
    this.size = opts.size ?? 256;
    this.halfExtent = opts.halfExtent ?? 0.16;
    this.softness = opts.softness ?? CONFIG.contactShadow.softness;
    this.isStatic = opts.isStatic ?? false;
    const e = this.halfExtent;
    this.cam = new THREE.OrthographicCamera(-e, e, e, -e, 0.01, 1.2);
    this.cam.layers.set(opts.layer ?? HERO_LAYER);
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true };
    this.rtA = new THREE.WebGLRenderTarget(this.size, this.size, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(this.size, this.size, { ...rtOpts, depthBuffer: false });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
        void main() {
          float a = 0.0; float wsum = 0.0;
          for (int i = -6; i <= 6; i++) {
            float w = exp(-float(i * i) / 18.0);
            a += texture2D(tDiffuse, vUv + dir * float(i)).a * w;
            wsum += w;
          }
          gl_FragColor = vec4(0.0, 0.0, 0.0, a / wsum);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.blurQuad = new FullScreenQuad(this.blurMat);

    const decalMat = new THREE.ShaderMaterial({
      name: 'ContactShadow',
      uniforms: {
        shadowMap: { value: this.rtA.texture },
        shadowMatrix: { value: this.shadowMatrix },
        opacity: { value: opts.opacity ?? CONFIG.contactShadow.opacity },
        tint: { value: new THREE.Color(0.06, 0.04, 0.03) },
      },
      vertexShader: /* glsl */ `
        uniform mat4 shadowMatrix;
        varying vec4 vShadow;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vShadow = shadowMatrix * wp;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D shadowMap; uniform float opacity; uniform vec3 tint;
        varying vec4 vShadow;
        void main() {
          vec2 uv = vShadow.xy / vShadow.w * 0.5 + 0.5;
          vec2 edge = smoothstep(0.0, 0.08, uv) * smoothstep(0.0, 0.08, 1.0 - uv);
          float a = pow(clamp(texture2D(shadowMap, uv).a * 1.6, 0.0, 1.0), 0.8) * edge.x * edge.y * opacity;
          gl_FragColor = vec4(tint, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const d = opts.decal ?? { x: center.x, z: center.z - 0.08, size: 0.6 };
    this.decal = new THREE.Mesh(new THREE.PlaneGeometry(d.size, d.size), decalMat);
    this.decal.rotation.x = -Math.PI / 2;
    this.decal.position.set(d.x, 0.0012, d.z);
    this.decal.name = 'contact-shadow';
    this.decal.renderOrder = 1;
  }

  /** Fuerza a redibujar (sombras estáticas). */
  invalidate(): void {
    this.done = false;
  }

  update(renderer: THREE.WebGLRenderer): void {
    if (this.isStatic && this.done) return;
    this.done = true;
    const dir = CONFIG.light.direction;
    this.cam.position.copy(this.center).addScaledVector(dir, 0.5);
    this.cam.lookAt(this.center);
    this.cam.updateMatrixWorld();
    this.shadowMatrix.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);

    const prevTarget = renderer.getRenderTarget();
    const prevOverride = this.scene.overrideMaterial;
    const prevBg = this.scene.background;
    const prevAuto = renderer.shadowMap.autoUpdate;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    this.scene.overrideMaterial = this.silhouette;
    this.scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.rtA);
    renderer.clear();
    renderer.render(this.scene, this.cam);
    this.scene.overrideMaterial = prevOverride;
    this.scene.background = prevBg;
    renderer.shadowMap.autoUpdate = prevAuto;

    // Desenfoque separable: penumbra ≈ softness (m) en texels del mapa.
    const texelWorld = (2 * this.halfExtent) / this.size;
    const step = this.softness / texelWorld / 4;
    for (let i = 0; i < 2; i++) {
      this.blurMat.uniforms.tDiffuse.value = this.rtA.texture;
      this.blurMat.uniforms.dir.value.set(step / this.size, 0);
      renderer.setRenderTarget(this.rtB);
      this.blurQuad.render(renderer);
      this.blurMat.uniforms.tDiffuse.value = this.rtB.texture;
      this.blurMat.uniforms.dir.value.set(0, step / this.size);
      renderer.setRenderTarget(this.rtA);
      this.blurQuad.render(renderer);
    }
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.setRenderTarget(prevTarget);
  }
}
