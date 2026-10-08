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

/**
 * Resaltado sutil de una pieza seleccionada: un leve brillo cálido sólo en SUS mallas (no en las
 * piezas clavadas en ella). `null` lo quita.
 */
export function setHighlight(obj: THREE.Object3D, on: boolean): void {
  const visit = (o: THREE.Object3D, root: boolean) => {
    if (!root && o.userData.pieceId) return; // otra pieza (hija): no se resalta
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const ud = mesh.userData as { hlOriginal?: THREE.Material | THREE.Material[] };
      if (on && !ud.hlOriginal) {
        ud.hlOriginal = mesh.material;
        const clone = (m: THREE.Material) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          if (c.emissive) {
            c.emissive = new THREE.Color('#ffcf80');
            c.emissiveIntensity = 0.32;
          }
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      } else if (!on && ud.hlOriginal) {
        const cur = mesh.material;
        (Array.isArray(cur) ? cur : [cur]).forEach((m) => m.dispose());
        mesh.material = ud.hlOriginal;
        delete ud.hlOriginal;
      }
    }
    o.children.forEach((c) => visit(c, false));
  };
  visit(obj, true);
}
