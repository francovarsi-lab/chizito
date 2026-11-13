// Rivales de los niveles 2 y 3, hechos por partes (no con un 3D sacado de una foto: así la cara sale limpia y bien armada).
// Medidas reales en metros, en el marco del modelo: x a los costados, y arriba desde el piso, z hacia la cara.
// Las 4 primeras hijas son las extremidades, en el orden de `spec.limbs`: cada una con el origen en su punto de clavado y +Y
// hacia la punta libre (`render.ts` las articula). Las partes de la cara se llaman 'ojo', 'ceja', 'boca', 'dientes'.

import * as THREE from 'three';
import { mulberry32, Simplex3 } from '../../util/noise';
import { EGG, QUINOA, type RivalSpec } from './fighter';

const noise = new Simplex3(19);
const col = (hex: string): THREE.Color => new THREE.Color(hex);

/** Punto de la superficie (elipsoide) del cuerpo, del lado de la cara (+Z), separado `dz` hacia afuera por la normal. */
function onShell(spec: RivalSpec, x: number, y: number, dz = 0): THREE.Vector3 {
  const { rx, ry, rz } = spec.shell;
  const u = x / rx;
  const v = (y - spec.cy) / ry;
  const z = rz * Math.sqrt(Math.max(0, 1 - u * u - v * v));
  const n = new THREE.Vector3(x / (rx * rx), (y - spec.cy) / (ry * ry), z / (rz * rz)).normalize();
  return new THREE.Vector3(x, y, z).addScaledVector(n, dz);
}

/** Normal del cuerpo en un punto de su superficie. */
function shellNormal(spec: RivalSpec, p: THREE.Vector3): THREE.Vector3 {
  const { rx, ry, rz } = spec.shell;
  return new THREE.Vector3(p.x / (rx * rx), (p.y - spec.cy) / (ry * ry), p.z / (rz * rz)).normalize();
}

/** Malla plana (triángulos en x, y del frente) apoyada sobre el cuerpo. */
function onShellGeo(spec: RivalSpec, tris: [number, number][], dz: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap(([x, y]) => onShell(spec, x, y, dz).toArray()), 3));
  g.computeVertexNormals();
  return g;
}

/** Pieza apoyada en el cuerpo, mirando hacia afuera por la normal y girada `roll` sobre ella. */
function stick(spec: RivalSpec, obj: THREE.Object3D, x: number, y: number, dz: number, roll = 0): THREE.Object3D {
  const p = onShell(spec, x, y, dz);
  obj.position.copy(p);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), shellNormal(spec, p));
  obj.rotateZ(roll);
  return obj;
}

/** Media luna de boca (las puntas suben) entre `top(x)` y `bot(x)`, de −w a w. */
function crescent(spec: RivalSpec, w: number, top: (x: number) => number, bot: (x: number) => number, dz: number): THREE.BufferGeometry {
  const tris: [number, number][] = [];
  const N = 24;
  for (let i = 0; i < N; i++) {
    const x0 = -w + (2 * w * i) / N;
    const x1 = -w + (2 * w * (i + 1)) / N;
    tris.push([x0, top(x0)], [x0, bot(x0)], [x1, bot(x1)], [x0, top(x0)], [x1, bot(x1)], [x1, top(x1)]);
  }
  return onShellGeo(spec, tris, dz);
}

/** Tira curva (ceja de morrón) entre dos puntos de la superficie, arqueada hacia afuera. */
function strip(a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3, thick: number, mat: THREE.Material): THREE.Mesh {
  const mid = a.clone().lerp(b, 0.5).addScaledVector(out, thick * 0.8);
  const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, thick, 8);
  return new THREE.Mesh(geo, mat);
}

/** Pinta los vértices de una geometría. */
function paint(geo: THREE.BufferGeometry, f: (p: THREE.Vector3) => THREE.Color): void {
  const pos = geo.getAttribute('position');
  const c = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = f(p);
    c[3 * i] = k.r;
    c[3 * i + 1] = k.g;
    c[3 * i + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

/** Soporte de una extremidad: en su punto de clavado, con +Y hacia la punta libre. */
function holder(from: readonly number[], to: readonly number[]): { g: THREE.Group; L: number } {
  const a = new THREE.Vector3(from[0], from[1], from[2]);
  const dir = new THREE.Vector3(to[0], to[1], to[2]).sub(a);
  const g = new THREE.Group();
  g.position.copy(a);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return { g, L: dir.length() };
}

// ───────────────────────── HUEVO DURO ─────────────────────────

let eggMats: Record<string, THREE.Material> | null = null;
function eggMaterials(): Record<string, THREE.Material> {
  eggMats ??= {
    // Clara cocida: blanca, apenas traslúcida y brillosa, como gelatina firme.
    white: new THREE.MeshPhysicalMaterial({
      color: '#fbfaf5',
      roughness: 0.32,
      clearcoat: 0.75,
      clearcoatRoughness: 0.22,
      sheen: 0.4,
      sheenColor: col('#ffffff'),
      transmission: 0.1,
      thickness: 0.02,
      attenuationColor: col('#fff4dc'),
      attenuationDistance: 0.06,
    }),
    aspa: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: col('#e6f5c8') }),
    olive: new THREE.MeshPhysicalMaterial({ color: '#1c1719', roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    rice: new THREE.MeshPhysicalMaterial({ color: '#fbf7ee', roughness: 0.4, clearcoat: 0.4 }),
    pepper: new THREE.MeshPhysicalMaterial({ color: '#d11a1a', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 }),
    sesame: new THREE.MeshPhysicalMaterial({ color: '#efe2bf', roughness: 0.45, clearcoat: 0.3 }),
    oliveBand: new THREE.MeshPhysicalMaterial({ color: '#1c1719', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, side: THREE.DoubleSide }),
  };
  return eggMats;
}

/** Espárrago: tallo verde y, si es brazo, la punta (yema) en escamas apretadas. Va de −inner a L en +Y. */
function asparagus(L: number, r: number, inner: number, withTip: boolean, seed: number): THREE.Group {
  const M = eggMaterials();
  const g = new THREE.Group();
  const len = L + inner;
  const stalk = new THREE.CylinderGeometry(r * 0.96, r, len, 18, 28, false);
  stalk.translate(0, len / 2 - inner, 0);
  const pos = stalk.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + noise.noise(v.x * 600, v.y * 90 + seed, v.z * 600) * 0.04;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  stalk.computeVertexNormals();
  paint(stalk, (p) => {
    const t = THREE.MathUtils.clamp(p.y / L, 0, 1);
    // Base pálida y fibrosa (el corte), verde intenso al medio, más oscuro hacia la yema.
    const c = col('#c9dc93').lerp(col('#6c9a34'), THREE.MathUtils.smoothstep(t, 0, 0.35)).lerp(col('#4d7426'), THREE.MathUtils.smoothstep(t, 0.6, 1));
    return c.lerp(col('#e2edc0'), (noise.noise(p.x * 900, p.y * 40, p.z * 900) * 0.5 + 0.5) * 0.15);
  });
  g.add(new THREE.Mesh(stalk, M.aspa));
  if (withTip) {
    // La yema: punta en escamas superpuestas, apretadas, verde oscuro con un toque violeta.
    const budGeo = new THREE.SphereGeometry(1, 14, 10);
    budGeo.scale(r * 1.15, r * 2.6, r * 1.15);
    paint(budGeo, (p) => col('#4a6b22').lerp(col('#6b5a6e'), THREE.MathUtils.smoothstep(p.y / (r * 2.6), 0.2, 1) * 0.45));
    const bud = new THREE.Mesh(budGeo, M.aspa);
    bud.position.y = L - r * 1.6;
    g.add(bud);
    const petal = new THREE.ConeGeometry(r * 0.7, r * 2.4, 5, 1);
    petal.scale(1, 1, 0.4);
    paint(petal, () => col('#3f5f1d'));
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39996;
      const h = (i / 12) * r * 2.6;
      const rr = r * 1.05 * Math.sqrt(1 - (h / (r * 2.7)) ** 2);
      const s = new THREE.Mesh(petal, M.aspa);
      s.position.set(Math.cos(a) * rr, L - r * 2.4 + h, Math.sin(a) * rr);
      s.rotation.set(Math.sin(a) * 0.3, -a, -Math.cos(a) * 0.3);
      g.add(s);
    }
  } else {
    // Pata: el extremo de abajo es un corte plano, más claro.
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 18), new THREE.MeshPhysicalMaterial({ color: '#dfe8b8', roughness: 0.6 }));
    cap.rotation.x = Math.PI / 2;
    cap.position.y = L;
    g.add(cap);
  }
  return g;
}

/** HUEVO DURO pelado: clara lisa y gelatinosa, brazos largos de espárrago, patas de tallo y cara de aceituna y morrón. */
export function createEgg(): THREE.Group {
  const spec = EGG;
  const M = eggMaterials();
  const root = new THREE.Group();
  root.name = 'huevo';
  root.userData.jelly = 1.8;
  spec.limbs.forEach((sk, i) => {
    const { g, L } = holder(sk.from, sk.to);
    g.add(asparagus(L, sk.r0, sk.arm ? 0.006 : 0.008, sk.arm, 11 + i * 7));
    root.add(g);
  });
  // Cuerpo: un huevo de verdad (más ancho abajo, más agudo arriba), con unos poquitos hoyuelos de la clara cocida.
  const { rx, ry } = spec.shell;
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = -1 + (2 * i) / 48;
    const r = rx * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.1 * t);
    prof.push(new THREE.Vector2(Math.max(1e-5, r), spec.cy + t * ry));
  }
  // La costura del torno queda atrás (phiStart = π): adelante, en la cara, se veía una línea vertical.
  const body = new THREE.LatheGeometry(prof, 64, Math.PI);
  const pos = body.getAttribute('position');
  const v = new THREE.Vector3();
  const rnd = mulberry32(5);
  const dimples = Array.from({ length: 9 }, () => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize());
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.clone().sub(new THREE.Vector3(0, spec.cy, 0)).normalize();
    let k = 0;
    for (const q of dimples) k += Math.exp(-(1 - d.dot(q)) * 900) * -0.00035;
    k += noise.noise(v.x * 300, v.y * 300, v.z * 300) * 0.00008;
    pos.setXYZ(i, v.x + d.x * k, v.y + d.y * k, v.z + d.z * k);
  }
  body.computeVertexNormals();
  root.add(new THREE.Mesh(body, M.white));

  // Cara (simple pero bien hecha, como el boceto): aceitunas negras con un grano de arroz, cejas de morrón en V y una sonrisa
  // de aceituna con dientes de sésamo.
  const EY = 0.0505;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.0027, 0.0012, 10, 28), M.olive);
    eye.scale.z = 0.55;
    eye.name = 'ojo';
    root.add(stick(spec, eye, sx * 0.0058, EY, 0.0005));
    const rice = new THREE.Mesh(new THREE.CapsuleGeometry(0.0007, 0.0011, 4, 8), M.rice);
    rice.name = 'ojo';
    root.add(stick(spec, rice, sx * 0.0058, EY, 0.0008, sx * 0.6));
    const a = onShell(spec, sx * 0.0115, EY + 0.0055, 0.0007);
    const b = onShell(spec, sx * 0.0022, EY + 0.0028, 0.0007);
    const brow = strip(a, b, shellNormal(spec, a.clone().lerp(b, 0.5)), 0.0011, M.pepper);
    brow.scale.set(1, 1, 1);
    brow.name = 'ceja';
    root.add(brow);
  }
  const W = 0.0095;
  const top = (x: number): number => 0.0405 + 0.003 * (x / W) ** 2;
  const bot = (x: number): number => 0.0373 + 0.0062 * (x / W) ** 2;
  const mouth = new THREE.Mesh(crescent(spec, W, top, bot, 0.0005), M.oliveBand);
  mouth.name = 'boca';
  root.add(mouth);
  const seed = new THREE.SphereGeometry(1, 8, 6);
  seed.scale(0.00045, 0.0008, 0.0003);
  const teeth = new THREE.Group();
  teeth.name = 'dientes';
  for (let i = 0; i < 7; i++) {
    const x = -W * 0.7 + (1.4 * W * i) / 6;
    const s = new THREE.Mesh(seed, M.sesame);
    stick(spec, s, x, (top(x) + bot(x)) / 2 + 0.0003, 0.0009, (i - 3) * 0.12);
    teeth.add(s);
  }
  root.add(teeth);
  root.userData.mouthTop = 0.0405;
  root.userData.browStep = 0.0012;
  root.userData.top = spec.cy + spec.shell.ry;
  return root;
}

// ───────────────────────── MONSTRUO DE QUINOA ─────────────────────────

let quinoaMats: Record<string, THREE.Material> | null = null;
function quinoaMaterials(): Record<string, THREE.Material> {
  quinoaMats ??= {
    // Lo de abajo de los granos (no se ve casi): quinoa cocida apretada.
    core: new THREE.MeshPhysicalMaterial({ color: '#8f7656', roughness: 0.85 }),
    grain: new THREE.MeshPhysicalMaterial({ vertexColors: false, color: '#ffffff', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    olive: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.1 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: '#141012', roughness: 0.25, clearcoat: 0.9 }),
    pepper: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    mouth: new THREE.MeshPhysicalMaterial({ color: '#1e120c', roughness: 0.6, side: THREE.DoubleSide }),
    bean: new THREE.MeshPhysicalMaterial({ color: '#f1eadb', roughness: 0.35, clearcoat: 0.5 }),
  };
  return quinoaMats;
}

const GRAIN_COLORS = [col('#ebdfc3'), col('#e3d3b0'), col('#93412e'), col('#6e2c22'), col('#2b2522')];
const grainColor = (r: number): THREE.Color => GRAIN_COLORS[r < 0.42 ? 0 : r < 0.62 ? 1 : r < 0.76 ? 2 : r < 0.84 ? 3 : 4];

/** Granos de quinoa sobre una superficie: un InstancedMesh de discos chatos, cada uno apoyado según su normal. */
function grains(points: { p: THREE.Vector3; n: THREE.Vector3 }[], seed: number, size = 0.00078): THREE.InstancedMesh {
  const rnd = mulberry32(seed);
  const geo = new THREE.SphereGeometry(1, 6, 4);
  geo.scale(1, 0.62, 1);
  const mesh = new THREE.InstancedMesh(geo, quinoaMaterials().grain, points.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const twist = new THREE.Quaternion();
  points.forEach(({ p, n }, i) => {
    q.setFromUnitVectors(up, n);
    twist.setFromAxisAngle(up, rnd() * Math.PI);
    q.multiply(twist);
    const s = size * (0.8 + rnd() * 0.45);
    m.compose(p.clone().addScaledVector(n, s * 0.3), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, grainColor(rnd()));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}

/** Puntos repartidos parejo sobre un elipsoide (espiral de Fibonacci), salvo la zona de la cara que se deja más rala. */
function ellipsoidPoints(rx: number, ry: number, rz: number, cy: number, n: number, skip?: (p: THREE.Vector3) => boolean): { p: THREE.Vector3; n: THREE.Vector3 }[] {
  const out: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const p = new THREE.Vector3(Math.cos(a) * r * rx, cy + y * ry, Math.sin(a) * r * rz);
    if (skip?.(p)) continue;
    out.push({ p, n: new THREE.Vector3(p.x / (rx * rx), (p.y - cy) / (ry * ry), p.z / (rz * rz)).normalize() });
  }
  return out;
}

/** Extremidad de quinoa: un "chorizo" de granos apretados, de −inner a L en +Y, más gruesa en la punta (puño o pie). */
function quinoaLimb(L: number, r0: number, r1: number, inner: number, fist: boolean, seed: number): THREE.Group {
  const g = new THREE.Group();
  const len = L + inner;
  const core = new THREE.CapsuleGeometry(1, 1, 6, 14);
  // Cápsula de radio variable: se escala por altura.
  const pos = core.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = THREE.MathUtils.clamp((v.y + 1.5) / 3, 0, 1);
    const r = r0 + (r1 - r0) * t;
    pos.setXYZ(i, v.x * r, -inner + t * len, v.z * r);
  }
  core.computeVertexNormals();
  g.add(new THREE.Mesh(core, quinoaMaterials().core));
  const pts: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  const N = Math.round((len * (r0 + r1) * Math.PI) / 0.0000021);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const a = i * 2.39996;
    const y = -inner * 0.3 + t * (len - inner * 0.7);
    const r = r0 + (r1 - r0) * THREE.MathUtils.clamp((y + inner) / len, 0, 1);
    const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    pts.push({ p: new THREE.Vector3(n.x * r, y, n.z * r), n });
  }
  // La punta redondeada (puño / pie).
  for (let i = 0; i < 160; i++) {
    const yy = (i + 0.5) / 160;
    const rr = Math.sqrt(1 - yy * yy);
    const a = i * 2.39996;
    const n = new THREE.Vector3(Math.cos(a) * rr, yy, Math.sin(a) * rr);
    pts.push({ p: new THREE.Vector3(n.x * r1, L + n.y * r1 * 0.9, n.z * r1), n });
  }
  g.add(grains(pts, seed));
  if (fist) {
    // El poder: granos sueltos que flotan y giran alrededor del puño ('aura', la anima `render.ts`).
    const aura = new THREE.Group();
    aura.name = 'aura';
    aura.position.y = L;
    const rnd = mulberry32(seed + 3);
    const loose: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = r1 * (1.7 + rnd() * 0.9);
      loose.push({ p: new THREE.Vector3(Math.cos(a) * rr, (rnd() - 0.4) * r1 * 2.2, Math.sin(a) * rr), n: new THREE.Vector3(rnd() - 0.5, rnd(), rnd() - 0.5).normalize() });
    }
    aura.add(grains(loose, seed + 9, 0.0012));
    g.add(aura);
  }
  return g;
}

/** MONSTRUO DE QUINOA: un bicho grande hecho de miles de granos (blancos, rojos y negros), con ojos de aceituna verde, cejas de
 *  morrón asado y una boca abierta con dientes de poroto. */
export function createQuinoa(): THREE.Group {
  const spec = QUINOA;
  const M = quinoaMaterials();
  const root = new THREE.Group();
  root.name = 'quinoa';
  spec.limbs.forEach((sk, i) => {
    const { g, L } = holder(sk.from, sk.to);
    g.add(quinoaLimb(L, sk.r0, sk.r1, 0.008, sk.arm, 41 + i * 13));
    root.add(g);
  });
  const { rx, ry, rz } = spec.shell;
  const core = new THREE.SphereGeometry(1, 48, 32);
  core.scale(rx * 0.97, ry * 0.97, rz * 0.97);
  core.translate(0, spec.cy, 0);
  root.add(new THREE.Mesh(core, M.core));
  // Los granos (la boca queda limpia: ahí va el hueco oscuro).
  const EY = 0.052;
  const MOUTH = { y: 0.0375, w: 0.0115, h: 0.0062 };
  const inMouth = (p: THREE.Vector3): boolean => p.z > 0 && ((p.x / (MOUTH.w * 1.05)) ** 2 + ((p.y - MOUTH.y) / (MOUTH.h * 1.1)) ** 2 < 1);
  root.add(grains(ellipsoidPoints(rx, ry, rz, spec.cy, 6200, inMouth), 7));

  // Cara: aceitunas verdes en rodaja con la pupila negra, cejas gruesas de morrón asado y boca abierta con dientes de poroto.
  const oliveGeo = new THREE.CylinderGeometry(0.0046, 0.0046, 0.0016, 28, 1);
  oliveGeo.rotateX(Math.PI / 2);
  paint(oliveGeo, (p) => {
    const r = Math.hypot(p.x, p.y) / 0.0046;
    return col('#c9c25a').lerp(col('#8e8a2c'), THREE.MathUtils.smoothstep(r, 0.7, 1));
  });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(oliveGeo, M.olive);
    eye.name = 'ojo';
    root.add(stick(spec, eye, sx * 0.0078, EY, 0.0016));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), M.pupil);
    pupil.scale.set(0.0019, 0.0019, 0.0009);
    pupil.name = 'ojo';
    root.add(stick(spec, pupil, sx * 0.0068, EY - 0.0006, 0.0026));
    const a = onShell(spec, sx * 0.015, EY + 0.0068, 0.0018);
    const b = onShell(spec, sx * 0.0025, EY + 0.0038, 0.0022);
    const brow = strip(a, b, shellNormal(spec, a.clone().lerp(b, 0.5)), 0.0019, M.pepper);
    paint(brow.geometry, (p) => col('#c4361c').lerp(col('#3a140c'), (noise.noise(p.x * 1500, p.y * 1500, p.z * 1500) > 0.45 ? 1 : 0) * 0.85));
    brow.name = 'ceja';
    root.add(brow);
  }
  const tris: [number, number][] = [];
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    tris.push([0, MOUTH.y], [Math.cos(a0) * MOUTH.w, MOUTH.y + Math.sin(a0) * MOUTH.h], [Math.cos(a1) * MOUTH.w, MOUTH.y + Math.sin(a1) * MOUTH.h]);
  }
  const mouth = new THREE.Mesh(onShellGeo(spec, tris, -0.0004), M.mouth);
  mouth.name = 'boca';
  root.add(mouth);
  const bean = new THREE.SphereGeometry(1, 12, 8);
  const teeth = new THREE.Group();
  teeth.name = 'dientes';
  const row = (n: number, y: number, dir: 1 | -1): void => {
    for (let i = 0; i < n; i++) {
      const x = -MOUTH.w * 0.68 + (1.36 * MOUTH.w * i) / (n - 1);
      const t = new THREE.Mesh(bean, M.bean);
      t.scale.set(0.0016, 0.0026, 0.0012);
      stick(spec, t, x, y - dir * 0.0012 * (1 - Math.abs(x / MOUTH.w) * 0.4), 0.0012, (i - (n - 1) / 2) * 0.1);
      teeth.add(t);
    }
  };
  row(5, MOUTH.y + MOUTH.h * 0.62, 1);
  row(4, MOUTH.y - MOUTH.h * 0.62, -1);
  root.add(teeth);
  root.userData.mouthTop = MOUTH.y + MOUTH.h;
  root.userData.browStep = 0.0015;
  root.userData.top = spec.cy + spec.shell.ry;
  return root;
}
