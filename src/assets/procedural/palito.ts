import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { HeightField, Profiles } from './HeightField';
import { buildTube } from './tube';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  // Poros chiquitos (sin vetas: la referencia es lisa con hoyitos).
  for (let i = 0; i < 260; i++) hf.stamp(rnd() * size, rnd() * size, 2 + rnd() * 5, 0.35, Profiles.crater, 1 + rnd() * 1.5);
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
    // Brillo leve del horneado (glaseado de la masa).
    clearcoat: 0.2,
    clearcoatRoughness: 0.45,
    sheen: 0.3,
    sheenColor: new THREE.Color('#f3dcb0'),
    sheenRoughness: 0.6,
  });
  return sharedMaterial;
}

/**
 * Palito según el modelo 3D de referencia: cilindro de grosor parejo con una curva leve, puntas
 * CORTADAS planas con el borde redondeado, superficie lisa con hoyitos y rayitas sueltas.
 * Dorado de horneado (marrón claro), con puntas y hoyitos más tostados y granos de sal gruesa.
 */
export const CHIZITO_REF_LENGTH = 0.048;
// Largo ≈ 0,73 × el chizito (pedido del usuario: la mitad del palito de 7 cm).
export const PALITO_LENGTH = 0.035;
export const PALITO_RADIUS = 0.0017; // Ø ≈ 3,4 mm (largo/grosor ≈ 10, como en el modelo de referencia)

interface Pit {
  s: number; // posición a lo largo (m)
  th: number; // ángulo alrededor
  r: number; // radio (m)
  depth: number; // profundidad (m)
  stretch: number; // >1: rayita alargada a lo largo
}

export function buildPalitoGeometry(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.BufferGeometry {
  const rnd = mulberry32(seed * 104729 + 3);
  const noise = new Simplex3(seed + 77);
  const L = PALITO_LENGTH * (0.93 + rnd() * 0.14);
  const R = PALITO_RADIUS * (0.92 + rnd() * 0.16);
  const bevel = R * (0.32 + rnd() * 0.18); // radio del borde redondeado de cada corte
  const dome = 0.00015; // la cara del corte apenas abombada
  const faceA = R - bevel;
  const faceB = R - bevel;
  // Curva leve (arco) en una dirección al azar, a veces con un toque de S.
  const bow = (0.025 + rnd() * 0.05) * L;
  const bowDir = rnd() * Math.PI * 2;
  const sBend = (rnd() - 0.5) * 0.012 * L;
  const ph = rnd() * 10;

  // Hoyitos y rayitas (sólo en el detalle "hero"; en el bowl no se ven).
  const pits: Pit[] = [];
  if (detail === 'hero') {
    const n = 30 + Math.floor(rnd() * 20);
    for (let i = 0; i < n; i++) {
      const scratch = rnd() < 0.3;
      pits.push({
        s: bevel + rnd() * (L - 2 * bevel),
        th: rnd() * Math.PI * 2,
        r: (scratch ? 0.00025 : 0.0003) + rnd() * 0.0005,
        depth: 0.00014 + rnd() * 0.00022,
        stretch: scratch ? 3 + rnd() * 4 : 1 + rnd() * 0.6,
      });
    }
  }

  // Parámetro u recorre el perfil completo: cara del corte A → cuerpo → cara del corte B.
  const P = faceA + L + faceB;
  const sOf = (u: number) => {
    const q = u * P;
    if (q < faceA) return -dome * (1 - q / faceA);
    if (q > faceA + L) return L + dome * ((q - faceA - L) / faceB);
    return q - faceA;
  };
  const rOf = (u: number) => {
    const q = u * P;
    if (q < faceA) return q;
    if (q > faceA + L) return P - q;
    const sv = q - faceA;
    const e = Math.min(sv, L - sv);
    if (e >= bevel) return R;
    return R - bevel + Math.sqrt(Math.max(0, bevel * bevel - (bevel - e) * (bevel - e)));
  };

  const center = (u: number, out: THREE.Vector3) => {
    const sv = THREE.MathUtils.clamp(sOf(u), 0, L);
    const t = sv / L;
    const arc = bow * Math.sin(Math.PI * t) + sBend * Math.sin(2 * Math.PI * t);
    return out.set(Math.cos(bowDir) * arc, sOf(u), Math.sin(bowDir) * arc);
  };
  const radius = (u: number, th: number): [number, number] => {
    const t = THREE.MathUtils.clamp(sOf(u) / L, 0, 1);
    // Grosor casi parejo, sección apenas irregular.
    const along = 1 + 0.035 * noise.noise(t * 3 + ph, 0.4, 0) + 0.015 * noise.noise(t * 11 + ph, 2.1, 0);
    const sect = 1 + 0.025 * noise.noise(Math.cos(th) * 0.9 + t * 4, Math.sin(th) * 0.9, 5);
    const r = rOf(u) * along * sect;
    return [r, r * 0.97];
  };
  const displace = (p: THREE.Vector3, _n: THREE.Vector3, u: number, th: number) => {
    const sv = sOf(u);
    const body = sv > bevel && sv < L - bevel ? 1 : 0;
    let d = noise.noise(p.x * 900, p.y * 500, p.z * 900) * 0.00003;
    if (!body) return d;
    for (const pit of pits) {
      const ds = (sv - pit.s) / pit.stretch;
      if (Math.abs(ds) > pit.r) continue;
      let dth = Math.abs(th - pit.th);
      dth = Math.min(dth, Math.PI * 2 - dth) * R;
      const k = (ds * ds + dth * dth) / (pit.r * pit.r);
      if (k < 1) d -= pit.depth * (1 - k) * (1 - k);
    }
    return d;
  };
  // Dorado de horneado: claramente distinto del amarillo del chizito.
  const golden = new THREE.Color('#d4a15e');
  const light = new THREE.Color('#e6c38c');
  const toasted = new THREE.Color('#9c6230');
  const color = (p: THREE.Vector3, _n: THREE.Vector3, u: number, _th: number, d: number, out: THREE.Color) => {
    const t = noise.fbm(p.x * 260, p.y * 120, p.z * 260, 3) * 0.5 + 0.5;
    out.copy(golden).lerp(light, THREE.MathUtils.smoothstep(t, 0.4, 0.9) * 0.55);
    out.lerp(toasted, THREE.MathUtils.smoothstep(noise.noise(p.y * 80, p.x * 300, 4), 0.55, 0.98) * 0.3);
    // Hoyitos más tostados.
    if (d < -0.00004) out.lerp(toasted, Math.min(1, -d / 0.00018) * 0.7);
    // Puntas tostadas (los últimos ~5 mm), y la cara del corte con miga apenas más clara.
    const sv = THREE.MathUtils.clamp(sOf(u), 0, L);
    const e = Math.min(sv, L - sv);
    out.lerp(toasted, (1 - THREE.MathUtils.smoothstep(e, 0.0005, 0.005)) * 0.55);
    if (rOf(u) < R - bevel * 0.5) out.lerp(light, 0.25);
  };

  return buildTube({
    rows: detail === 'hero' ? 280 : 30,
    cols: detail === 'hero' ? 64 : 10,
    rowParam: (t) => {
      // Más filas en las caras del corte y en los bordes redondeados.
      const edgeA = (faceA + bevel * 1.2) / P;
      const edgeB = 1 - (faceB + bevel * 1.2) / P;
      const k = 0.14;
      if (t < k) return edgeA * (t / k);
      if (t > 1 - k) return 1 - (1 - edgeB) * ((1 - t) / k);
      return edgeA + ((t - k) / (1 - 2 * k)) * (edgeB - edgeA);
    },
    center,
    radius,
    displace,
    color,
    up: new THREE.Vector3(0, 0, 1),
    uvScale: [L / TILE, 1],
  });
}

let saltMaterial: THREE.MeshPhysicalMaterial | null = null;

/** Granos de sal gruesa sobre el cuerpo del palito (una sola malla por palito). */
function saltGrains(geo: THREE.BufferGeometry, seed: number): THREE.Mesh | null {
  const rnd = mulberry32(seed * 31 + 7);
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  geo.computeBoundingBox();
  const minY = geo.boundingBox!.min.y + 0.004;
  const maxY = geo.boundingBox!.max.y - 0.004;
  const count = 7 + Math.floor(rnd() * 8);
  const parts: THREE.BufferGeometry[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let tries = 0; parts.length < count && tries < count * 20; tries++) {
    const i = Math.floor(rnd() * pos.count);
    p.fromBufferAttribute(pos, i);
    if (p.y < minY || p.y > maxY) continue;
    n.fromBufferAttribute(nrm, i);
    const sz = 0.00028 + rnd() * 0.00035;
    const g = new THREE.BoxGeometry(sz, sz * (0.7 + rnd() * 0.5), sz * (0.7 + rnd() * 0.5));
    q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
    m.compose(p.clone().addScaledVector(n, sz * 0.25), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    parts.push(g);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false);
  parts.forEach((g) => g.dispose());
  saltMaterial ??= new THREE.MeshPhysicalMaterial({
    name: 'sal',
    color: '#f7f5ef',
    roughness: 0.25,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    sheen: 0.4,
    sheenColor: new THREE.Color('#ffffff'),
  });
  const mesh = new THREE.Mesh(merged, saltMaterial);
  mesh.name = 'sal';
  return mesh;
}

export function createPalito(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.Object3D {
  const geo = buildPalitoGeometry(seed, detail);
  const mesh = new THREE.Mesh(geo, palitoMaterial());
  mesh.name = 'palito';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const salt = saltGrains(geo, seed);
  if (salt) mesh.add(salt);
  return mesh;
}
