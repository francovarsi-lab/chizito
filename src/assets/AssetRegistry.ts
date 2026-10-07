import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PieceDefinition } from '../pieces/PieceDefinition';
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
    const loader = new GLTFLoader();
    await Promise.all(
      this.pieces.all().map(async (def) => {
        const url = `${import.meta.env.BASE_URL}assets/models/${def.type}.glb`;
        const buf = await probeFile(url, 'glTF');
        if (!buf) return;
        try {
          const gltf = await loader.parseAsync(buf, '');
          const tpl = normalizeToFrame(gltf.scene, def, true);
          tpl.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          this.glbTemplates.set(def.type, tpl);
          console.info(`[assets] usando ${def.type}.glb`);
        } catch (err) {
          console.warn(`[assets] no se pudo leer ${def.type}.glb, uso el procedural`, err);
        }
      }),
    );
  }

  hasGlb(type: string): boolean {
    return this.glbTemplates.has(type);
  }

  /** Crea una instancia lista para agregar a la escena, en el marco local de la definición. */
  create(type: string, seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.Object3D {
    const def = this.pieces.get(type);
    const tpl = this.glbTemplates.get(type);
    if (tpl) return tpl.clone(true);
    return normalizeToFrame(def.procedural(seed, detail), def, false);
  }
}

const AXES = ['x', 'y', 'z'] as const;

/**
 * Envuelve `obj` en un grupo que lo lleva al marco de la definición:
 *  - centered: eje más largo → X, centro del bbox en el origen.
 *  - tip:      eje más largo → Y, mínimo de Y en el origen, centrado en X/Z.
 * Con `rescale`, la dimensión más larga pasa a medir `def.dimensions.length`.
 */
export function normalizeToFrame(obj: THREE.Object3D, def: PieceDefinition, rescale: boolean): THREE.Object3D {
  const inner = new THREE.Group();
  inner.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const longest = AXES.reduce((a, b) => (size[b] > size[a] ? b : a), 'x' as (typeof AXES)[number]);
  const want = def.frame === 'centered' ? 'x' : 'y';
  if (longest !== want) {
    const from = new THREE.Vector3().setComponent(AXES.indexOf(longest), 1);
    const to = new THREE.Vector3().setComponent(AXES.indexOf(want), 1);
    inner.quaternion.setFromUnitVectors(from, to);
  }
  if (rescale) inner.scale.setScalar(def.dimensions.length / Math.max(size.x, size.y, size.z));
  inner.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner);
  const c = b2.getCenter(new THREE.Vector3());
  if (def.frame === 'centered') inner.position.sub(c);
  else inner.position.set(-c.x, -b2.min.y, -c.z);
  const outer = new THREE.Group();
  outer.name = def.type;
  outer.add(inner);
  return outer;
}
