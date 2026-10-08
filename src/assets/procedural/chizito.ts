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

  const normal = hf.toNormalMap(7);
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
  sharedMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float nmFade;\nvarying float vNmFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNmFade = nmFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNmFade;')
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vNmFade;'),
      );
  };
  return sharedMaterial;
}

export interface ChizitoShape {
  length: number;
  thickness: number;
}

export function buildChizitoGeometry(seed: number, detail: Detail = 'hero'): { geometry: THREE.BufferGeometry; shape: ChizitoShape } {
  const rnd = mulberry32(seed * 7919 + 13);
  const noise = new Simplex3(seed + 101);
  // Chizito tipo cápsula (según el modelo 3D de referencia): casi recto, sección redonda, puntas
  // semiesféricas, arrugas suaves a lo largo de la extrusión y el "ombligo" del corte en una punta.
  const L = 0.044 + rnd() * 0.008; // 4,4 a 5,2 cm
  const D = 0.019 + rnd() * 0.003; // 1,9 a 2,2 cm de grosor (largo/grosor ≈ 2,2)
  const flat = 0.9 + rnd() * 0.08; // apenas ovalado
  const bend = (0.01 + rnd() * 0.04) * L;
  const sWiggle = (rnd() - 0.5) * 0.08 * L;
  const capA = 0.92 + rnd() * 0.12; // radio de cada casquete relativo al radio del cuerpo
  const capB = 0.92 + rnd() * 0.12;
  const thickPhase = rnd() * 10;
  const bulb = (rnd() - 0.5) * 0.08; // una punta apenas más gorda que la otra
  const navelEnd = rnd() < 0.5 ? 0 : 1;

  const center = (u: number, out: THREE.Vector3) => {
    const x = (u - 0.5) * L;
    const s = 2 * u - 1;
    out.set(x, bend * (1 - s * s) - bend * 0.5, sWiggle * Math.sin(Math.PI * s) * 0.5);
    return out;
  };

  const radius = (u: number, th: number): [number, number] => {
    const R0 = D / 2;
    const sv = u * L;
    const fromEnd = Math.min(sv, L - sv);
    const cap = R0 * (u < 0.5 ? capA : capB);
    const t = Math.min(1, fromEnd / cap);
    const prof = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    const along = 1 + 0.04 * noise.noise(u * 2.6 + thickPhase, 0.3, 0) + bulb * (u - 0.5);
    const R = R0 * prof * along;
    const ell = 1 + 0.03 * Math.cos(2 * th + u * 1.5);
    return [R * flat * ell, R / ell];
  };

  const displace = (p: THREE.Vector3, _n: THREE.Vector3, u: number, th: number) => {
    const sv = u * L;
    const fromEnd = Math.min(sv, L - sv);
    // Arrugas longitudinales: varían rápido alrededor y lento a lo largo (pliegues de la extrusión).
    const ca = Math.cos(th) * 1.6;
    const sa = Math.sin(th) * 1.6;
    const fold = 1 - Math.abs(noise.noise(p.x * 55 + 11, ca, sa));
    const fold2 = 1 - Math.abs(noise.noise(p.x * 110 + 3, ca * 2.2, sa * 2.2));
    const wrinkles = (fold - 0.6) * 0.001 + (fold2 - 0.6) * 0.00045;
    // Bultitos suaves y ondulación general.
    const lumps = (noise.billow(p.x * 130 + 7, p.y * 130, p.z * 130, 2) - 0.6) * 0.00045;
    const big = noise.fbm(p.x * 35, p.y * 35, p.z * 35, 2) * 0.00045;
    // "Ombligo" del corte de la extrusión en las puntas (más marcado en una).
    const navelAt = (e: number, k: number) =>
      k * (-0.0009 * Math.exp(-Math.pow(e / 0.0022, 2)) + 0.00025 * Math.exp(-Math.pow((e - 0.0035) / 0.0015, 2)));
    const navel = navelAt(sv, navelEnd === 0 ? 1 : 0.6) + navelAt(L - sv, navelEnd === 1 ? 1 : 0.6);
    // Las arrugas siguen el ángulo alrededor del eje: en el polo convergerían en una "estrella".
    const capFade = THREE.MathUtils.smoothstep(fromEnd, 0.0015, 0.0075);
    return wrinkles * capFade + lumps * (0.4 + 0.6 * capFade) + big + navel;
  };

  const tone = new Simplex3(seed + 555);
  const base = new THREE.Color();
  const deep = new THREE.Color('#e8ad2c');
  const yellow = new THREE.Color('#f6cb43');
  const light = new THREE.Color('#fbe189');
  const color = (p: THREE.Vector3, _n: THREE.Vector3, _u: number, _th: number, d: number, out: THREE.Color) => {
    const t = tone.fbm(p.x * 110, p.y * 110, p.z * 110, 3) * 0.5 + 0.5;
    base.copy(yellow).lerp(light, THREE.MathUtils.smoothstep(t, 0.5, 0.95) * 0.45);
    const toast = THREE.MathUtils.smoothstep(tone.noise(p.x * 55 + 9, p.y * 55, p.z * 55), 0.5, 0.95);
    base.lerp(deep, toast * 0.3);
    // Crestas de las arrugas más claras; pliegues un poco más dorados.
    const k = THREE.MathUtils.clamp(d / 0.0005, -1, 1);
    if (k > 0) base.lerp(light, k * 0.3);
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
  // En los polos las UV convergen y el normal map dibuja una "estrella": se desvanece cerca de las puntas.
  const pos = geometry.getAttribute('position');
  const bb = geometry.boundingBox!;
  const fade = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    fade[i] = THREE.MathUtils.smoothstep(Math.min(x - bb.min.x, bb.max.x - x), 0.0012, 0.0055);
  }
  geometry.setAttribute('nmFade', new THREE.BufferAttribute(fade, 1));
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
