import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { HeightField, Profiles } from './HeightField';
import { buildTube } from './tube';

/**
 * Chizito procedural: cilindro curvado y aplastado, deformado con ruido en varias escalas
 * (ondulación grande + grumos medianos + rugosidad fina) y texturas porosas generadas por código.
 * El eje largo queda en X, centrado en el origen (convención de la pieza raíz).
 */

export type Detail = 'hero' | 'prop';

/** Tamaño del tile de textura fina en metros (la textura cubre 1,4 cm × 1,4 cm). */
const TILE = 0.014;

let sharedMaps: { normal: THREE.Texture; rough: THREE.Texture; color: THREE.Texture } | null = null;

function chizitoMaps() {
  if (sharedMaps) return sharedMaps;
  const size = 1024;
  const hf = new HeightField(size);
  const rnd = mulberry32(7);
  // Grano general de la superficie inflada.
  hf.addPeriodicNoise(10, 0.35, 11, 4);
  // Ampollas (burbujas de la masa inflada), alargadas apenas en el sentido del eje.
  for (let i = 0; i < 420; i++) {
    hf.stamp(rnd() * size, rnd() * size, 22 + rnd() * 70, 0.6 + rnd() * 0.5, Profiles.blister, 1 + rnd() * 0.6);
  }
  // Poros grandes y chicos.
  for (let i = 0; i < 520; i++) {
    const r = 6 + Math.pow(rnd(), 2.4) * 28;
    hf.stamp(rnd() * size, rnd() * size, r, 0.6 * (0.5 + rnd()) * Math.sqrt(r / 20), Profiles.crater, 1 + rnd() * 0.8);
  }
  for (let i = 0; i < 5000; i++) {
    const r = 2 + rnd() * 5;
    hf.stamp(rnd() * size, rnd() * size, r, 0.25 + rnd() * 0.25, Profiles.crater);
  }
  // Polvo de queso: granitos muy finos.
  for (let i = 0; i < 9000; i++) {
    hf.stamp(rnd() * size, rnd() * size, 1.2 + rnd() * 2.2, 0.12 + rnd() * 0.12, Profiles.grain);
  }
  hf.normalize();

  // Cavidad local (altura relativa al entorno) para oscurecer poros.
  const cavity = new Float32Array(size * size);
  const blur = boxBlur(hf, 9);
  for (let i = 0; i < cavity.length; i++) cavity[i] = hf.data[i] - blur[i];

  const normal = hf.toNormalMap(10);
  const rough = hf.toGrayTexture((h, x, y) => {
    const cv = cavity[y * size + x];
    return 0.84 - cv * 0.9 - (h - 0.5) * 0.08;
  });
  const color = hf.toColorTexture((_h, x, y, rgb) => {
    const cv = cavity[y * size + x];
    // Multiplicador del color de vértice: poros más oscuros y rojizos, crestas con polvo más claro.
    const k = THREE.MathUtils.clamp(1 + cv * 2.6, 0.62, 1.08);
    rgb[0] = 0.98 * k + Math.max(0, cv) * 0.2;
    rgb[1] = 0.98 * k + Math.max(0, cv) * 0.22;
    rgb[2] = 0.97 * k + Math.max(0, cv) * 0.2;
  });
  sharedMaps = { normal, rough, color };
  return sharedMaps;
}

function boxBlur(hf: HeightField, r: number): Float32Array {
  const s = hf.size;
  const tmp = new Float32Array(s * s);
  const out = new Float32Array(s * s);
  const w = 2 * r + 1;
  for (let y = 0; y < s; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += hf.get(k, y);
    for (let x = 0; x < s; x++) {
      tmp[y * s + x] = acc / w;
      acc += hf.get(x + r + 1, y) - hf.get(x - r, y);
    }
  }
  const g = (x: number, y: number) => tmp[(((y % s) + s) % s) * s + x];
  for (let x = 0; x < s; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += g(x, k);
    for (let y = 0; y < s; y++) {
      out[y * s + x] = acc / w;
      acc += g(x, y + r + 1) - g(x, y - r);
    }
  }
  return out;
}

let sharedMaterial: THREE.MeshPhysicalMaterial | null = null;

export function chizitoMaterial(): THREE.MeshPhysicalMaterial {
  if (sharedMaterial) return sharedMaterial;
  const maps = chizitoMaps();
  sharedMaterial = new THREE.MeshPhysicalMaterial({
    name: 'chizito',
    vertexColors: true,
    map: maps.color,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: maps.rough,
    roughness: 1,
    metalness: 0,
    // Brillo polvoriento del recubrimiento de queso.
    sheen: 0.7,
    sheenColor: new THREE.Color('#fffbe6'),
    sheenRoughness: 0.7,
    specularIntensity: 0.5,
    envMapIntensity: 1,
  });
  return sharedMaterial;
}

export interface ChizitoShape {
  length: number;
  thickness: number;
}

export function buildChizitoGeometry(seed: number, detail: Detail = 'hero'): { geometry: THREE.BufferGeometry; shape: ChizitoShape } {
  const rnd = mulberry32(seed * 7919 + 13);
  const noise = new Simplex3(seed + 101);
  // Chizito inflado tipo "maní": gordito, puntas redondas y romas, apenas curvado (ver referencia).
  const L = 0.046 + rnd() * 0.01; // 4,6 a 5,6 cm
  const D = 0.0185 + rnd() * 0.0035; // 1,85 a 2,2 cm de grosor
  const flat = 0.88 + rnd() * 0.1; // casi redondo
  const bend = (0.04 + rnd() * 0.08) * L;
  const sWiggle = (rnd() - 0.5) * 0.18 * L;
  const twist = (rnd() - 0.5) * 0.6;
  const endA = 0.26 + rnd() * 0.1; // puntas romas
  const endB = 0.26 + rnd() * 0.1;
  const thickPhase = rnd() * 10;
  const waist = 0.04 + rnd() * 0.08; // cinturita de maní
  const waistAt = 0.42 + rnd() * 0.16;
  const bulb = (rnd() - 0.5) * 0.16; // una punta un poco más gorda que la otra

  const center = (u: number, out: THREE.Vector3) => {
    const x = (u - 0.5) * L;
    const s = 2 * u - 1;
    out.set(x, bend * (1 - s * s) - bend * 0.5, sWiggle * Math.sin(Math.PI * s) * 0.5);
    return out;
  };

  const radius = (u: number, th: number): [number, number] => {
    const e = u < 0.5 ? endA : endB;
    const prof = Math.pow(Math.max(0, Math.sin(Math.PI * u)), e);
    const along =
      1 +
      0.07 * noise.noise(u * 3.2 + thickPhase, 0.3, 0) +
      bulb * (u - 0.5) -
      waist * Math.exp(-Math.pow((u - waistAt) / 0.14, 2));
    const R = (D / 2) * prof * along;
    const tw = th + twist * (u - 0.5);
    const ell = 1 + 0.04 * Math.cos(2 * tw);
    return [R * flat * ell, R / ell];
  };

  // Superficie inflada: ondulación grande + grumos redondos ("burbujas" de la masa) + rugosidad fina.
  const displace = (p: THREE.Vector3, _n: THREE.Vector3, u: number) => {
    const fade = Math.min(1, Math.sin(Math.PI * u) * 3);
    const big = noise.fbm(p.x * 42, p.y * 42, p.z * 42, 2) * 0.0006;
    const lumps = (noise.billow(p.x * 170 + 7, p.y * 170, p.z * 170, 3) - 0.62) * 0.00075;
    const fine = (noise.billow(p.x * 420 + 3, p.y * 420, p.z * 420, 2) - 0.6) * 0.0004;
    return (big + lumps) * fade + fine;
  };

  const tone = new Simplex3(seed + 555);
  const base = new THREE.Color();
  const deep = new THREE.Color('#e3ac3e');
  const butter = new THREE.Color('#f2cf68');
  const cream = new THREE.Color('#fbe7a2');
  const color = (p: THREE.Vector3, _n: THREE.Vector3, _u: number, _th: number, d: number, out: THREE.Color) => {
    const t = tone.fbm(p.x * 120, p.y * 120, p.z * 120, 3) * 0.5 + 0.5;
    base.copy(butter).lerp(cream, THREE.MathUtils.smoothstep(t, 0.45, 0.95) * 0.55);
    const toast = THREE.MathUtils.smoothstep(tone.noise(p.x * 60 + 9, p.y * 60, p.z * 60), 0.5, 0.95);
    base.lerp(deep, toast * 0.35);
    // Grumos con polvo más claro; huecos un poco más dorados.
    const k = THREE.MathUtils.clamp(d / 0.0009, -1, 1);
    if (k > 0) base.lerp(cream, k * 0.3);
    else base.lerp(deep, -k * 0.35);
    out.copy(base);
  };

  const rows = detail === 'hero' ? 260 : 44;
  const cols = detail === 'hero' ? 128 : 22;
  const circumference = Math.PI * D * (1 + flat) * 0.5;
  const geometry = buildTube({
    rows,
    cols,
    rowParam: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
    center,
    radius,
    displace,
    color,
    up: new THREE.Vector3(0, 1, 0),
    uvScale: [L / TILE, Math.max(1, Math.round(circumference / TILE))],
  });
  // Centrar exactamente.
  geometry.computeBoundingBox();
  const c = geometry.boundingBox!.getCenter(new THREE.Vector3());
  geometry.translate(-c.x, -c.y, -c.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, shape: { length: L, thickness: D } };
}

export function createChizito(seed: number, detail: Detail = 'hero'): THREE.Mesh {
  const { geometry } = buildChizitoGeometry(seed, detail);
  const mesh = new THREE.Mesh(geometry, chizitoMaterial());
  mesh.name = 'chizito';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
