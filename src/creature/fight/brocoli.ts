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

/**
 * Brócoli con los modelos reales: la COPA del GLB (la cara del GLB mira a −Z: se gira), un tallo propio del grosor del boceto
 * (tapa el tallo del GLB, que es angosto y trae restos de cara deformes) y una zanahoria real CLAVADA por extremidad.
 */
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
    // Clavada: la punta fina queda ADENTRO del tallo (hasta cerca del eje) y lo que asoma ya es zanahoria gruesa (antes se
    // veía pegada por un hilito). La zanahoria del GLB va a lo largo de Z con la punta fina en +Z.
    const inner = s.arm ? 0.4 : 0.5;
    const c = parts.carrot.clone();
    c.rotation.x = Math.PI / 2;
    c.scale.set(L * 0.8, L * 0.8, L + inner);
    c.position.y = (L - inner) / 2;
    holder.add(c);
    root.add(holder);
  }
  root.add(stalk());
  const body = parts.body.clone();
  const h = BROCCOLI_TOP - STALK_Y0;
  body.rotation.y = Math.PI;
  body.scale.setScalar(h);
  body.position.y = STALK_Y0 + h / 2;
  // Del GLB sólo queda la COPA: todo lo que está debajo de `CROWN_CUT` (su tallo y sus restos de cara) se recorta con un plano.
  // El plano está en el marco del brócoli; `syncCrownClip` lo lleva al mundo cada cuadro. Material propio por brócoli (y más
  // oscuro con más nivel).
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CROWN_CUT);
  root.userData.crownClip = { local: clip.clone(), world: clip };
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    if (level > 1) mat.color.multiplyScalar(1 - (level - 1) * 0.12);
    mat.clippingPlanes = [clip];
    m.material = mat;
    m.userData.shared = false;
    m.userData.ownGeometry = false;
  });
  root.add(body);
  addFace(root, level);
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
/** Radio del tallo a cada altura (unidades del boceto): parejo abajo y abierto arriba, donde se reparte en las ramas de la copa. */
const STALK_TOP = 2.98;
/** Altura (boceto) desde la que se ve la copa del GLB: más abajo manda el tallo propio. */
const CROWN_CUT = 2.66;
function stalkRadius(y: number): number {
  // Recto en toda la zona de la cara (y 1,6–2,5): la boca que se abre no se hunde en el tallo.
  return 0.37 - 0.03 * THREE.MathUtils.smoothstep(y, 1.42, 1.6) + 0.2 * Math.pow(THREE.MathUtils.smoothstep(y, 2.5, STALK_TOP), 1.6);
}

/** Punto de la superficie del tallo (frente, +Z) para la coordenada x del boceto, a la altura y, separado `dz` hacia afuera. */
function onStalk(x: number, y: number, dz = 0): THREE.Vector3 {
  const R = stalkRadius(y);
  const a = Math.asin(THREE.MathUtils.clamp(x / R, -1, 1));
  return new THREE.Vector3(Math.sin(a) * (R + dz), y, Math.cos(a) * (R + dz));
}

function stalk(): THREE.Mesh {
  const y0 = STALK_Y0;
  const y1 = STALK_TOP;
  const geo = new THREE.CylinderGeometry(1, 1, y1 - y0, 72, 48, false);
  geo.translate(0, (y0 + y1) / 2, 0);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  const fiber = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const r = Math.hypot(v.x, v.z);
    const R = stalkRadius(v.y);
    if (r < 0.5) {
      pos.setXYZ(i, v.x * R, v.y, v.z * R); // tapas
      continue;
    }
    const f = Math.pow(0.5 + 0.5 * Math.sin(a * 9 + noise.noise(a, v.y * 1.5, 3) * 1.6), 4);
    // Las fibras se marcan más arriba, donde el tallo se abre en ramas. Sin bultos en la cara (y 1,5–2,7, de frente: la boca abierta llega hasta abajo).
    const front = THREE.MathUtils.smoothstep(Math.cos(a - Math.PI / 2), 0.3, 0.8) * (v.y > 1.5 && v.y < 2.7 ? 1 : 0);
    const bulge = noise.fbm(Math.cos(a), v.y * 1.2, Math.sin(a), 3) * 0.03 * (1 - front);
    const flare = THREE.MathUtils.smoothstep(v.y, 2.5, y1);
    fiber[i] = f;
    const k = R * (1 + f * (0.01 + flare * 0.08) + bulge);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  const base = col('#a6cd74');
  const pale = col('#d6eab3');
  const deep = col('#6a9c44');
  paint(geo, (p, i) => {
    const n = noise.fbm(p.x * 3, p.y * 2, p.z * 3, 3) * 0.5 + 0.5;
    const cut = THREE.MathUtils.smoothstep(1.6 - p.y, 0, 0.18); // la base cortada es más clara
    const top = THREE.MathUtils.smoothstep(p.y, 2.5, STALK_TOP); // arriba, hacia la copa, más verde
    return base.clone().lerp(deep, (1 - n) * 0.25 + top * 0.35).lerp(pale, fiber[i] * 0.35).lerp(col('#eef6da'), cut * 0.6);
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
  // Brillo rojo propio (apenas): en la oscuridad de la vela los ojos se ven encendidos. Da miedo.
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, emissive: '#8a0828', emissiveIntensity: 0.35 }));
}

/** Tira de morrón (ceja): tubo achatado y curvo, rojo brillante. */
function pepperBrow(a: THREE.Vector3, b: THREE.Vector3, thick: number): THREE.Mesh {
  // Arqueada hacia afuera del tallo (la normal en el medio), así queda apoyada y no se hunde en la curva del tallo.
  const mid = a.clone().lerp(b, 0.5);
  const out = new THREE.Vector3(mid.x, 0, mid.z).normalize();
  mid.addScaledVector(out, 0.03).y += 0.02;
  const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 24, thick, 10);
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#c3111f', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }));
}

/**
 * Cara malvada del boceto, sobre el tallo (mirando a +Z), armada para que se lea de lejos y de cerca: dos rodajas de remolacha
 * (ojos) separadas, con pupila y brillo; una tira de morrón por ceja, cada una sobre SU ojo, en V enojada; y una sonrisa
 * malvada en media luna, oscura, con dientes blancos de sésamo arriba y abajo.
 */
function addFace(root: THREE.Group, level: number): void {
  const M = faceMaterials();
  const shared = <T extends THREE.Object3D>(m: T): T => {
    m.userData.shared = true;
    return m;
  };
  const EY = 2.37;
  for (const sx of [-1, 1]) {
    const x = sx * 0.172;
    const eye = shared(new THREE.Mesh(M.eyeGeo, M.eye));
    eye.position.copy(onStalk(x, EY, 0.004));
    eye.rotation.set(0.06, Math.asin(x / stalkRadius(EY)), -sx * 0.18);
    eye.scale.set(1.2, 0.86, 1); // radio 0,16, entrecerrados y caídos hacia afuera: entre los dos queda tallo a la vista
    eye.name = 'ojo';
    root.add(eye);
    // Pupila mirando al centro y abajo (mirada torva) y su brillo.
    const pupil = shared(new THREE.Mesh(M.ball, M.mouth));
    pupil.position.copy(onStalk(x - sx * 0.035, EY - 0.03, 0.03));
    pupil.scale.set(0.02, 0.05, 0.016); // en rendija, como un depredador
    pupil.name = 'pupila';
    root.add(pupil);
    const glint = shared(new THREE.Mesh(M.ball, M.glint));
    glint.position.copy(onStalk(x - sx * 0.055, EY - 0.005, 0.036));
    glint.scale.setScalar(0.02);
    glint.name = 'brillo';
    root.add(glint);
    // Ceja: de afuera-arriba a adentro-abajo, apoyada sobre el borde de arriba del ojo (no se cruzan).
    const brow = pepperBrow(onStalk(sx * 0.3, EY + 0.19, 0.03), onStalk(sx * 0.03, EY + 0.07, 0.035), 0.044 + (level - 1) * 0.005);
    (brow.material as THREE.Material).dispose();
    brow.material = M.brow;
    brow.name = 'ceja';
    root.add(shared(brow));
  }
  // Sonrisa en media luna (las puntas suben) con dientes: se arma plana y se apoya sobre el tallo.
  const W = 0.23;
  const topY = (x: number): number => 2.02 + 0.07 * (x / W) ** 2;
  const botY = (x: number): number => 1.92 + 0.17 * (x / W) ** 2;
  const surface = (tris: [number, number][], dz: number): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap(([x, y]) => onStalk(x, y, dz).toArray()), 3));
    g.computeVertexNormals();
    return g;
  };
  const mouthTris: [number, number][] = [];
  const N = 24;
  for (let i = 0; i < N; i++) {
    const x0 = -W + (2 * W * i) / N;
    const x1 = -W + (2 * W * (i + 1)) / N;
    mouthTris.push([x0, topY(x0)], [x0, botY(x0)], [x1, botY(x1)], [x0, topY(x0)], [x1, botY(x1)], [x1, topY(x1)]);
  }
  M.mouthGeo ??= surface(mouthTris, 0.006);
  const mouth = shared(new THREE.Mesh(M.mouthGeo, M.mouthIn));
  mouth.name = 'boca';
  root.add(mouth);
  // Dientes: fila de arriba colgando (en punta) y fila de abajo más corta, desparejos.
  const teeth: [number, number][] = [];
  const top = 7;
  for (let i = 0; i < top; i++) {
    const xc = -W * 0.78 + (1.56 * W * i) / (top - 1);
    const w = 0.026;
    const h = 0.058 * (1 - 0.35 * Math.abs(xc / W)) * (i % 2 ? 0.8 : 1);
    teeth.push([xc - w, topY(xc - w)], [xc, topY(xc) - h], [xc + w, topY(xc + w)]);
  }
  for (let i = 0; i < top - 2; i++) {
    const xc = -W * 0.55 + (1.1 * W * i) / (top - 3);
    const w = 0.022;
    const h = 0.042 * (i % 2 ? 0.75 : 1);
    teeth.push([xc - w, botY(xc - w)], [xc + w, botY(xc + w)], [xc, botY(xc) + h]);
  }
  M.teethGeo ??= surface(teeth, 0.01);
  const t = shared(new THREE.Mesh(M.teethGeo, M.teeth));
  t.name = 'dientes';
  root.add(t);
}

let faceMats: { eyeGeo: THREE.BufferGeometry; ball: THREE.BufferGeometry; eye: THREE.Material; glint: THREE.Material; brow: THREE.Material; mouth: THREE.Material; seed: THREE.Material; mouthIn: THREE.Material; teeth: THREE.Material; mouthGeo?: THREE.BufferGeometry; teethGeo?: THREE.BufferGeometry } | null = null;
/** Materiales y formas de la cara, compartidos por todos los brócolis (se compilan una vez en el ensayo de la pelea). */
function faceMaterials(): NonNullable<typeof faceMats> {
  if (faceMats) return faceMats;
  const e = beetEye();
  faceMats = {
    eyeGeo: e.geometry,
    ball: new THREE.SphereGeometry(1, 24, 14),
    eye: e.material as THREE.Material,
    glint: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.1), toneMapped: false }),
    brow: new THREE.MeshPhysicalMaterial({ color: '#d0121f', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }),
    mouth: new THREE.MeshPhysicalMaterial({ color: '#3a0812', roughness: 0.35, clearcoat: 0.6 }),
    // Sésamo blanco: sobre la boca oscura se leen como dientes (el negro del boceto no se veía de lejos).
    seed: new THREE.MeshPhysicalMaterial({ color: '#efe3c2', roughness: 0.4, clearcoat: 0.6 }),
    // Boca y dientes: geometría plana apoyada en el tallo, se ven de los dos lados.
    mouthIn: new THREE.MeshPhysicalMaterial({ color: '#2a0610', roughness: 0.4, clearcoat: 0.5, side: THREE.DoubleSide }),
    teeth: new THREE.MeshPhysicalMaterial({ color: '#f4ecd6', roughness: 0.35, clearcoat: 0.7, side: THREE.DoubleSide }),
  };
  return faceMats;
}

/** Lleva el plano que recorta la copa del GLB al mundo (llamar después de mover el brócoli). */
export function syncCrownClip(root: THREE.Object3D): void {
  const c = root.userData.crownClip as { local: THREE.Plane; world: THREE.Plane } | undefined;
  if (c) c.world.copy(c.local).applyMatrix4(root.matrixWorld);
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
  addFace(root, level);
  return root;
}
