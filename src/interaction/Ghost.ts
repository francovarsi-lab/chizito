import * as THREE from 'three';

/**
 * Previsualización semitransparente de una pieza. Clona los materiales de esa instancia (los
 * originales se comparten entre todas las piezas del mismo tipo) y los restaura al terminar.
 */
export function setGhost(obj: THREE.Object3D, opacity: number | null): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const ud = mesh.userData as { ghostOriginal?: THREE.Material | THREE.Material[] };
    if (opacity === null) {
      if (ud.ghostOriginal) {
        const cur = mesh.material;
        (Array.isArray(cur) ? cur : [cur]).forEach((m) => m.dispose());
        mesh.material = ud.ghostOriginal;
        delete ud.ghostOriginal;
      }
      return;
    }
    if (!ud.ghostOriginal) {
      ud.ghostOriginal = mesh.material;
      const clone = (m: THREE.Material) => {
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    }
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => (m.opacity = opacity));
  });
}
