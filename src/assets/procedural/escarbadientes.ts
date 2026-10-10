import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { buildTube } from './tube';

/**
 * Escarbadientes de madera clara (Ø 2 mm × 3 cm, punta afilada en los dos extremos) y su variante
 * "espadita de cotillón" (plástico brillante pastel: hoja con filo, guarda y mango con pomo).
 * Marco 'tip': la punta de entrada en el origen, el cuerpo hacia +Y.
 */
export const ESCARBADIENTES_LENGTH = 0.03;
export const ESCARBADIENTES_RADIUS = 0.001;
/** Largo de la hoja de la espadita (desde la punta hasta la guarda en cruz). */
export const ESPADITA_BLADE = ESCARBADIENTES_LENGTH * 0.7;
/** Radio de la barra de la guarda. */
export const ESPADITA_GUARD_R = 0.0007;

export interface EscarbadientesParams {
  variant?: 'liso' | 'espadita';
}

let woodMat: THREE.MeshPhysicalMaterial | null = null;
const plasticMats = new Map<string, THREE.MeshPhysicalMaterial>();
const PASTELES = ['#ff9fb8', '#8fd8c2', '#b9a8f0', '#ffd36e', '#8cc8f5'];

function wood(): THREE.MeshPhysicalMaterial {
  woodMat ??= new THREE.MeshPhysicalMaterial({
    name: 'escarbadientes',
    vertexColors: true,
    roughness: 0.75,
    sheen: 0.3,
    sheenColor: new THREE.Color('#fff0d0'),
  });
  return woodMat;
}

function plastic(color: string): THREE.MeshPhysicalMaterial {
  let m = plasticMats.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      name: `espadita-${color}`,
      color,
      roughness: 0.22,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      transmission: 0.25, // plástico apenas translúcido
      thickness: 0.001,
    });
    plasticMats.set(color, m);
  }
  return m;
}

export function createEscarbadientes(seed: number, detail: 'hero' | 'prop' = 'hero', params: EscarbadientesParams = {}): THREE.Object3D {
  return params.variant === 'espadita' ? createEspadita(seed, detail) : createLiso(seed, detail);
}

function createLiso(seed: number, detail: 'hero' | 'prop'): THREE.Mesh {
  const rnd = mulberry32(seed * 7717 + 9);
  const noise = new Simplex3(seed + 13);
  const L = ESCARBADIENTES_LENGTH * (0.97 + rnd() * 0.06);
  const R = ESCARBADIENTES_RADIUS * (0.95 + rnd() * 0.1);
  const taper = 0.0045; // largo de cada punta afilada
  const bow = (rnd() - 0.5) * 0.0004;
  const geo = buildTube({
    rows: detail === 'hero' ? 120 : 20,
    cols: detail === 'hero' ? 20 : 8,
    rowParam: (t) => t,
    center: (u, out) => out.set(bow * Math.sin(Math.PI * u), u * L, 0),
    radius: (u) => {
      const s = u * L;
      const e = Math.min(s, L - s);
      // Punta cónica apenas redondeada (no termina en un filo perfecto).
      const k = Math.min(1, e / taper);
      const r = R * (0.04 + 0.96 * Math.pow(k, 0.85));
      return [u <= 0 || u >= 1 ? 0 : r, u <= 0 || u >= 1 ? 0 : r];
    },
    displace: (p) => noise.noise(p.x * 2000, p.y * 300, p.z * 2000) * 0.00001,
    color: (p, _n, u, _th, _d, out) => {
      // Veta de madera clara a lo largo.
      const v = noise.noise(p.x * 3000, p.y * 60, p.z * 3000) * 0.5 + 0.5;
      out.set('#e9d3a6').lerp(new THREE.Color('#d2b27a'), THREE.MathUtils.smoothstep(v, 0.55, 0.95) * 0.6);
      const e = Math.min(u, 1 - u) * L;
      // Las puntas, lijadas: un poco más claras.
      out.lerp(new THREE.Color('#f3e4c2'), (1 - THREE.MathUtils.smoothstep(e, 0.0005, taper)) * 0.4);
    },
    up: new THREE.Vector3(0, 0, 1),
    uvScale: [1, 1],
  });
  const mesh = new THREE.Mesh(geo, wood());
  mesh.name = 'escarbadientes';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Espadita de cotillón: hoja chata con punta, guarda en cruz y mango con pomo, todo de un color. */
function createEspadita(seed: number, detail: 'hero' | 'prop'): THREE.Group {
  const rnd = mulberry32(seed * 4243 + 1);
  const mat = plastic(PASTELES[Math.floor(rnd() * PASTELES.length)]);
  const L = ESCARBADIENTES_LENGTH;
  const bladeL = ESPADITA_BLADE;
  const tip = 0.006;
  const g = new THREE.Group();
  g.name = 'espadita';

  const blade = buildTube({
    rows: detail === 'hero' ? 60 : 12,
    cols: detail === 'hero' ? 24 : 8,
    center: (u, out) => out.set(0, u * bladeL, 0),
    radius: (u) => {
      if (u <= 0 || u >= 1) return [0, 0];
      const s = u * bladeL;
      const k = Math.min(1, s / tip);
      const w = 0.0011 * Math.pow(k, 0.8) * (1 - 0.15 * u);
      // Sección en rombo aplanado (hoja con filo).
      return [w, w * 0.32];
    },
    up: new THREE.Vector3(0, 0, 1),
  });
  const bladeMesh = new THREE.Mesh(blade, mat);
  g.add(bladeMesh);

  // Guarda en cruz con los extremos redondeados.
  const guard = new THREE.Mesh(new THREE.CapsuleGeometry(ESPADITA_GUARD_R, 0.0062, 4, 12), mat);
  guard.rotation.z = Math.PI / 2;
  guard.position.y = bladeL;
  g.add(guard);

  // Mango con anillitos y pomo.
  const gripL = L - bladeL - 0.0026;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.00075, gripL, 14, 1), mat);
  grip.position.y = bladeL + gripL / 2;
  g.add(grip);
  for (let i = 1; i <= 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.00075, 0.00022, 6, 16), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = bladeL + (gripL * i) / 4;
    g.add(ring);
  }
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 18, 12), mat);
  pommel.position.y = L - 0.0013;
  g.add(pommel);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
