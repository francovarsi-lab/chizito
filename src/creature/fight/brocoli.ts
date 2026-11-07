// Rival fijo "brócoli malvado", procedural, en el MISMO universo que los snacks: vegetales reales de cerca (granos de la copa,
// fibras del tallo, anillos de la zanahoria, rodajas de remolacha húmedas), con la silueta del boceto aprobado.
// Unidades: 1 unidad ≈ 100 px del boceto (× BROCCOLI_K = metros). Suelo en y = 0.
// Las 4 primeras mallas hijas son, en orden: brazo izq., brazo der., pierna izq., pierna der. (`render.ts` las articula):
// cada una con el origen en el punto donde entra al tronco (punta fina adentro) y +Y hacia el extremo libre (parte gruesa).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareGlb } from '../../assets/AssetRegistry';
import { probeFile } from '../../assets/probe';
import { mulberry32, Simplex3 } from '../../util/noise';
import { SKETCH } from './fighter';

/** Modelos 3D de EL BROCOLOCO (generados en Higgsfield desde el arte aprobado): cuerpo (copa + tallo + cara) y una zanahoria real. */
export interface BroccoliParts {
  body: THREE.Object3D;
  carrot: THREE.Object3D;
}

export interface BrocoliOptions {
  /** Nivel del rival: 1, 2, etc. (más nivel = copa más oscura). */
  level?: number;
  /** Si están los GLB, se usan; si no, el procedural. */
  parts?: BroccoliParts | null;
}

/** Unidades del boceto: base del tallo y punta de la copa. */
const STALK_Y0 = 1.42;
export const BROCCOLI_TOP = 3.97;

let partsCache: Promise<BroccoliParts | null> | null = null;
/** Carga (una sola vez) `public/assets/models/brocoli-cuerpo.glb` y `zanahoria.glb`. null si falta alguno. */
export function loadBroccoliParts(): Promise<BroccoliParts | null> {
  partsCache ??= (async () => {
    const base = import.meta.env.BASE_URL;
    const [b, c] = await Promise.all([probeFile(`${base}assets/models/brocoli-cuerpo.glb`, 'glTF'), probeFile(`${base}assets/models/zanahoria.glb`, 'glTF')]);
    if (!b || !c) return null;
    const loader = new GLTFLoader();
    const [gb, gc] = await Promise.all([loader.parseAsync(b, ''), loader.parseAsync(c, '')]);
    for (const g of [gb.scene, gc.scene]) {
      prepareGlb(g);
      g.traverse((o) => (o.userData.shared = true));
    }
    return { body: gb.scene, carrot: gc.scene };
  })().catch((err) => {
    console.warn('[brócoli] no se pudieron leer los GLB, uso el procedural', err);
    return null;
  });
  return partsCache;
}

/** Brócoli con los modelos reales: el cuerpo GLB (la cara del GLB mira a −Z: se gira) y una zanahoria real por extremidad. */
function fromParts(parts: BroccoliParts, level: number): THREE.Group {
  const root = new THREE.Group();
  root.name = 'brocoli';
  root.userData.level = level;
  for (const s of SKETCH) {
    const a = new THREE.Vector3(s.from[0], s.from[1], 0);
    const dir = new THREE.Vector3(s.to[0], s.to[1], 0).sub(a);
    const L = dir.length();
    const holder = new THREE.Group();
    holder.position.copy(a);
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    // La zanahoria del GLB va a lo largo de Z con la punta fina en +Z: la punta queda en el origen (adentro del tallo).
    const c = parts.carrot.clone();
    c.rotation.x = Math.PI / 2;
    c.scale.set(L * 0.8, L * 0.8, L); // el largo del GLB está en Z; X e Y son el grosor
    c.position.y = L / 2;
    holder.add(c);
    root.add(holder);
  }
  const body = parts.body.clone();
  const h = BROCCOLI_TOP - STALK_Y0;
  body.rotation.y = Math.PI;
  body.scale.setScalar(h);
  body.position.y = STALK_Y0 + h / 2;
  if (level > 1) {
    // Más nivel: copa más oscura (material propio, no el compartido).
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.color.multiplyScalar(1 - (level - 1) * 0.12);
      m.material = mat;
      m.userData.shared = false;
      m.userData.ownGeometry = false;
    });
  }
  root.add(body);
  // La cara del modelo 3D salió muy tenue (al pasar la imagen a 3D se perdieron los ojos, las cejas y los dientes): se le pone
  // la del boceto, apoyada sobre la superficie real del tallo (un rayo desde adelante por cada rasgo).
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const meshes: THREE.Object3D[] = [];
  body.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o));
  const zAt = (x: number, y: number): number | null => {
    ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.point.z : null;
  };
  // Centro y ancho del tallo a cada altura, medidos con rayos (el tallo del modelo es más angosto y no está centrado).
  const fit = (y: number): { cx: number; k: number } => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = -0.8; x <= 0.8; x += 0.02) {
      if (zAt(x, y) === null) continue;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return hi > lo ? { cx: (lo + hi) / 2, k: Math.min(1.2, Math.max(0.5, (hi - lo) / 2 / 0.36)) } : { cx: 0, k: 1 };
  };
  addFace(root, zAt, level, mulberry32(31 + level), fit);
  return root;
}

const noise = new Simplex3(7);
const col = (hex: string): THREE.Color => new THREE.Color(hex);

/** Pinta los vértices de una geometría con `f(posición) → color`. */
function paint(geo: THREE.BufferGeometry, f: (p: THREE.Vector3, i: number) => THREE.Color): void {
  const pos = geo.getAttribute('position');
  const c = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = f(p, i);
    c[3 * i] = k.r;
    c[3 * i + 1] = k.g;
    c[3 * i + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

// ── Zanahoria: perfil torneado con anillos, punta fina en el origen, extremo grueso cortado (se ve el corazón más claro). ──
function carrot(length: number, thick: number, thin: number, seed: number): THREE.Mesh {
  const prof: THREE.Vector2[] = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Afinada de golpe en la punta, casi pareja después; el extremo grueso se redondea apenas.
    const r = thin + (thick - thin) * Math.pow(t, 0.55) - (t > 0.94 ? (thick * (t - 0.94)) / 0.06 * 0.25 : 0);
    prof.push(new THREE.Vector2(Math.max(0.004, r), t * length));
  }
  prof.push(new THREE.Vector2(0.0001, length));
  const geo = new THREE.LatheGeometry(prof, 28);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  const grooves = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.y / length;
    const a = Math.atan2(v.z, v.x);
    // Anillos (surcos) irregulares y bultitos: la piel de la zanahoria.
    const ring = Math.pow(Math.abs(Math.sin(v.y * 34 + noise.noise(a * 0.6, v.y * 3, seed) * 2.2)), 10);
    const lump = noise.fbm(Math.cos(a) * 1.5, v.y * 6, Math.sin(a) * 1.5 + seed, 3) * 0.06;
    const top = t > 0.985 ? 0 : 1;
    const k = 1 - 0.09 * ring * top + lump * top;
    grooves[i] = ring * top;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  const orange = col('#e2620f');
  const light = col('#f58b2a');
  const groove = col('#a8420a');
  const core = col('#f7b56a');
  paint(geo, (p, i) => {
    const t = p.y / length;
    if (t > 0.985) {
      // Corte: corazón claro en el centro.
      const rr = Math.hypot(p.x, p.z) / thick;
      return core.clone().lerp(orange, THREE.MathUtils.smoothstep(rr, 0.25, 0.7));
    }
    const n = noise.noise(p.x * 9, p.y * 2, p.z * 9 + seed) * 0.5 + 0.5;
    return orange.clone().lerp(light, n * 0.6).lerp(groove, grooves[i] * 0.7);
  });
  return new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.2, sheenColor: col('#ffd0a0') }),
  );
}

/** Miembro de zanahoria: `from` queda dentro del tronco, `to` es el extremo libre (grueso). */
function limb(from: readonly number[], to: readonly number[], seed: number, legs: boolean): THREE.Mesh {
  const a = new THREE.Vector3(from[0], from[1], 0);
  const b = new THREE.Vector3(to[0], to[1], 0);
  const dir = b.clone().sub(a);
  const mesh = carrot(dir.length(), legs ? 0.13 : 0.12, 0.035, seed);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

// ── Florete: domo granulado (los "pimpollos" del brócoli), oscuro en los huecos y más claro en las puntas. ──
function floret(radius: number, seed: number, palette: { dark: THREE.Color; mid: THREE.Color; tip: THREE.Color; blue: THREE.Color }): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  const h = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Granos: ruido "ridged" de alta frecuencia sobre racimos de media frecuencia.
    const cluster = 1 - Math.abs(noise.noise(v.x * 5.5 + seed, v.y * 5.5, v.z * 5.5));
    const grain = 1 - Math.abs(noise.noise(v.x * 24 + seed, v.y * 24, v.z * 24));
    let d = 0.12 * Math.pow(cluster, 2) + 0.075 * Math.pow(grain, 2);
    // La parte de abajo es el tallito: se achata y se mete.
    if (v.y < -0.2) d *= Math.max(0, 1 + (v.y + 0.2) * 2.5);
    const flat = v.y < 0 ? 0.55 + 0.45 * (1 + v.y) : 1;
    h[i] = d;
    pos.setXYZ(i, v.x * (0.86 + d), v.y * flat * (0.86 + d), v.z * (0.86 + d));
  }
  geo.scale(radius, radius, radius);
  geo.computeVertexNormals();
  paint(geo, (p, i) => {
    const t = THREE.MathUtils.clamp(h[i] / 0.17, 0, 1);
    const c = palette.dark.clone().lerp(palette.mid, t).lerp(palette.tip, Math.pow(t, 3) * 0.8);
    return c.lerp(palette.blue, (noise.noise(p.x * 2, p.y * 2, p.z * 2 + seed) * 0.5 + 0.5) * 0.3);
  });
  return new THREE.Mesh(geo);
}

/** Tallo del brócoli: cilindro apenas irregular, con fibras verticales más claras. */
function stalk(): THREE.Mesh {
  const y0 = 1.42;
  const y1 = 2.8;
  const geo = new THREE.CylinderGeometry(0.335, 0.37, y1 - y0, 72, 36, false);
  geo.translate(0, (y0 + y1) / 2, 0);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  const fiber = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const r = Math.hypot(v.x, v.z);
    if (r < 0.2) continue; // tapas
    const f = Math.pow(0.5 + 0.5 * Math.sin(a * 9 + noise.noise(a, v.y * 1.5, 3) * 1.6), 4);
    const bulge = noise.fbm(Math.cos(a), v.y * 1.2, Math.sin(a), 3) * 0.035;
    fiber[i] = f;
    const k = 1 + f * 0.01 + bulge;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  const base = col('#93c262');
  const pale = col('#c9e3a2');
  const deep = col('#5c9238');
  paint(geo, (p, i) => {
    const n = noise.fbm(p.x * 3, p.y * 2, p.z * 3, 3) * 0.5 + 0.5;
    const cut = THREE.MathUtils.smoothstep(1.6 - p.y, 0, 0.18); // la base cortada es más clara
    return base.clone().lerp(deep, (1 - n) * 0.3).lerp(pale, fiber[i] * 0.3).lerp(col('#e3f0c4'), cut * 0.6);
  });
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: col('#e8f7c8') }));
}

/** Rodaja de remolacha (ojo): anillos concéntricos magenta, húmeda y brillante; el centro oscuro hace de pupila. */
function beetEye(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.135, 0.13, 0.035, 48, 1);
  geo.rotateX(Math.PI / 2);
  const ring = col('#b0235f');
  const light = col('#ee70aa');
  const dark = col('#3a0318');
  paint(geo, (p) => {
    const r = Math.hypot(p.x, p.y) / 0.135;
    if (r < 0.3) return dark.clone().lerp(col('#5c0a2c'), r / 0.3);
    const rings = Math.pow(0.5 + 0.5 * Math.sin(r * 30), 2);
    return ring.clone().lerp(light, rings * 0.8 * (r < 0.93 ? 1 : 0.2));
  });
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }));
}

/** Tira de morrón (ceja): tubo achatado y curvo, rojo brillante. */
function pepperBrow(a: THREE.Vector3, b: THREE.Vector3, thick: number): THREE.Mesh {
  const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.025, 0.02));
  const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 24, thick, 10);
  // Achatada: más ancha que gruesa.
  const pos = geo.getAttribute('position');
  const c = mid.clone();
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setZ(i, c.z + (z - c.z) * 0.55);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#c3111f', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }));
}

/**
 * Cara malvada del boceto sobre el tallo (mirando a +Z): ojos de rodaja de remolacha, cejas de tira de morrón y boca oscura con
 * dientes de sésamo negro. `zAt(x, y)` = dónde está la superficie del tallo en esa altura (o null si no hay).
 */
function addFace(
  root: THREE.Group,
  zAt: (x: number, y: number) => number | null,
  level: number,
  rnd: () => number,
  /** Centro y escala del tallo en cada altura (el boceto es un tallo de radio 0,36 centrado en x = 0). */
  fit: (y: number) => { cx: number; k: number } = () => ({ cx: 0, k: 1 }),
): void {
  const at = (x: number, y: number, dz: number): THREE.Vector3 => {
    const { cx, k } = fit(y);
    const X = cx + x * k;
    return new THREE.Vector3(X, y, (zAt(X, y) ?? Math.sqrt(Math.max(0, (0.36 * k) ** 2 - x * x * k * k))) + dz * k);
  };
  const k0 = fit(2.38).k;
  for (const sx of [-1, 1]) {
    const eye = beetEye();
    const x = sx * 0.17;
    eye.position.copy(at(x, 2.38, -0.004));
    eye.rotation.set(0.08, Math.asin(Math.max(-1, Math.min(1, x / 0.36))), sx * 0.15);
    eye.scale.set(1.3 * k0, 0.82 * 1.3 * k0, k0); // grandes (se leen en 3/4 y de lejos) y entrecerrados
    root.add(eye);
    // Cejas enojadas, inclinadas hacia adentro.
    root.add(pepperBrow(at(sx * 0.31, 2.57, 0.03), at(sx * 0.06, 2.46, 0.025), (0.034 + (level - 1) * 0.006) * k0));
  }
  const km = fit(2.03).k;
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshPhysicalMaterial({ color: '#2a0810', roughness: 0.35, clearcoat: 0.6 }));
  mouth.position.copy(at(0, 2.03, -0.03));
  mouth.scale.set(0.25 * km, 0.095 * km, 0.05 * km);
  root.add(mouth);
  const seedGeo = new THREE.SphereGeometry(1, 12, 8);
  const seedMat = new THREE.MeshPhysicalMaterial({ color: '#16120f', roughness: 0.35, clearcoat: 0.8 });
  for (let i = 0; i < 6; i++) {
    const x = -0.15 + i * 0.06;
    const tooth = new THREE.Mesh(seedGeo, seedMat);
    tooth.position.copy(at(x, 2.08 - Math.abs(x) * 0.15, 0.006));
    tooth.scale.set(0.027 * km, 0.042 * km, 0.016 * km);
    tooth.rotation.z = (rnd() - 0.5) * 0.5;
    root.add(tooth);
  }
}

/** Crea el brócoli malvado. Devuelve un Group (los 4 primeros hijos son las zanahorias, en el orden de `SKETCH`). */
export function createBrocoli(options: BrocoliOptions = {}): THREE.Group {
  const level = options.level ?? 1;
  if (options.parts) return fromParts(options.parts, level);
  const root = new THREE.Group();
  root.name = 'brocoli';
  root.userData.level = level;
  const rnd = mulberry32(31 + level);

  // 1) Extremidades primero (la punta fina queda adentro del tronco).
  SKETCH.forEach((s, i) => root.add(limb(s.from, s.to, i * 3.1, !s.arm)));

  // 2) Tallo.
  root.add(stalk());

  // 3) Copa: floretes en un domo de verdad (con profundidad), unidos al tallo por ramitas.
  const darker = (level - 1) * 0.12;
  const palette = {
    dark: col('#173a10').multiplyScalar(1 - darker),
    mid: col('#2f6a1f').multiplyScalar(1 - darker),
    tip: col('#5f9b39'),
    blue: col('#2a5a48'),
  };
  const crownMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, sheen: 0.6, sheenRoughness: 0.6, sheenColor: col('#9fc98a') });
  const branchMat = new THREE.MeshPhysicalMaterial({ color: '#8cc35c', roughness: 0.55, sheen: 0.3, sheenColor: col('#e8f7c8') });
  const top = new THREE.Vector3(0, 2.7, 0);
  const florets: [number, number, number, number][] = [];
  // Anillo exterior (forma la silueta del boceto) + anillo medio + la cima.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.2;
    florets.push([Math.cos(a) * 0.62, 2.98 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.5, 0.36 + rnd() * 0.08]);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.6;
    florets.push([Math.cos(a) * 0.36, 3.24 + rnd() * 0.06, Math.sin(a) * 0.3, 0.38 + rnd() * 0.06]);
  }
  florets.push([0.02, 3.44, 0, 0.44]);
  florets.push([-0.42, 3.3, 0.05, 0.34], [0.46, 3.28, -0.05, 0.34]);
  florets.forEach(([x, y, z, r], k) => {
    const c = new THREE.Vector3(x, y, z);
    const f = floret(r, k * 1.37, palette);
    f.material = crownMat;
    f.position.copy(c);
    f.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5);
    root.add(f);
    // Ramita del tallo al florete.
    const dir = c.clone().sub(top);
    const len = dir.length();
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, len, 10), branchMat);
    br.position.copy(top).addScaledVector(dir, 0.5);
    br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    root.add(br);
  });

  // 4) Cara (en el tallo, mirando a la cámara).
  addFace(root, (x) => Math.sqrt(Math.max(0, 0.36 * 0.36 - x * x)), level, rnd);
  return root;
}
