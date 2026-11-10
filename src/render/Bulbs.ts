import * as THREE from 'three';

/**
 * Guirnaldas de lucecitas detrás de la mesa (las mismas en el constructor y en la pelea: mismo mundo). De lejos, con el
 * desenfoque, son círculos de luz. De día brillan suave (`level` bajo); en la pelea, de noche, a pleno.
 */
export interface Bulbs {
  group: THREE.Group;
  /** 0..1: brillo (el constructor las deja suaves; la pelea las sube). */
  level: number;
  update(dt: number): void;
}

export const BULBS_NAME = 'lucecitas';

export function createBulbs(z0: number, level = 0.4): Bulbs {
  const group = new THREE.Group();
  group.name = BULBS_NAME;
  const bulbsGeo = new THREE.SphereGeometry(1, 10, 8);
  const wireMat = new THREE.MeshStandardMaterial({ color: '#2b2420', roughness: 0.7 });
  const warm = [new THREE.Color(5, 3.6, 1.6), new THREE.Color(5, 2.8, 1.1), new THREE.Color(4.2, 3.9, 3.2)];
  const party = [new THREE.Color(4.5, 1.4, 2.2), new THREE.Color(1.4, 3.6, 3.4), new THREE.Color(4.6, 3.4, 0.9)];
  const bulbs: { m: THREE.Mesh; base: THREE.Color; ph: number }[] = [];
  const strand = (a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number, r: number, colorful: boolean): void => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, r * 0.12, 4), wireMat));
    for (let i = 0; i < n; i++) {
      const base = (colorful && i % 3 === 1 ? party : warm)[i % 3].clone();
      const m = new THREE.Mesh(bulbsGeo, new THREE.MeshBasicMaterial({ color: base.clone(), toneMapped: false }));
      m.scale.set(r, r * 1.3, r);
      m.position.copy(curve.getPointAt((i + 0.5) / n)).add(new THREE.Vector3(0, -r * 1.4, 0));
      group.add(m);
      bulbs.push({ m, base, ph: i * 1.7 });
    }
  };
  strand(new THREE.Vector3(-0.7, 0.2, z0 - 0.55), new THREE.Vector3(0.7, 0.19, z0 - 0.6), 0.07, 34, 0.0042, true);
  strand(new THREE.Vector3(-1.0, 0.42, -1.18), new THREE.Vector3(1.0, 0.4, -1.18), 0.12, 46, 0.007, false);
  strand(new THREE.Vector3(-0.9, 0.3, -1.05), new THREE.Vector3(0.6, 0.28, -1.1), 0.08, 30, 0.006, true);
  group.traverse((o) => (o.userData.noPick = true));
  let t = 0;
  const api: Bulbs = {
    group,
    level,
    update(dt) {
      t += dt;
      // Titileo leve, como lucecitas reales. De día, una lucecita encendida apenas se nota: se ven más chicas y suaves.
      const k = 0.2 + 0.8 * api.level;
      for (const b of bulbs) {
        b.m.scale.y = b.m.scale.x * (1.3 + 0.04 * Math.sin(t * 3 + b.ph));
        (b.m.material as THREE.MeshBasicMaterial).color.copy(b.base).multiplyScalar(k * (0.9 + 0.1 * Math.sin(t * 2.3 + b.ph)));
      }
    },
  };
  group.userData.bulbs = api;
  return api;
}
