import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { HeightField, Profiles } from './HeightField';

/**
 * Papita frita procedural: disco fino ondulado con borde irregular y canto redondeado.
 * El disco queda en el plano XZ, centrado en el origen (la normalización para "clavar de canto"
 * la hace la definición de pieza).
 */

const TILE = 0.02;
export const PAPITA_RADIUS = 0.025;
export const PAPITA_THICKNESS = 0.0015;
let sharedMaterial: THREE.MeshPhysicalMaterial | null = null;

export function papitaMaterial(): THREE.MeshPhysicalMaterial {
  if (sharedMaterial) return sharedMaterial;
  const size = 512;
  const hf = new HeightField(size);
  const rnd = mulberry32(91);
  hf.addPeriodicNoise(6, 0.3, 17, 3);
  // Burbujas de fritura.
  for (let i = 0; i < 160; i++) hf.stamp(rnd() * size, rnd() * size, 8 + rnd() * 26, 0.6 + rnd() * 0.6, Profiles.blister);
  for (let i = 0; i < 900; i++) hf.stamp(rnd() * size, rnd() * size, 1.5 + rnd() * 3, 0.15, Profiles.grain);
  hf.normalize();
  const normal = hf.toNormalMap(5);
  const rough = hf.toGrayTexture((h) => 0.5 - (h - 0.5) * 0.3);
  const color = hf.toColorTexture((h, _x, _y, rgb) => {
    const k = 0.92 + h * 0.12;
    rgb[0] = k;
    rgb[1] = k * (0.97 + h * 0.04);
    rgb[2] = k * (0.9 + h * 0.1);
  });
  sharedMaterial = new THREE.MeshPhysicalMaterial({
    name: 'papita',
    vertexColors: true,
    map: color,
    normalMap: normal,
    roughnessMap: rough,
    roughness: 1,
    sheen: 0.4,
    sheenColor: new THREE.Color('#ffe08a'),
    sheenRoughness: 0.5,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
    side: THREE.FrontSide,
  });
  return sharedMaterial;
}

/** Parámetros de forma de una papita: cada mordisco (semilla) le saca un pedazo irregular del borde. */
export interface PapitaParams {
  bites?: number[];
}

/**
 * Estilo de un "chip" (papita, nacho…): contorno, tamaño, ondulación y colores. El generador es el
 * mismo para todos; cada snack sólo define su estilo.
 */
export interface ChipStyle {
  radius: number;
  thickness: number;
  /** Contorno relativo (1 = radio) en función del ángulo, con ruido disponible para irregularidad. */
  contour: (th: number, noise: Simplex3, ox: number, rnd: () => number) => number;
  wave: [number, number];
  colors: { base: string; light: string; toast: string };
  /** Cuánto se tuesta el borde y cuántas manchas tiene (0..1). */
  edgeToast: number;
  spots: number;
  /** Giro fijo del contorno (rad); si falta, cada pieza sale girada al azar. */
  rotation?: number;
}

export const PAPITA_STYLE: ChipStyle = {
  radius: PAPITA_RADIUS,
  thickness: PAPITA_THICKNESS,
  contour: (th, noise, ox) =>
    1 +
    0.07 * noise.noise(Math.cos(th) * 1.3 + ox, Math.sin(th) * 1.3, 0.5) +
    0.025 * noise.noise(Math.cos(th) * 5 + ox, Math.sin(th) * 5, 2.5) +
    0.12 * (Math.cos(th) ** 2 - 0.5), // levemente ovalada
  wave: [0.0016, 0.0012],
  colors: { base: '#f3d06c', light: '#f9e6a6', toast: '#cf9440' },
  edgeToast: 0.6,
  spots: 0.45,
};

export function buildPapitaGeometry(seed: number, detail: 'hero' | 'prop' = 'hero', params: PapitaParams = {}): THREE.BufferGeometry {
  return buildChipGeometry(seed, detail, params, PAPITA_STYLE);
}

export function buildChipGeometry(seed: number, detail: 'hero' | 'prop', params: PapitaParams, style: ChipStyle): THREE.BufferGeometry {
  const rnd = mulberry32(seed * 6151 + 17);
  const noise = new Simplex3(seed + 333);
  const R = style.radius * (0.88 + rnd() * 0.24);
  const T = style.thickness;
  const ox = rnd() * 100;
  const waveAmp = style.wave[0] + rnd() * style.wave[1];
  const cup = (rnd() - 0.3) * 0.004;
  const randomRot = rnd() * Math.PI * 2;
  const rot = style.rotation ?? randomRot;

  // Mordiscos ("partir con los dedos"): muescas irregulares del borde, deterministas por semilla.
  const bites = (params.bites ?? []).map((b) => {
    const r = mulberry32(b * 7907 + 3);
    return { a: r() * Math.PI * 2, w: 0.35 + r() * 0.45, d: 0.16 + r() * 0.2, ph: r() * 100 };
  });
  const biteAt = (th: number) => {
    let k = 0;
    for (const b of bites) {
      let da = Math.abs(th - b.a) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      const x = da / b.w;
      if (x >= 1) continue;
      const jag = 1 + 0.18 * noise.noise(Math.cos(th) * 8 + b.ph, Math.sin(th) * 8, 4.2);
      k = Math.max(k, b.d * Math.pow(1 - x * x, 0.7) * jag);
    }
    return Math.min(0.6, k);
  };
  const edgeR = (th: number) => R * (1 - biteAt(th)) * style.contour(th + rot, noise, ox, rnd);
  const height = (x: number, z: number) => {
    const r2 = (x * x + z * z) / (R * R);
    return waveAmp * noise.fbm(x * 30 + ox, z * 30, 1.3, 2) + cup * r2 + 0.00025 * noise.noise(x * 120, z * 120, 9);
  };

  const nr = detail === 'hero' ? 34 : 8; // anillos por cara
  const nRim = detail === 'hero' ? 8 : 3; // filas del canto
  const cols = detail === 'hero' ? 128 : 24;
  const rows = nr * 2 + nRim; // filas totales (poles en 0 y rows)
  const pos = new Float32Array((rows + 1) * cols * 3);
  const shade = new Float32Array((rows + 1) * cols); // 0 centro → 1 borde (para tostado)

  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < cols; j++) {
      const th = (j / cols) * Math.PI * 2;
      const Re = edgeR(th);
      let f: number;
      let side: number; // +1 cara superior, -1 inferior; en el canto, interpolación
      let rimOut = 0;
      if (i <= nr) {
        f = i / nr;
        side = 1;
      } else if (i >= nr + nRim) {
        f = (rows - i) / nr;
        side = -1;
      } else {
        const a = ((i - nr) / nRim) * Math.PI; // 0 → arriba, π → abajo
        f = 1;
        side = Math.cos(a);
        rimOut = Math.sin(a);
      }
      // El borde es más fino que el centro; el canto es un semicírculo de radio te.
      const te = T * 0.5 * 0.7;
      const faceR = (Re - te) * Math.sin((f * Math.PI) / 2);
      const rr = rimOut > 0 || (i > nr && i < nr + nRim) ? Re - te + te * rimOut : faceR;
      const halfT = i > nr && i < nr + nRim ? te * side : side * T * 0.5 * (1 - 0.3 * f * f);
      const x = Math.cos(th) * rr;
      const z = Math.sin(th) * rr;
      const y = height(x, z) + halfT;
      const k = (i * cols + j) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      shade[i * cols + j] = f;
    }
  }

  const idx: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const j1 = (j + 1) % cols;
      const a = i * cols + j;
      const b = i * cols + j1;
      const c = (i + 1) * cols + j;
      const d = (i + 1) * cols + j1;
      if (i !== 0) idx.push(a, b, c);
      if (i !== rows - 1) idx.push(b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (const i of [0, rows]) {
    const avg = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let j = 0; j < cols; j++) avg.add(t.fromBufferAttribute(nrm, i * cols + j));
    avg.normalize();
    for (let j = 0; j < cols; j++) nrm.setXYZ(i * cols + j, avg.x, avg.y, avg.z);
  }

  // UV planar (sin costuras) y color por vértice.
  const n = (rows + 1) * cols;
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  const golden = new THREE.Color(style.colors.base);
  const pale = new THREE.Color(style.colors.light);
  const toast = new THREE.Color(style.colors.toast);
  const c = new THREE.Color();
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3];
    const z = pos[v * 3 + 2];
    uv[v * 2] = x / TILE + 0.5;
    uv[v * 2 + 1] = z / TILE + 0.5;
    const f = shade[v];
    const t = noise.fbm(x * 80 + 4, z * 80, 7, 3) * 0.5 + 0.5;
    c.copy(golden).lerp(pale, THREE.MathUtils.smoothstep(t, 0.4, 0.85) * 0.7);
    const edge = THREE.MathUtils.smoothstep(f + noise.noise(x * 150, z * 150, 3) * 0.12, 0.82, 1.02);
    c.lerp(toast, edge * style.edgeToast);
    const spot = THREE.MathUtils.smoothstep(noise.noise(x * 220 + 9, z * 220, 5), 0.72, 0.95);
    c.lerp(toast, spot * style.spots);
    // `c` ya está en espacio lineal.
    col[v * 3] = c.r;
    col[v * 3 + 1] = c.g;
    col[v * 3 + 2] = c.b;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeTangents();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export function createPapita(seed: number, detail: 'hero' | 'prop' = 'hero', params: PapitaParams = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(buildPapitaGeometry(seed, detail, params), papitaMaterial());
  mesh.name = 'papita';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
