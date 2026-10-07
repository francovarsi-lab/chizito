import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { HeightField, Profiles } from './HeightField';
import { buildTube } from './tube';

/**
 * Palito salado procedural. Convención de pieza "perforante": la PUNTA está en el origen
 * y el cuerpo se extiende hacia +Y (la inserción avanza en -Y local).
 */

const TILE = 0.01;
let sharedMaterial: THREE.MeshPhysicalMaterial | null = null;

export function palitoMaterial(): THREE.MeshPhysicalMaterial {
  if (sharedMaterial) return sharedMaterial;
  const size = 512;
  const hf = new HeightField(size);
  const rnd = mulberry32(31);
  hf.addPeriodicNoise(8, 0.25, 5, 4);
  // Estrías finas a lo largo (la masa extrudida) — alargadas en U.
  for (let i = 0; i < 700; i++) hf.stamp(rnd() * size, rnd() * size, 2 + rnd() * 4, 0.3, Profiles.crater, 3 + rnd() * 5);
  for (let i = 0; i < 2500; i++) hf.stamp(rnd() * size, rnd() * size, 1 + rnd() * 2, 0.15, Profiles.grain);
  hf.normalize();
  const normal = hf.toNormalMap(6);
  const rough = hf.toGrayTexture((h) => 0.62 - (h - 0.5) * 0.25);
  const color = hf.toColorTexture((h, _x, _y, rgb) => {
    const k = 0.9 + h * 0.15;
    rgb[0] = k;
    rgb[1] = k * 0.97;
    rgb[2] = k * 0.92;
  });
  sharedMaterial = new THREE.MeshPhysicalMaterial({
    name: 'palito',
    vertexColors: true,
    map: color,
    normalMap: normal,
    roughnessMap: rough,
    roughness: 1,
    // Leve brillo de horneado.
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
    sheen: 0.3,
    sheenColor: new THREE.Color('#f3d29a'),
    sheenRoughness: 0.6,
  });
  return sharedMaterial;
}

export const PALITO_LENGTH = 0.1;
export const PALITO_RADIUS = 0.0015;

export function buildPalitoGeometry(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.BufferGeometry {
  const rnd = mulberry32(seed * 104729 + 3);
  const noise = new Simplex3(seed + 77);
  const L = PALITO_LENGTH * (0.97 + rnd() * 0.06);
  const R = PALITO_RADIUS * (0.92 + rnd() * 0.16);
  const capA = R * (0.7 + rnd() * 0.5);
  const capB = R * (0.7 + rnd() * 0.5);
  const bow = (rnd() - 0.5) * 0.0012;

  const center = (u: number, out: THREE.Vector3) => out.set(bow * Math.sin(Math.PI * u), u * L, 0);
  const radius = (u: number, th: number): [number, number] => {
    const s = u * L;
    const fromEnd = Math.min(s, L - s);
    const cap = s < L / 2 ? capA : capB;
    const t = Math.min(1, fromEnd / cap);
    const prof = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    const irr = 1 + 0.06 * noise.noise(u * 18, Math.cos(th) * 0.6, Math.sin(th) * 0.6) + 0.03 * noise.noise(u * 70, th * 0.3, 2);
    return [R * prof * irr, R * prof * irr * 0.96];
  };
  const displace = (p: THREE.Vector3, _n: THREE.Vector3, u: number) => {
    const s = u * L;
    const nearEnd = Math.min(s, L - s) < R * 1.4 ? 1 : 0.35;
    return noise.noise(p.x * 3000, p.y * 1200, p.z * 3000) * 0.00008 * nearEnd;
  };
  const golden = new THREE.Color('#e4bd7c');
  const light = new THREE.Color('#f0d39e');
  const dark = new THREE.Color('#c89552');
  const crumb = new THREE.Color('#f1dcae');
  const color = (p: THREE.Vector3, _n: THREE.Vector3, u: number, _th: number, _d: number, out: THREE.Color) => {
    const t = noise.fbm(p.x * 400, p.y * 60, p.z * 400, 3) * 0.5 + 0.5;
    out.copy(golden).lerp(light, THREE.MathUtils.smoothstep(t, 0.35, 0.8));
    out.lerp(dark, THREE.MathUtils.smoothstep(noise.noise(p.y * 90, p.x * 500, 4), 0.4, 0.95) * 0.5);
    // Extremos cortados: miga más clara.
    const s = u * L;
    const e = Math.min(s, L - s);
    if (e < R * 0.8) out.lerp(crumb, 1 - e / (R * 0.8));
  };

  const geo = buildTube({
    rows: detail === 'hero' ? 180 : 24,
    cols: detail === 'hero' ? 20 : 8,
    rowParam: (t) => {
      // Concentrar anillos en las puntas redondeadas.
      const k = 0.06;
      if (t < k) return (t / k) * (capA * 1.2) / L;
      if (t > 1 - k) return 1 - ((1 - t) / k) * (capB * 1.2) / L;
      const a = (capA * 1.2) / L;
      const b = 1 - (capB * 1.2) / L;
      return a + ((t - k) / (1 - 2 * k)) * (b - a);
    },
    center,
    radius,
    displace,
    color,
    up: new THREE.Vector3(0, 0, 1),
    uvScale: [L / TILE, 1],
  });
  return geo;
}

export function createPalito(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.Mesh {
  const mesh = new THREE.Mesh(buildPalitoGeometry(seed, detail), palitoMaterial());
  mesh.name = 'palito';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
