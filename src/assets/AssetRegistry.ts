import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { PieceDefinition, PieceParams } from '../pieces/PieceDefinition';
import type { PieceRegistry } from '../pieces/PieceRegistry';
import { probeFile } from './probe';

/**
 * Fuente única de modelos de pieza. Si existe public/assets/models/<tipo>.glb se usa ese modelo
 * (normalizado a la escala y al marco local de la definición); si no, el procedural.
 * La lógica de juego nunca sabe de dónde salió la malla.
 */
export class AssetRegistry {
  private glbTemplates = new Map<string, THREE.Object3D>();

  constructor(private readonly pieces: PieceRegistry) {}

  async init(): Promise<void> {
    // Soporta GLB comprimidos con Draco o meshopt (habituales en exportadores de fotogrametría/IA).
    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}assets/draco/`);
    const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
    // Un GLB por tipo y, si la definición tiene variantes, uno opcional por variante.
    const wanted = this.pieces.all().filter((def) => def.frame !== 'free').flatMap((def) => [
      { def, key: def.type },
      ...(def.variants ?? []).map((v) => ({ def, key: `${def.type}-${v.id}` })),
    ]);
    await Promise.all(
      wanted.map(async ({ def, key }) => {
        const url = `${import.meta.env.BASE_URL}assets/models/${key}.glb`;
        const buf = await probeFile(url, 'glTF');
        if (!buf) return;
        try {
          const gltf = await loader.parseAsync(buf, '');
          prepareGlb(gltf.scene);
          const tpl = normalizeToFrame(gltf.scene, def, true);
          this.glbTemplates.set(key, tpl);
          console.info(`[assets] usando ${key}.glb`);
        } catch (err) {
          console.warn(`[assets] no se pudo leer ${key}.glb, uso el procedural`, err);
        }
      }),
    );
  }

  definition(type: string): PieceDefinition {
    return this.pieces.get(type);
  }

  hasGlb(type: string): boolean {
    return this.glbTemplates.has(type);
  }

  /** Crea una instancia lista para agregar a la escena, en el marco local de la definición. */
  create(type: string, seed: number, detail: 'hero' | 'prop' = 'hero', params?: PieceParams): THREE.Object3D {
    const def = this.pieces.get(type);
    const variant = typeof params?.variant === 'string' ? params.variant : null;
    const tpl = (variant && this.glbTemplates.get(`${type}-${variant}`)) || this.glbTemplates.get(type);
    if (tpl) return tpl.clone(true);
    return normalizeToFrame(def.procedural(seed, detail, params), def, false);
  }
}

/**
 * Deja un GLB externo (fotogrametría / IA) listo para la escena PBR:
 *  - materiales "unlit" (KHR_materials_unlit → MeshBasicMaterial) pasan a MeshStandardMaterial,
 *    para que reciban la luz de ventana, el IBL, las sombras y el AO;
 *  - metalness en 0 (muchos exportadores dejan el default 1 de glTF; un snack nunca es metálico) y
 *    roughness alto si no hay mapa;
 *  - normales calculadas si faltan; texturas con anisotropía; sombras habilitadas.
 */
export function prepareGlb(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
    const fix = (m: THREE.Material): THREE.Material => {
      let std: THREE.MeshStandardMaterial;
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        std = m as THREE.MeshStandardMaterial;
      } else {
        const b = m as THREE.MeshBasicMaterial;
        std = new THREE.MeshStandardMaterial({
          name: m.name,
          map: b.map ?? null,
          color: b.color ?? new THREE.Color(1, 1, 1),
          vertexColors: b.vertexColors,
          transparent: b.transparent,
          alphaTest: b.alphaTest,
        });
        m.dispose();
      }
      if (!std.metalnessMap) std.metalness = 0;
      if (!std.roughnessMap) std.roughness = Math.max(std.roughness, 0.8);
      for (const t of [std.map, std.normalMap, std.roughnessMap, std.aoMap]) if (t) t.anisotropy = 8;
      std.envMapIntensity = 1;
      return std;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fix) : fix(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

const AXES = ['x', 'y', 'z'] as const;

/** Promedio (x, z) de los vértices a menos de 0,4 mm del mínimo en Y (en el marco de `root`). */
function lowestPoint(root: THREE.Object3D, minY: number): THREE.Vector3 {
  root.updateMatrixWorld(true);
  const inv = root.parent ? root.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
  const acc = new THREE.Vector3();
  const v = new THREE.Vector3();
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const toRoot = inv.clone().multiply(m.matrixWorld);
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
      if (v.y < minY + 0.0004) {
        acc.add(v);
        n++;
      }
    }
  });
  return n ? acc.divideScalar(n) : new THREE.Vector3();
}

/**
 * Envuelve `obj` en un grupo que lo lleva al marco de la definición:
 *  - centered: eje más largo → X, centro del bbox en el origen.
 *  - tip:      eje más largo → Y, mínimo de Y en el origen, centrado en X/Z.
 * Con `rescale`, la dimensión más larga pasa a medir `def.dimensions.length`.
 */
export function normalizeToFrame(obj: THREE.Object3D, def: PieceDefinition, rescale: boolean): THREE.Object3D {
  if (def.frame === 'free') {
    const outer = new THREE.Group();
    outer.name = def.type;
    outer.add(obj);
    return outer;
  }
  const inner = new THREE.Group();
  inner.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const longest = AXES.reduce((a, b) => (size[b] > size[a] ? b : a), 'x' as (typeof AXES)[number]);
  const want = def.frame === 'centered' ? 'x' : 'y';
  // Un procedural ya orientado se respeta; un GLB siempre se reorienta por su eje más largo.
  if (longest !== want && !(def.keepOrientation && !rescale)) {
    const from = new THREE.Vector3().setComponent(AXES.indexOf(longest), 1);
    const to = new THREE.Vector3().setComponent(AXES.indexOf(want), 1);
    inner.quaternion.setFromUnitVectors(from, to);
  }
  if (rescale) inner.scale.setScalar(def.dimensions.length / Math.max(size.x, size.y, size.z));
  inner.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner);
  const c = b2.getCenter(new THREE.Vector3());
  if (def.frame === 'centered') inner.position.sub(c);
  else {
    // Marco 'tip': el origen va en el punto REAL más bajo (la punta o el borde por donde entra), no en
    // el centro de la caja: en un triángulo la parte más baja es una punta corrida hacia un costado, y
    // la pieza quedaba "clavada" por un punto vacío, flotando sobre la superficie.
    const low = lowestPoint(inner, b2.min.y);
    inner.position.set(-low.x, -b2.min.y, -low.z);
  }
  const outer = new THREE.Group();
  outer.name = def.type;
  outer.add(inner);
  return outer;
}
