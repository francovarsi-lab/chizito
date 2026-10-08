import * as THREE from 'three';

/**
 * Superficie tubular cerrada (los extremos colapsan a un polo) con desplazamiento por normal.
 * Base de chizitos y palitos. El eje del tubo lo define `center(u)`; la sección, `radius(u)`.
 */
export interface TubeSpec {
  /** Anillos a lo largo (filas = rows + 1). */
  rows: number;
  /** Segmentos alrededor. */
  cols: number;
  /** Distribución de filas: t uniforme en [0,1] → u. Permite concentrar filas en los extremos. */
  rowParam?: (t: number) => number;
  center: (u: number, out: THREE.Vector3) => THREE.Vector3;
  /** Semiejes de la sección elíptica en u: [a (en N), b (en B)]. Deben ser 0 en u=0 y u=1. */
  radius: (u: number, theta: number) => [number, number];
  /** Desplazamiento (m) a lo largo de la normal, evaluado en la posición base. */
  displace?: (p: THREE.Vector3, n: THREE.Vector3, u: number, theta: number) => number;
  /** Vector "arriba" de referencia para el marco de la sección. */
  up?: THREE.Vector3;
  /** Escala de UV: u (a lo largo) y v (alrededor). */
  uvScale?: [number, number];
  /** Color por vértice opcional (THREE.Color, espacio lineal de trabajo), evaluado tras el desplazamiento. */
  color?: (p: THREE.Vector3, n: THREE.Vector3, u: number, theta: number, disp: number, out: THREE.Color) => void;
}

export function buildTube(spec: TubeSpec): THREE.BufferGeometry {
  const { rows, cols } = spec;
  const rowParam = spec.rowParam ?? ((t: number) => t);
  const up = spec.up ?? new THREE.Vector3(0, 1, 0);
  const nVerts = (rows + 1) * cols;
  const pos = new Float32Array(nVerts * 3);
  const us = new Float32Array(rows + 1);

  const c = new THREE.Vector3();
  const cA = new THREE.Vector3();
  const cB = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const eps = 1e-4;

  for (let i = 0; i <= rows; i++) {
    const u = rowParam(i / rows);
    us[i] = u;
    spec.center(u, c);
    spec.center(Math.max(0, u - eps), cA);
    spec.center(Math.min(1, u + eps), cB);
    T.subVectors(cB, cA).normalize();
    B.crossVectors(T, up).normalize();
    N.crossVectors(B, T).normalize();
    for (let j = 0; j < cols; j++) {
      const th = (j / cols) * Math.PI * 2;
      const [a, b] = spec.radius(u, th);
      const k = (i * cols + j) * 3;
      pos[k] = c.x + N.x * Math.cos(th) * a + B.x * Math.sin(th) * b;
      pos[k + 1] = c.y + N.y * Math.cos(th) * a + B.y * Math.sin(th) * b;
      pos[k + 2] = c.z + N.z * Math.cos(th) * a + B.z * Math.sin(th) * b;
    }
  }

  const index: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const j1 = (j + 1) % cols;
      const a = i * cols + j;
      const b = i * cols + j1;
      const cc = (i + 1) * cols + j;
      const d = (i + 1) * cols + j1;
      index.push(a, b, cc, b, d, cc);
    }
  }

  const welded = new THREE.BufferGeometry();
  welded.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  welded.setIndex(index);
  computeWeldedNormals(welded, rows, cols);

  const disp = new Float32Array(nVerts);
  if (spec.displace) {
    const nrm = welded.getAttribute('normal') as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = i * cols + j;
        p.fromArray(pos, v * 3);
        n.fromBufferAttribute(nrm, v);
        const d = spec.displace(p, n, us[i], (j / cols) * Math.PI * 2);
        disp[v] = d;
        pos[v * 3] += n.x * d;
        pos[v * 3 + 1] += n.y * d;
        pos[v * 3 + 2] += n.z * d;
      }
    }
    welded.getAttribute('position').needsUpdate = true;
    computeWeldedNormals(welded, rows, cols);
  }

  // Expandir: duplicar la columna de costura para tener UVs continuas.
  const [su, sv] = spec.uvScale ?? [1, 1];
  const outCols = cols + 1;
  const nOut = (rows + 1) * outCols;
  const oPos = new Float32Array(nOut * 3);
  const oNrm = new Float32Array(nOut * 3);
  const oUv = new Float32Array(nOut * 2);
  const oCol = spec.color ? new Float32Array(nOut * 3) : null;
  const wN = welded.getAttribute('normal') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const src = i * cols + (j % cols);
      const dst = i * outCols + j;
      oPos.set(pos.subarray(src * 3, src * 3 + 3), dst * 3);
      oNrm[dst * 3] = wN.getX(src);
      oNrm[dst * 3 + 1] = wN.getY(src);
      oNrm[dst * 3 + 2] = wN.getZ(src);
      oUv[dst * 2] = us[i] * su;
      oUv[dst * 2 + 1] = (j / cols) * sv;
      if (oCol && spec.color) {
        p.fromArray(pos, src * 3);
        n.fromBufferAttribute(wN, src);
        spec.color(p, n, us[i], (j / cols) * Math.PI * 2, disp[src], col);
        // `col` ya está en espacio lineal (THREE.Color con hex convierte de sRGB al crearse).
        oCol[dst * 3] = col.r;
        oCol[dst * 3 + 1] = col.g;
        oCol[dst * 3 + 2] = col.b;
      }
    }
  }
  const oIdx: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * outCols + j;
      const b = a + 1;
      const cc = a + outCols;
      const d = cc + 1;
      // Evitar triángulos degenerados en los polos.
      if (i !== 0) oIdx.push(a, b, cc);
      if (i !== rows - 1) oIdx.push(b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(oPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(oNrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(oUv, 2));
  if (oCol) geo.setAttribute('color', new THREE.BufferAttribute(oCol, 3));
  geo.setIndex(oIdx);
  geo.computeTangents();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  welded.dispose();
  return geo;
}

function computeWeldedNormals(geo: THREE.BufferGeometry, rows: number, cols: number): void {
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  // En los polos todos los vértices coinciden: promediar para que la punta quede suave.
  for (const i of [0, rows]) {
    const avg = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    for (let j = 0; j < cols; j++) avg.add(tmp.fromBufferAttribute(nrm, i * cols + j));
    avg.normalize();
    for (let j = 0; j < cols; j++) nrm.setXYZ(i * cols + j, avg.x, avg.y, avg.z);
  }
  nrm.needsUpdate = true;
}
