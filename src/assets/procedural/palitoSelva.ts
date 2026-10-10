import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { buildTube } from './tube';

/**
 * Palito de la selva: caramelo masticable alargado, de sección rectangular redondeada, MITAD ROSA y
 * MITAD BLANCO a lo largo, con las puntas cortadas y el borde redondeado. En el bowl viene con su
 * envoltorio de papel; al agarrarlo el papel se desenrolla y se va (ver `SelvaWrapper`), y se clava
 * sin papel. Marco 'tip': la punta en el origen, el cuerpo hacia +Y.
 *
 * El envoltorio es una aproximación sin marca (colores de selva y un animalito); se puede afinar con
 * fotos de referencia. Más adelante cada envoltorio traerá un dato curioso de un animal.
 */
export const SELVA_LENGTH = 0.055;
export const SELVA_WIDTH = 0.0105;
export const SELVA_THICK = 0.0078;
const SUPER = 4; // exponente de la superellipse de la sección (rectángulo redondeado)

const PINK = new THREE.Color('#f39bbf');
const PINK_DEEP = new THREE.Color('#e97aa8');
const WHITE = new THREE.Color('#fff4ee');

let candyMat: THREE.MeshPhysicalMaterial | null = null;
function candyMaterial(): THREE.MeshPhysicalMaterial {
  candyMat ??= new THREE.MeshPhysicalMaterial({
    name: 'palito-selva',
    vertexColors: true,
    roughness: 0.5,
    sheen: 0.6,
    sheenColor: new THREE.Color('#fff2f6'),
    sheenRoughness: 0.5,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
  });
  return candyMat;
}

/** Factor de la superellipse: punto de la sección en el ángulo th = (cos·s, sin·s). */
const superS = (th: number) => Math.pow(Math.abs(Math.cos(th)) ** SUPER + Math.abs(Math.sin(th)) ** SUPER, -1 / SUPER);

export interface PalitoSelvaParams {
  /** Con el envoltorio puesto (los del bowl). */
  wrapped?: boolean;
}

export function createPalitoSelva(seed: number, detail: 'hero' | 'prop' = 'hero', params: PalitoSelvaParams = {}): THREE.Object3D {
  const rnd = mulberry32(seed * 5113 + 7);
  const noise = new Simplex3(seed + 91);
  const L = SELVA_LENGTH * (0.96 + rnd() * 0.08);
  const A = SELVA_WIDTH / 2;
  const B = SELVA_THICK / 2;
  const bevel = 0.0022; // borde redondeado del corte
  const bow = (rnd() - 0.5) * 0.0016; // apenas curvado (es blando)
  const geo = buildTube({
    rows: detail === 'hero' ? 140 : 24,
    cols: detail === 'hero' ? 48 : 12,
    // Más filas cerca de los cortes.
    rowParam: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t) * 0.92 - (t - 0.5) * 0.08,
    center: (u, out) => out.set(bow * Math.sin(Math.PI * u), u * L, 0),
    radius: (u, th) => {
      const s = u * L;
      const e = Math.min(s, L - s);
      // Punta cortada casi plana con el borde redondeado (superellipse también a lo largo).
      const cap = e >= bevel ? 1 : Math.pow(Math.max(0, 1 - ((bevel - e) / bevel) ** SUPER), 1 / SUPER);
      if (u <= 0 || u >= 1) return [0, 0];
      const k = superS(th) * cap * (1 + 0.025 * noise.noise(Math.cos(th) * 2, s * 90, 0.3));
      return [A * k, B * k];
    },
    displace: (p) => noise.noise(p.x * 900, p.y * 700, p.z * 900) * 0.000025,
    color: (p, _n, _u, th, _d, out) => {
      // Mitad rosa / mitad blanco a lo largo (la costura se ve apenas fundida y ondulada).
      const seam = Math.sin(th) + 0.08 * noise.noise(p.y * 160, 0.5, 2);
      const k = THREE.MathUtils.smoothstep(seam, -0.06, 0.06);
      out.copy(WHITE).lerp(PINK, k);
      out.lerp(PINK_DEEP, k * THREE.MathUtils.smoothstep(noise.noise(p.x * 400, p.y * 220, p.z * 400), 0.4, 0.95) * 0.35);
    },
    up: new THREE.Vector3(0, 0, 1),
  });
  const mesh = new THREE.Mesh(geo, candyMaterial());
  mesh.name = 'palito-selva';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (!params.wrapped) return mesh;
  const g = new THREE.Group();
  g.add(mesh);
  g.add(new SelvaWrapper(seed, L, detail).mesh);
  return g;
}

// ───────────────────────────── envoltorio ─────────────────────────────

let paperTex: THREE.CanvasTexture | null = null;
function paperTexture(): THREE.CanvasTexture {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d')!;
  // Papel amarillo selva con hojas verdes en los bordes, franja roja y un monito en el medio (sin marca).
  g.fillStyle = '#ffd43b';
  g.fillRect(0, 0, 512, 384);
  const leaf = (x: number, y: number, r: number, a: number, col: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff55';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-r, 0);
    g.lineTo(r, 0);
    g.stroke();
    g.restore();
  };
  const rnd = mulberry32(77);
  for (let i = 0; i < 46; i++) {
    const top = i % 2 === 0;
    leaf(rnd() * 512, top ? rnd() * 70 : 384 - rnd() * 70, 26 + rnd() * 22, rnd() * Math.PI, rnd() < 0.5 ? '#3aa655' : '#5cc46a');
  }
  g.fillStyle = '#e8412f';
  g.fillRect(0, 150, 512, 34);
  g.fillStyle = '#fff6e6';
  for (let x = 12; x < 512; x += 46) g.fillRect(x, 164, 24, 6);
  // Monito: cara marrón con orejas y carita clara.
  const monkey = (x: number, y: number, s: number) => {
    g.fillStyle = '#8a5a3b';
    g.beginPath();
    g.arc(x - 30 * s, y, 13 * s, 0, Math.PI * 2);
    g.arc(x + 30 * s, y, 13 * s, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(x, y, 30 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2d2a9';
    g.beginPath();
    g.ellipse(x, y + 7 * s, 21 * s, 16 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3b2416';
    g.beginPath();
    g.arc(x - 9 * s, y - 5 * s, 4 * s, 0, Math.PI * 2);
    g.arc(x + 9 * s, y - 5 * s, 4 * s, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3b2416';
    g.lineWidth = 3 * s;
    g.beginPath();
    g.arc(x, y + 8 * s, 8 * s, 0.2, Math.PI - 0.2);
    g.stroke();
  };
  monkey(128, 262, 1.3);
  monkey(384, 262, 1.3);
  paperTex = new THREE.CanvasTexture(c);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  paperTex.anisotropy = 8;
  return paperTex;
}

/**
 * Envoltorio de papel del palito de la selva: una hoja enrollada alrededor del caramelo con las puntas
 * retorcidas. `setProgress(p)` lo desenrolla (0 = envuelto, 1 = hoja plana despegada, empezando por el
 * borde suelto); la mano después lo deja caer.
 */
export class SelvaWrapper {
  readonly mesh: THREE.Mesh;
  private readonly wrapped: Float32Array;
  private readonly flat: Float32Array;
  private readonly normalsOut: Float32Array;
  private readonly cols: number;
  private readonly rows: number;

  constructor(seed: number, candyLength: number, detail: 'hero' | 'prop' = 'hero') {
    const rnd = mulberry32(seed * 331 + 5);
    const ext = 0.006; // papel que sobra en cada punta (se retuerce)
    const cols = (this.cols = detail === 'hero' ? 40 : 16);
    const rows = (this.rows = detail === 'hero' ? 22 : 8);
    const A = (SELVA_WIDTH / 2) * 1.08 + 0.0002;
    const B = (SELVA_THICK / 2) * 1.08 + 0.0002;
    const turns = 1.12; // una vuelta y un poquito (el borde solapado)
    const n = (cols + 1) * (rows + 1);
    this.wrapped = new Float32Array(n * 3);
    this.flat = new Float32Array(n * 3);
    this.normalsOut = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    // Arco acumulado de la sección para desenrollar sin estirar.
    const sec = (th: number, grow: number) => {
      const k = superS(th) * (1 + grow);
      return [Math.cos(th) * A * k, Math.sin(th) * B * k] as const;
    };
    const arc: number[] = [0];
    for (let c = 1; c <= cols; c++) {
      const [x0, z0] = sec(((c - 1) / cols) * turns * Math.PI * 2, 0);
      const [x1, z1] = sec((c / cols) * turns * Math.PI * 2, 0);
      arc.push(arc[c - 1] + Math.hypot(x1 - x0, z1 - z0));
    }
    const twist = (rnd() - 0.5) * 0.6;
    for (let r = 0; r <= rows; r++) {
      const y = -ext + (r / rows) * (candyLength + 2 * ext);
      // Puntas: el papel se junta y se retuerce más allá del caramelo.
      const out = y < 0 ? -y / ext : y > candyLength ? (y - candyLength) / ext : 0;
      const pinch = 1 - 0.72 * THREE.MathUtils.smoothstep(out, 0, 1);
      for (let c = 0; c <= cols; c++) {
        const i = r * (cols + 1) + c;
        const th = (c / cols) * turns * Math.PI * 2 + out * (1.4 + twist) * Math.sign(y - candyLength / 2);
        const [x, z] = sec(th, (c / cols) * 0.04);
        this.wrapped.set([x * pinch, y, z * pinch], i * 3);
        // Hoja plana: tangente al punto de arranque (th = 0), desplegada hacia +Z.
        const [x0] = sec(0, 0);
        this.flat.set([x0 + 0.0004, y + (rnd() - 0.5) * 0.00008, arc[c]], i * 3);
        const len = Math.hypot(x, z) || 1;
        this.normalsOut.set([x / len, 0, z / len], i * 3);
        uv[i * 2] = c / cols;
        uv[i * 2 + 1] = r / rows;
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.wrapped.slice(), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({
        name: 'papel-selva',
        map: paperTexture(),
        roughness: 0.62,
        sheen: 0.3,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
      }),
    );
    this.mesh.name = 'envoltorio';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.noPick = true;
  }

  /** 0 = envuelto, 1 = desenrollado del todo (empieza por el borde suelto). */
  setProgress(p: number): void {
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let r = 0; r <= this.rows; r++) {
      for (let c = 0; c <= this.cols; c++) {
        const i = (r * (this.cols + 1) + c) * 3;
        const t = c / this.cols;
        const k = THREE.MathUtils.smoothstep((p - (1 - t) * 0.55) / 0.45, 0, 1);
        // Se despega hacia afuera mientras se abre (no atraviesa el caramelo).
        const lift = Math.sin(Math.PI * k) * 0.004;
        for (let j = 0; j < 3; j++) arr[i + j] = THREE.MathUtils.lerp(this.wrapped[i + j], this.flat[i + j], k) + this.normalsOut[i + j] * lift;
      }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}
