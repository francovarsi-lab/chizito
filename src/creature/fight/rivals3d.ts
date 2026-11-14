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
    // Espárrago: piel cerosa, con brillo suave.
    aspa: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.35, sheenColor: col('#e6f5c8') }),
    aspaScale: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.4, side: THREE.DoubleSide }),
    olive: new THREE.MeshPhysicalMaterial({ color: '#1c1719', roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    rice: new THREE.MeshPhysicalMaterial({ color: '#fbf7ee', roughness: 0.4, clearcoat: 0.4 }),
    pepper: new THREE.MeshPhysicalMaterial({ color: '#d11a1a', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 }),
    sesame: new THREE.MeshPhysicalMaterial({ color: '#efe2bf', roughness: 0.45, clearcoat: 0.3 }),
    oliveBand: new THREE.MeshPhysicalMaterial({ color: '#1c1719', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, side: THREE.DoubleSide }),
  };
  return eggMats;
}

/** Escama de espárrago: hoja triangular puntiaguda, curvada para abrazar el tallo (en +Y la punta, cóncava hacia −Z). */
function scaleGeo(w: number, h: number, curl: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.quadraticCurveTo(-w * 0.42, h * 0.55, 0, h);
  shape.quadraticCurveTo(w * 0.42, h * 0.55, w / 2, 0);
  shape.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(shape, 6);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Curvada alrededor del tallo y apenas despegada en la punta.
    pos.setZ(i, -((x * x) / w) * curl + (y / h) ** 2 * w * 0.12);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Espárrago de verdad: tallo apenas afinado hacia la punta, con fibras a lo largo y escamitas triangulares pegadas cada tanto;
 * en el brazo, la yema: una punta cerrada y aguzada de escamas superpuestas en espiral (verde oscuro que vira a violeta). En la
 * pata, el extremo es el corte: claro y fibroso. Va de −inner a L en +Y (la punta libre en L).
 */
function asparagus(L: number, r: number, inner: number, withTip: boolean, seed: number): THREE.Group {
  const M = eggMaterials();
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const tipLen = withTip ? r * 3.4 : 0;
  const len = L + inner - tipLen * 0.85;
  const stalk = new THREE.CylinderGeometry(r, r, len, 24, 40, true);
  stalk.translate(0, len / 2 - inner, 0);
  const pos = stalk.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = THREE.MathUtils.clamp(v.y / L, 0, 1);
    const ang = Math.atan2(v.z, v.x);
    // Se afina hacia la punta; fibras a lo largo (estrías suaves) y ondulación apenas irregular.
    const k = (1 - 0.14 * t) * (1 + 0.022 * Math.sin(ang * 11 + noise.noise(v.y * 120, seed, 0) * 2) + noise.noise(v.x * 500, v.y * 60 + seed, v.z * 500) * 0.025);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  stalk.computeVertexNormals();
  paint(stalk, (p) => {
    const t = THREE.MathUtils.clamp(p.y / L, 0, 1);
    // Base pálida (verde blanquecino), verde vivo al medio, más oscuro y apenas violáceo cerca de la yema.
    const c = withTip
      ? col('#b9cf7c').lerp(col('#5f9a2e'), THREE.MathUtils.smoothstep(t, 0, 0.3)).lerp(col('#3f6e22'), THREE.MathUtils.smoothstep(t, 0.7, 1))
      : col('#5f9a2e').lerp(col('#b9cf7c'), THREE.MathUtils.smoothstep(t, 0.75, 1));
    const fib = noise.noise(Math.atan2(p.z, p.x) * 6, p.y * 25, seed) * 0.5 + 0.5;
    return c.lerp(col('#d7e7a6'), fib * 0.14);
  });
  g.add(new THREE.Mesh(stalk, M.aspa));
  // Escamitas a lo largo del tallo (los "nudos" del espárrago), en espiral.
  const bract = scaleGeo(r * 1.0, r * 1.6, 0.35);
  paint(bract, (p) => col('#6d9a37').lerp(col('#8a6a8c'), THREE.MathUtils.smoothstep(p.y / (r * 1.5), 0.4, 1) * 0.6));
  const nB = Math.max(3, Math.round(L / (r * 4.5)));
  for (let i = 0; i < nB; i++) {
    const t = 0.12 + (0.78 * (i + rnd() * 0.4)) / nB;
    if (withTip && t * L > L - tipLen * 1.2) break;
    const a = i * 2.39996 + rnd();
    const rr = r * (1 - 0.14 * t) * 1.03;
    const s = new THREE.Mesh(bract, M.aspaScale);
    s.position.set(Math.cos(a) * rr, t * L - (withTip ? 0 : 0), Math.sin(a) * rr);
    // Mirando hacia afuera (normal radial), con la punta hacia arriba (hacia la yema) y apenas despegada.
    s.lookAt(s.position.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))));
    s.rotateX(-0.06);
    // En la pata la punta del espárrago quedaría hacia el cuerpo: las escamitas apuntan para ese lado.
    if (!withTip) s.rotateZ(Math.PI);
    s.scale.setScalar(0.8 + rnd() * 0.4);
    g.add(s);
  }
  if (withTip) {
    // La yema: perfil cerrado y aguzado (más ancho que el tallo abajo, abraza su extremo), esculpido en escamas superpuestas
    // como tejas: filas en ladrillo con el borde en V (la punta de cada escama arriba). Verde oscuro en los pliegues y la punta
    // de cada escama violácea, más hacia arriba.
    const y0 = L - tipLen;
    const rBase = r * (1 - 0.14 * Math.max(0, y0 / L)) * 1.01;
    const rT = (u: number): number => rBase * (1 + 0.14 * Math.sin(Math.PI * Math.min(1, u * 1.7))) * Math.pow(Math.max(0, 1 - u), 0.62);
    const prof: THREE.Vector2[] = [];
    const NU = 72;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      prof.push(new THREE.Vector2(Math.max(1e-6, rT(u)), y0 + u * tipLen));
    }
    const bud = new THREE.LatheGeometry(prof, 96);
    const bp = bud.getAttribute('position');
    const ROWS = 6;
    const PER = 5;
    const shingle = (y: number, ang: number): number => {
      const u = THREE.MathUtils.clamp((y - y0) / tipLen, 0, 1);
      const ru = u * ROWS;
      const row = Math.floor(ru);
      const c = (ang / (Math.PI * 2)) * PER + (row % 2) * 0.5;
      const fc = Math.abs(c - Math.floor(c) - 0.5);
      const f = ru + fc * 0.9;
      return f - Math.floor(f);
    };
    const tmp = new THREE.Vector3();
    for (let i = 0; i < bp.count; i++) {
      tmp.fromBufferAttribute(bp, i);
      const rr = Math.hypot(tmp.x, tmp.z);
      if (rr < 1e-6) continue;
      const u = (tmp.y - y0) / tipLen;
      const d = shingle(tmp.y, Math.atan2(tmp.z, tmp.x));
      // Abajo se funde con el tallo (sin escalón); arriba las escamas se aprietan.
      const k = 1 + 0.15 * (Math.pow(d, 0.7) - 0.3) * THREE.MathUtils.smoothstep(u, 0, 0.12) * (1 - u * 0.55);
      bp.setXYZ(i, tmp.x * k, tmp.y, tmp.z * k);
    }
    bud.computeVertexNormals();
    paint(bud, (p) => {
      const u = THREE.MathUtils.clamp((p.y - y0) / tipLen, 0, 1);
      const d = shingle(p.y, Math.atan2(p.z, p.x));
      return col('#24400f').lerp(col('#4a7526'), Math.pow(d, 0.45)).lerp(col('#6f4d7a'), THREE.MathUtils.smoothstep(d, 0.7, 1) * (0.35 + 0.6 * u));
    });
    g.add(new THREE.Mesh(bud, M.aspa));
  } else {
    // Pata: el extremo de abajo es el corte, claro y fibroso, con anillos.
    const capGeo = new THREE.CircleGeometry(r * 0.86, 24);
    paint(capGeo, (p) => col('#e4e8bf').lerp(col('#c2cf8a'), Math.abs(Math.sin((Math.hypot(p.x, p.y) / r) * 9)) * 0.5));
    const cap = new THREE.Mesh(capGeo, M.aspa);
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
  // Clara cocida: tiembla como gelatina al recibir un golpe.
  root.userData.jiggle = { freq: 14, decay: 5, amp: 0.16 };
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
  // Los granos absorben el golpe: se abolla apenas y vuelve.
  root.userData.jiggle = { freq: 6, decay: 9, amp: 0.06 };
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
