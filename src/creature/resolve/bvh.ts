import * as THREE from 'three';

/**
 * Aceleración de rayos mínima (árbol de cajas, sin dependencias) para las mallas de las piezas: el chizito tiene ~66 000
 * triángulos y un palito ~36 000, y `Raycaster` los recorre todos en cada rayo (~9 ms). Con el árbol, cada rayo baja a
 * microsegundos y el panel puede recalcular en vivo. Solo cuenta las caras de frente (como un material FrontSide).
 */
interface Node {
  min: [number, number, number];
  max: [number, number, number];
  left: Node | null;
  right: Node | null;
  start: number;
  count: number;
}

interface Tree {
  root: Node;
  pos: ArrayLike<number>;
  tri: Uint32Array; // índices de vértice (3 por triángulo) en el orden del árbol
}

const LEAF = 8;
const cache = new WeakMap<THREE.BufferGeometry, Tree>();

function build(geo: THREE.BufferGeometry): Tree {
  const pos = geo.getAttribute('position').array;
  const index = geo.getIndex();
  const nTri = index ? index.count / 3 : geo.getAttribute('position').count / 3;
  const raw = new Uint32Array(nTri * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = index ? index.getX(i) : i;
  const cen = new Float32Array(nTri * 3);
  for (let t = 0; t < nTri; t++) {
    for (let k = 0; k < 3; k++) cen[t * 3 + k] = (pos[raw[t * 3] * 3 + k] + pos[raw[t * 3 + 1] * 3 + k] + pos[raw[t * 3 + 2] * 3 + k]) / 3;
  }
  const order = new Uint32Array(nTri);
  for (let i = 0; i < nTri; i++) order[i] = i;

  const boxOf = (s: number, c: number): [[number, number, number], [number, number, number]] => {
    const mn: [number, number, number] = [Infinity, Infinity, Infinity];
    const mx: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = s; i < s + c; i++) {
      const t = order[i];
      for (let v = 0; v < 3; v++) {
        const vi = raw[t * 3 + v] * 3;
        for (let k = 0; k < 3; k++) {
          const x = pos[vi + k];
          if (x < mn[k]) mn[k] = x;
          if (x > mx[k]) mx[k] = x;
        }
      }
    }
    return [mn, mx];
  };
  // Quickselect: deja en `k` el elemento que le toca por la coordenada `axis` del centroide.
  const select = (lo: number, hi: number, k: number, axis: number) => {
    const key = (i: number) => cen[order[i] * 3 + axis];
    while (lo < hi) {
      const pivot = key((lo + hi) >> 1);
      let i = lo;
      let j = hi;
      while (i <= j) {
        while (key(i) < pivot) i++;
        while (key(j) > pivot) j--;
        if (i <= j) {
          const tmp = order[i];
          order[i] = order[j];
          order[j] = tmp;
          i++;
          j--;
        }
      }
      if (k <= j) hi = j;
      else if (k >= i) lo = i;
      else return;
    }
  };
  const make = (s: number, c: number): Node => {
    const [mn, mx] = boxOf(s, c);
    if (c <= LEAF) return { min: mn, max: mx, left: null, right: null, start: s, count: c };
    const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    const axis = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
    const half = c >> 1;
    select(s, s + c - 1, s + half, axis);
    return { min: mn, max: mx, left: make(s, half), right: make(s + half, c - half), start: s, count: c };
  };
  const root = make(0, nTri);
  const tri = new Uint32Array(nTri * 3);
  for (let i = 0; i < nTri; i++) for (let v = 0; v < 3; v++) tri[i * 3 + v] = raw[order[i] * 3 + v];
  return { root, pos, tri };
}

function treeOf(geo: THREE.BufferGeometry): Tree {
  let t = cache.get(geo);
  if (!t) {
    t = build(geo);
    cache.set(geo, t);
  }
  return t;
}

export interface Hit {
  distance: number;
  point: THREE.Vector3;
  /** Normal de la cara tocada, en mundo, saliente. */
  normal: THREE.Vector3;
}

const _inv = new THREE.Matrix4();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

/** Primer golpe (cara de frente) de un rayo de mundo contra un conjunto de mallas, dentro de [0, far]. */
export function nearestHit(meshes: THREE.Mesh[], origin: THREE.Vector3, dir: THREE.Vector3, far: number): Hit | null {
  let best: Hit | null = null;
  let bestT = far;
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    const tree = treeOf(m.geometry);
    _inv.copy(m.matrixWorld).invert();
    _o.copy(origin).applyMatrix4(_inv);
    // La dirección se pasa a local SIN normalizar (transformDirection normaliza): así t es el mismo en mundo y en local.
    _d.copy(dir).applyMatrix3(_m3.setFromMatrix4(_inv));
    const hit = traverse(tree, _o, _d, bestT);
    if (hit && hit.t <= bestT) {
      bestT = hit.t;
      const p = origin.clone().addScaledVector(dir, hit.t);
      const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz).transformDirection(m.matrixWorld);
      best = { distance: hit.t, point: p, normal: n };
    }
  }
  return best;
}

function traverse(tree: Tree, o: THREE.Vector3, d: THREE.Vector3, far: number): { t: number; nx: number; ny: number; nz: number } | null {
  const pos = tree.pos;
  const idx = tree.tri;
  let best: { t: number; nx: number; ny: number; nz: number } | null = null;
  let bestT = far;
  const inv = [1 / d.x, 1 / d.y, 1 / d.z];
  const stack: Node[] = [tree.root];
  while (stack.length) {
    const n = stack.pop()!;
    // Caja contra rayo (slabs).
    let t0 = 0;
    let t1 = bestT;
    const O = [o.x, o.y, o.z];
    let miss = false;
    for (let k = 0; k < 3; k++) {
      const a = (n.min[k] - O[k]) * inv[k];
      const b = (n.max[k] - O[k]) * inv[k];
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (lo > t0) t0 = lo;
      if (hi < t1) t1 = hi;
      if (t0 > t1) {
        miss = true;
        break;
      }
    }
    if (miss) continue;
    if (n.left && n.right) {
      stack.push(n.left, n.right);
      continue;
    }
    for (let i = n.start; i < n.start + n.count; i++) {
      const a = idx[i * 3] * 3;
      const b = idx[i * 3 + 1] * 3;
      const c = idx[i * 3 + 2] * 3;
      const e1x = pos[b] - pos[a];
      const e1y = pos[b + 1] - pos[a + 1];
      const e1z = pos[b + 2] - pos[a + 2];
      const e2x = pos[c] - pos[a];
      const e2y = pos[c + 1] - pos[a + 1];
      const e2z = pos[c + 2] - pos[a + 2];
      // Cara de frente: la normal (e1 × e2) mira contra el rayo.
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const ndd = nx * d.x + ny * d.y + nz * d.z;
      if (ndd >= 0) continue;
      // Möller–Trumbore.
      const px = d.y * e2z - d.z * e2y;
      const py = d.z * e2x - d.x * e2z;
      const pz = d.x * e2y - d.y * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-18) continue;
      const id = 1 / det;
      const tx = o.x - pos[a];
      const ty = o.y - pos[a + 1];
      const tz = o.z - pos[a + 2];
      const u = (tx * px + ty * py + tz * pz) * id;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y;
      const qy = tz * e1x - tx * e1z;
      const qz = tx * e1y - ty * e1x;
      const v = (d.x * qx + d.y * qy + d.z * qz) * id;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * id;
      if (t >= 0 && t < bestT) {
        bestT = t;
        const l = Math.hypot(nx, ny, nz) || 1;
        best = { t, nx: nx / l, ny: ny / l, nz: nz / l };
      }
    }
  }
  return best;
}
