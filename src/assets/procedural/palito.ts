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
    // Brillo leve de fritura + polvo de queso.
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
    sheen: 0.45,
    sheenColor: new THREE.Color('#ffd08a'),
    sheenRoughness: 0.6,
  });
  return sharedMaterial;
}

/** Palito de queso naranja, grueso e irregular (ver referencia): ~8,5 cm × Ø 6 mm. */
export const PALITO_LENGTH = 0.085;
export const PALITO_RADIUS = 0.003;

export function buildPalitoGeometry(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.BufferGeometry {
  const rnd = mulberry32(seed * 104729 + 3);
  const noise = new Simplex3(seed + 77);
  const L = PALITO_LENGTH * (0.9 + rnd() * 0.2);
  const R = PALITO_RADIUS * (0.9 + rnd() * 0.2);
  // Puntas redondeadas tipo "gota": casquete casi semiesférico, a veces un poco más gordo.
  const capA = R * (0.95 + rnd() * 0.25);
  const capB = R * (0.95 + rnd() * 0.25);
  const bendX = (rnd() - 0.5) * 0.004;
  const bendZ = (rnd() - 0.5) * 0.003;
  const sBend = (rnd() - 0.5) * 0.0018;
  const ph = rnd() * 10;

  const center = (u: number, out: THREE.Vector3) =>
    out.set(bendX * Math.sin(Math.PI * u) + sBend * Math.sin(2 * Math.PI * u), u * L, bendZ * Math.sin(Math.PI * u));
  const radius = (u: number, th: number): [number, number] => {
    const sv = u * L;
    const fromEnd = Math.min(sv, L - sv);
    const cap = sv < L / 2 ? capA : capB;
    const t = Math.min(1, fromEnd / cap);
    const prof = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    // Grosor irregular a lo largo (extrusión despareja) + sección no del todo circular.
    const along = 1 + 0.12 * noise.noise(u * 4 + ph, 0.4, 0) + 0.06 * noise.noise(u * 13 + ph, 2.1, 0);
    const sect = 1 + 0.05 * noise.noise(Math.cos(th) * 0.8 + u * 6, Math.sin(th) * 0.8, 5);
    const r = R * prof * along * sect;
    return [r, r * 0.94];
  };
  // Superficie grumosa: bultitos redondos y poros.
  const displace = (p: THREE.Vector3, _n: THREE.Vector3, u: number) => {
    const fade = Math.min(1, Math.sin(Math.PI * u) * 6);
    const lumps = (noise.billow(p.x * 300, p.y * 210, p.z * 300, 3) - 0.62) * 0.0011;
    const fine = noise.noise(p.x * 1400, p.y * 1000, p.z * 1400) * 0.00008;
    return lumps * fade + fine;
  };
  const orange = new THREE.Color('#f2a240');
  const light = new THREE.Color('#f9c06a');
  const dark = new THREE.Color('#d9812c');
  const color = (p: THREE.Vector3, _n: THREE.Vector3, u: number, _th: number, d: number, out: THREE.Color) => {
    const t = noise.fbm(p.x * 220, p.y * 90, p.z * 220, 3) * 0.5 + 0.5;
    out.copy(orange).lerp(light, THREE.MathUtils.smoothstep(t, 0.4, 0.9) * 0.7);
    out.lerp(dark, THREE.MathUtils.smoothstep(noise.noise(p.y * 70, p.x * 300, 4), 0.45, 0.95) * 0.45);
    const k = THREE.MathUtils.clamp(d / 0.0004, -1, 1);
    if (k > 0) out.lerp(light, k * 0.25);
    else out.lerp(dark, -k * 0.3);
    // Puntas un poco más tostadas.
    const sv = u * L;
    const e = Math.min(sv, L - sv);
    if (e < R * 1.5) out.lerp(dark, (1 - e / (R * 1.5)) * 0.35);
  };

  return buildTube({
    rows: detail === 'hero' ? 200 : 26,
    cols: detail === 'hero' ? 40 : 10,
    rowParam: (t) => {
      // Más anillos en las puntas redondeadas.
      const k = 0.12;
      const a = (capA * 1.1) / L;
      const b = 1 - (capB * 1.1) / L;
      if (t < k) return a * (1 - Math.cos((t / k) * (Math.PI / 2)));
      if (t > 1 - k) return 1 - (1 - b) * (1 - Math.cos(((1 - t) / k) * (Math.PI / 2)));
      return a + ((t - k) / (1 - 2 * k)) * (b - a);
    },
    center,
    radius,
    displace,
    color,
    up: new THREE.Vector3(0, 0, 1),
    uvScale: [L / TILE, 2],
  });
}

export function createPalito(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.Mesh {
  const mesh = new THREE.Mesh(buildPalitoGeometry(seed, detail), palitoMaterial());
  mesh.name = 'palito';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
