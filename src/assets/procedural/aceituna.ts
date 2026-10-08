import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { buildTube } from './tube';

/**
 * Aceituna verde rellena de morrón: elipsoide brillante (~2 × 1,5 cm), con el morrón asomando por
 * una punta. Marco 'tip': entra por la punta lisa (origen) y el morrón queda en la cola (+Y).
 */
export const ACEITUNA_LENGTH = 0.02;
export const ACEITUNA_DIAMETER = 0.015;

let oliveMat: THREE.MeshPhysicalMaterial | null = null;
let pimientoMat: THREE.MeshPhysicalMaterial | null = null;

function materials() {
  oliveMat ??= new THREE.MeshPhysicalMaterial({
    name: 'aceituna',
    vertexColors: true,
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18, // brillo de salmuera
    sheen: 0.2,
    sheenColor: new THREE.Color('#d8e6a0'),
  });
  pimientoMat ??= new THREE.MeshPhysicalMaterial({ name: 'morron', color: '#e2584a', roughness: 0.35, clearcoat: 0.6 });
  return { oliveMat, pimientoMat };
}

export function createAceituna(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.Object3D {
  const rnd = mulberry32(seed * 3301 + 5);
  const noise = new Simplex3(seed + 41);
  const L = ACEITUNA_LENGTH * (0.92 + rnd() * 0.16);
  const R = (ACEITUNA_DIAMETER / 2) * (0.92 + rnd() * 0.14);
  const hole = R * 0.42; // boca del relleno en la cola

  const geo = buildTube({
    rows: detail === 'hero' ? 90 : 18,
    cols: detail === 'hero' ? 64 : 14,
    rowParam: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
    center: (u, out) => out.set(0, u * L, 0),
    radius: (u) => {
      // Elipsoide algo más gordo hacia la cola; en la cola, hundido donde va el morrón.
      const e = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
      const asym = 1 + 0.06 * (u - 0.5);
      let r = R * e * asym;
      if (u > 0.9) r = Math.max(r, Math.min(hole, R * e * 1.4));
      return [r, r * 0.96];
    },
    displace: (p) => noise.noise(p.x * 300, p.y * 300, p.z * 300) * 0.00006,
    color: (p, _n, u, _th, _d, out) => {
      const t = noise.fbm(p.x * 120, p.y * 90, p.z * 120, 3) * 0.5 + 0.5;
      out.set('#7f9233').lerp(new THREE.Color('#a3b247'), THREE.MathUtils.smoothstep(t, 0.35, 0.9) * 0.6);
      if (u > 0.93) out.lerp(new THREE.Color('#5d6e22'), 0.5);
    },
    up: new THREE.Vector3(0, 0, 1),
    uvScale: [1, 1],
  });
  const { oliveMat: om, pimientoMat: pm } = materials();
  const olive = new THREE.Mesh(geo, om);
  olive.name = 'aceituna';
  olive.castShadow = true;
  olive.receiveShadow = true;
  // Morrón: un "tapón" rojo arrugadito en la cola.
  const pim = new THREE.Mesh(new THREE.SphereGeometry(hole * 0.95, 24, 16), pm);
  pim.scale.set(1, 0.55, 1);
  pim.position.set(0, L - hole * 0.25, 0);
  pim.castShadow = true;
  olive.add(pim);
  return olive;
}
