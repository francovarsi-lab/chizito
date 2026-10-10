import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { buildTube } from './tube';

/**
 * Palito de la selva (según la foto del usuario): caramelo masticable CILÍNDRICO, blanco con una franja
 * rosa que gira apenas a lo largo (mitad rosa / mitad blanco), puntas cortadas con el borde redondeado.
 * En el bowl viene en su paquete (almohadita con las puntas selladas en aleta dentada, verdes de selva,
 * cuerpo a rayas diagonales rosa y blanco, un animalito y su ficha). Al agarrarlo el paquete se abre y
 * se cae (`SelvaWrapper`), y se clava sin papel. Marco 'tip': la punta en el origen, el cuerpo hacia +Y.
 * Sin logo ni nombre de marca. Más adelante cada paquete traerá un dato curioso del animal.
 */
export const SELVA_LENGTH = 0.055;
export const SELVA_RADIUS = 0.0056;
/** Compatibilidad: ancho total del caramelo. */
export const SELVA_WIDTH = SELVA_RADIUS * 2;

const PINK = new THREE.Color('#ef8fb4');
const PINK_DEEP = new THREE.Color('#e3729f');
const WHITE = new THREE.Color('#fff6f1');

let candyMat: THREE.MeshPhysicalMaterial | null = null;
function candyMaterial(): THREE.MeshPhysicalMaterial {
  candyMat ??= new THREE.MeshPhysicalMaterial({
    name: 'palito-selva',
    vertexColors: true,
    roughness: 0.55,
    sheen: 0.6,
    sheenColor: new THREE.Color('#fff2f6'),
    sheenRoughness: 0.5,
    clearcoat: 0.1,
    clearcoatRoughness: 0.5,
  });
  return candyMat;
}

export interface PalitoSelvaParams {
  /** Con el paquete puesto (los del bowl). */
  wrapped?: boolean;
}

export function createPalitoSelva(seed: number, detail: 'hero' | 'prop' = 'hero', params: PalitoSelvaParams = {}): THREE.Object3D {
  const rnd = mulberry32(seed * 5113 + 7);
  const noise = new Simplex3(seed + 91);
  const L = SELVA_LENGTH * (0.96 + rnd() * 0.08);
  const R = SELVA_RADIUS * (0.97 + rnd() * 0.06);
  const bevel = 0.0018; // borde redondeado del corte
  const bow = (rnd() - 0.5) * 0.0014; // apenas curvado (es blando)
  const turn = 0.35 + rnd() * 0.3; // vueltas de la franja rosa a lo largo
  const phase = rnd() * Math.PI * 2;
  const geo = buildTube({
    rows: detail === 'hero' ? 150 : 28,
    cols: detail === 'hero' ? 48 : 14,
    // Más filas en los cortes; u recorre de 0 a 1 completo (si no, las tapas quedan abiertas).
    rowParam: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
    center: (u, out) => out.set(bow * Math.sin(Math.PI * u), u * L, 0),
    radius: (u, th) => {
      if (u <= 0 || u >= 1) return [0, 0];
      const s = u * L;
      const e = Math.min(s, L - s);
      // Punta cortada casi plana con el borde redondeado (superellipse a lo largo).
      const cap = e >= bevel ? 1 : Math.pow(Math.max(0, 1 - ((bevel - e) / bevel) ** 4), 1 / 4);
      const r = R * cap * (1 + 0.02 * noise.noise(Math.cos(th) * 2, s * 90, 0.3));
      return [r, r];
    },
    displace: (p) => noise.noise(p.x * 900, p.y * 700, p.z * 900) * 0.00002,
    color: (p, _n, u, th, _d, out) => {
      // Franja rosa que ocupa media vuelta y gira apenas a lo largo; bordes fundidos y ondulados.
      const a = th - phase - u * turn * Math.PI * 2;
      const seam = Math.cos(a) + 0.1 * noise.noise(p.y * 160, 0.5, 2);
      const k = THREE.MathUtils.smoothstep(seam, -0.1, 0.1);
      out.copy(WHITE).lerp(PINK, k);
      out.lerp(PINK_DEEP, k * THREE.MathUtils.smoothstep(noise.noise(p.x * 400, p.y * 220, p.z * 400), 0.4, 0.95) * 0.3);
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
  g.add(new SelvaWrapper(seed, L, detail).object);
  return g;
}

// ───────────────────────────── paquete ─────────────────────────────

/** Textura del paquete: u = alrededor (la cara de adelante es la primera mitad), v = a lo largo. */
let packTex: THREE.CanvasTexture | null = null;
function packTexture(): THREE.CanvasTexture {
  if (packTex) return packTex;
  const W = 768;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // Cuerpo: rayas diagonales rosa y blanco.
  g.fillStyle = '#fbe3ea';
  g.fillRect(0, 0, W, H);
  g.save();
  g.rotate(-0.5);
  for (let x = -H * 2; x < W * 2; x += 30) {
    g.fillStyle = '#f4a8c2';
    g.fillRect(x, -H, 15, H * 4);
  }
  g.restore();
  // Puntas (aletas selladas): verde selva con hojas y dientes del sellado.
  const fin = (y0: number, y1: number) => {
    g.fillStyle = '#3f9a3a';
    g.fillRect(0, y0, W, y1 - y0);
    const rnd = mulberry32(y0 + 3);
    for (let i = 0; i < 70; i++) {
      g.save();
      g.translate(rnd() * W, y0 + rnd() * (y1 - y0));
      g.rotate(rnd() * Math.PI);
      g.fillStyle = rnd() < 0.5 ? '#6cc24a' : '#24702c';
      g.beginPath();
      g.ellipse(0, 0, 16 + rnd() * 14, 6 + rnd() * 4, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#ffffff40';
    for (let x = 0; x < W; x += 14) g.fillRect(x, y0, 5, y1 - y0); // rayitas del sellado
  };
  fin(0, 70);
  fin(H - 70, H);
  // Cara de adelante (primera mitad de u): título amarillo con borde rojo (sin letras de marca),
  // un pingüino y la ficha del animal.
  const fx = W * 0.25;
  const fy = H * 0.48;
  g.fillStyle = '#e8352b';
  roundRect(g, fx - 150, fy - 70, 300, 64, 30);
  g.fill();
  g.fillStyle = '#ffd52e';
  roundRect(g, fx - 140, fy - 62, 280, 48, 24);
  g.fill();
  g.fillStyle = '#e8352b';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(fx - 105 + i * 42, fy - 38, 13, 0, Math.PI * 2);
    g.fill();
  }
  // Pingüino.
  const px = fx + 110;
  const py = fy + 60;
  g.fillStyle = '#2c2f38';
  g.beginPath();
  g.ellipse(px, py, 34, 48, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(px, py + 8, 22, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f5a623';
  g.beginPath();
  g.moveTo(px - 6, py - 28);
  g.lineTo(px + 6, py - 28);
  g.lineTo(px, py - 18);
  g.fill();
  g.fillStyle = '#2c2f38';
  g.beginPath();
  g.arc(px - 10, py - 34, 4, 0, Math.PI * 2);
  g.arc(px + 10, py - 34, 4, 0, Math.PI * 2);
  g.fill();
  // Ficha del animal (futuro dato curioso): renglones con datos.
  g.fillStyle = '#c2185b';
  g.font = 'bold 20px Nunito, sans-serif';
  const rows = ['Velocidad  56 km/h', 'Peso  18 kg', 'Alto  0,8 m'];
  rows.forEach((t, i) => g.fillText(t, fx - 150, fy + 30 + i * 28));
  // Dorso: rayas y renglones del texto chiquito.
  g.fillStyle = '#c2185b99';
  for (let i = 0; i < 6; i++) g.fillRect(W * 0.6, H * 0.3 + i * 30, W * 0.3 - (i % 2) * 40, 8);
  packTex = new THREE.CanvasTexture(c);
  packTex.colorSpace = THREE.SRGBColorSpace;
  packTex.anisotropy = 8;
  packTex.wrapS = THREE.RepeatWrapping;
  return packTex;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Paquete del palito de la selva: una hoja que envuelve el caramelo como almohadita y se cierra en las
 * puntas en aletas planas (con el borde dentado). `setProgress(p)` lo abre: 0 = cerrado, 1 = hoja plana
 * despegada (empieza por el borde suelto). Después la mano lo deja caer.
 */
export class SelvaWrapper {
  readonly object: THREE.Mesh;
  private readonly wrapped: Float32Array;
  private readonly flat: Float32Array;
  private readonly outward: Float32Array;
  private readonly cols: number;
  private readonly rows: number;

  constructor(seed: number, candyLength: number, detail: 'hero' | 'prop' = 'hero') {
    const rnd = mulberry32(seed * 331 + 5);
    const ext = 0.0085; // aleta sellada en cada punta
    const cols = (this.cols = detail === 'hero' ? 48 : 20);
    const rows = (this.rows = detail === 'hero' ? 26 : 10);
    // Sección de almohadita: más ancha que alta, apenas más grande que el caramelo.
    const A = SELVA_RADIUS * 1.55;
    const B = SELVA_RADIUS * 1.08;
    const sec = (th: number, flatten: number) => [Math.cos(th) * A, Math.sin(th) * B * flatten] as const;
    const n = (cols + 1) * (rows + 1);
    this.wrapped = new Float32Array(n * 3);
    this.flat = new Float32Array(n * 3);
    this.outward = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const arc: number[] = [0];
    for (let c = 1; c <= cols; c++) {
      const [x0, z0] = sec(((c - 1) / cols) * Math.PI * 2, 1);
      const [x1, z1] = sec((c / cols) * Math.PI * 2, 1);
      arc.push(arc[c - 1] + Math.hypot(x1 - x0, z1 - z0));
    }
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const y = -ext + v * (candyLength + 2 * ext);
      // En las aletas el paquete se aplasta hasta quedar plano (sellado), con un leve ondeo.
      const out = y < 0 ? -y / ext : y > candyLength ? (y - candyLength) / ext : 0;
      const flatten = 1 - THREE.MathUtils.smoothstep(out, 0, 0.75) * 0.97;
      const wobble = out > 0 ? Math.sin(y * 900 + seed) * 0.0002 : 0;
      for (let c = 0; c <= cols; c++) {
        const i = r * (cols + 1) + c;
        // La cara de adelante (u en [0, 0,5]) mira a +Z.
        const th = (c / cols) * Math.PI * 2;
        const [x, z] = sec(th, flatten);
        this.wrapped.set([x, y, z + wobble], i * 3);
        this.flat.set([A + 0.0004, y + (rnd() - 0.5) * 0.00008, -arc[c] + arc[cols] * 0.25], i * 3);
        const len = Math.hypot(x, z) || 1;
        this.outward.set([x / len, 0, z / len], i * 3);
        // u al revés de th: vista desde +Z la cara de adelante no queda espejada.
        uv[i * 2] = 0.5 - c / cols;
        uv[i * 2 + 1] = v;
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.wrapped.slice(), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.object = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({
        name: 'paquete-selva',
        map: packTexture(),
        roughness: 0.35,
        clearcoat: 0.5,
        clearcoatRoughness: 0.25,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
      }),
    );
    this.object.name = 'envoltorio';
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.object.userData.noPick = true;
  }

  /** 0 = cerrado, 1 = abierto del todo (empieza por el borde suelto). */
  setProgress(p: number): void {
    const pos = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let r = 0; r <= this.rows; r++) {
      for (let c = 0; c <= this.cols; c++) {
        const i = (r * (this.cols + 1) + c) * 3;
        const t = c / this.cols;
        const k = THREE.MathUtils.smoothstep((p - (1 - t) * 0.55) / 0.45, 0, 1);
        const lift = Math.sin(Math.PI * k) * 0.005; // se despega hacia afuera mientras se abre
        for (let j = 0; j < 3; j++) arr[i + j] = THREE.MathUtils.lerp(this.wrapped[i + j], this.flat[i + j], k) + this.outward[i + j] * lift;
      }
    }
    pos.needsUpdate = true;
    this.object.geometry.computeVertexNormals();
  }
}
