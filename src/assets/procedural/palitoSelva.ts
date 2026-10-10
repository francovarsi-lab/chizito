import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { buildTube } from './tube';

/**
 * Palito de la selva (según las fotos del usuario): caramelo masticable CILÍNDRICO, MITAD ROSA / MITAD
 * BLANCO con la división en línea recta a lo largo (acostado: rosa la mitad de abajo, blanca la de arriba),
 * puntas cortadas con el borde redondeado. En el bowl viene envuelto: papel ajustado en tubito con las
 * PUNTAS RETORCIDAS (verde selva), cuerpo rosado claro con una franja amarilla y un bichito. Al agarrarlo
 * se destuercen las puntas, se desenrolla el papel y se cae (`SelvaWrapper`); se clava sin papel.
 * Marco 'tip': la punta en el origen, el cuerpo hacia +Y. Sin logo ni nombre de marca.
 * Más adelante cada envoltorio traerá un dato curioso del animal.
 */
export const SELVA_LENGTH = 0.045;
export const SELVA_RADIUS = 0.00425;
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
  rnd(); // (antes: vueltas de la franja; se conserva la secuencia de la semilla)
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
      // Mitad rosa / mitad blanco, división RECTA a lo largo (sin hélice), apenas fundida.
      void u;
      const seam = Math.cos(th - phase);
      const k = THREE.MathUtils.smoothstep(seam, -0.05, 0.05);
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

// ───────────────────────────── envoltorio ─────────────────────────────

/** Textura del papel: u = alrededor (la cara de adelante es la primera mitad), v = a lo largo. */
let paperTex: THREE.CanvasTexture | null = null;
function paperTexture(): THREE.CanvasTexture {
  if (paperTex) return paperTex;
  const W = 768;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // Cuerpo: rosado muy claro (como la foto), con brillo de papel encerado.
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#f9e4ec');
  grad.addColorStop(0.5, '#f3d3df');
  grad.addColorStop(1, '#f9e4ec');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Puntas: verde selva oscuro con hojas (lo que se retuerce).
  const end = (y0: number, y1: number) => {
    g.fillStyle = '#2f6b2a';
    g.fillRect(0, y0, W, y1 - y0);
    const rnd = mulberry32(y0 + 3);
    for (let i = 0; i < 60; i++) {
      g.save();
      g.translate(rnd() * W, y0 + rnd() * (y1 - y0));
      g.rotate(rnd() * Math.PI);
      g.fillStyle = rnd() < 0.5 ? '#5aa548' : '#1f4f1f';
      g.beginPath();
      g.ellipse(0, 0, 18 + rnd() * 16, 7 + rnd() * 4, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  };
  end(0, 96);
  end(H - 96, H);
  // Hojitas verdes claras sueltas sobre el cuerpo (como en la foto).
  const rnd = mulberry32(9);
  for (let i = 0; i < 6; i++) {
    g.save();
    g.translate(W * (0.55 + rnd() * 0.4), H * (0.25 + rnd() * 0.5));
    g.rotate(rnd() * Math.PI);
    g.fillStyle = '#b9dca0cc';
    g.beginPath();
    g.ellipse(0, 0, 34, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // Cara de adelante: franja amarilla a lo largo con borde rojo (en lugar del logo) y una libélula.
  const fx = W * 0.25;
  g.fillStyle = '#e8352b';
  roundRect(g, fx - 80, 118, 160, H - 236, 40);
  g.fill();
  g.fillStyle = '#ffe14d';
  roundRect(g, fx - 66, 130, 132, H - 260, 32);
  g.fill();
  // Libélula: cuerpo y cuatro alas.
  const lx = fx;
  const ly = H * 0.5;
  g.fillStyle = '#7fc8e8aa';
  for (const [dx, dy, a] of [[-26, -14, -0.4], [26, -14, 0.4], [-22, 10, 0.3], [22, 10, -0.3]] as const) {
    g.save();
    g.translate(lx + dx, ly + dy);
    g.rotate(a);
    g.beginPath();
    g.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#2e7d4f';
  g.fillRect(lx - 4, ly - 30, 8, 70);
  g.beginPath();
  g.arc(lx, ly - 32, 8, 0, Math.PI * 2);
  g.fill();
  paperTex = new THREE.CanvasTexture(c);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  paperTex.anisotropy = 8;
  paperTex.wrapS = THREE.RepeatWrapping;
  return paperTex;
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
 * Envoltorio del palito de la selva: papel enrollado ajustado al caramelo (una vuelta y un poco) con las
 * PUNTAS RETORCIDAS. `setProgress(p)` lo abre en dos tiempos, como se hace con la mano: primero se
 * destuercen las puntas (p 0 → 0,4) y después el papel se desenrolla desde el borde suelto (0,4 → 1).
 */
export class SelvaWrapper {
  readonly object: THREE.Mesh;
  private readonly cols: number;
  private readonly rows: number;
  private readonly L: number;
  private readonly ext = 0.0085; // papel que sobra en cada punta (se retuerce)
  private readonly A = SELVA_RADIUS * 1.1 + 0.0002;
  private readonly turns = 1.15;
  private readonly twistSign: number;
  private readonly arc: number[] = [];

  constructor(seed: number, candyLength: number, detail: 'hero' | 'prop' = 'hero') {
    const rnd = mulberry32(seed * 331 + 5);
    this.L = candyLength;
    this.twistSign = rnd() < 0.5 ? -1 : 1;
    const cols = (this.cols = detail === 'hero' ? 44 : 18);
    const rows = (this.rows = detail === 'hero' ? 30 : 12);
    for (let c = 0; c <= cols; c++) this.arc.push((c / cols) * this.turns * Math.PI * 2 * this.A);
    const n = (cols + 1) * (rows + 1);
    const uv = new Float32Array(n * 2);
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const i = r * (cols + 1) + c;
        // u al revés de θ: vista desde +Z la cara de adelante no queda espejada.
        uv[i * 2] = 0.5 - c / cols;
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
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.object = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({
        name: 'papel-selva',
        map: paperTexture(),
        roughness: 0.45,
        clearcoat: 0.35,
        clearcoatRoughness: 0.3,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
      }),
    );
    this.object.name = 'envoltorio';
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.object.userData.noPick = true;
    this.setProgress(0);
  }

  /** 0 = cerrado y retorcido; 0,4 = puntas sueltas; 1 = desenrollado del todo. */
  setProgress(p: number): void {
    const { cols, rows, L, ext, A, turns } = this;
    const untwist = THREE.MathUtils.smoothstep(p, 0, 0.4);
    const unroll = THREE.MathUtils.clamp((p - 0.4) / 0.6, 0, 1);
    const pos = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const total = this.arc[cols];
    for (let r = 0; r <= rows; r++) {
      const y = -ext + (r / rows) * (L + 2 * ext);
      // Más allá del caramelo el papel se junta y se retuerce (hasta casi un hilo en la punta).
      const out = y < 0 ? -y / ext : y > L ? (y - L) / ext : 0;
      const side = y < L / 2 ? -1 : 1;
      const pinch = 1 - 0.85 * THREE.MathUtils.smoothstep(out, 0, 0.85) * (1 - untwist);
      const twist = out * 2.6 * this.twistSign * side * (1 - untwist);
      // Al destorcer, las puntas quedan abiertas en una pollerita.
      const flare = 1 + 0.35 * out * untwist;
      for (let c = 0; c <= cols; c++) {
        const i = (r * (cols + 1) + c) * 3;
        const t = c / cols;
        const th = t * turns * Math.PI * 2 + twist;
        const rad = A * pinch * flare * (1 + t * 0.04);
        let x = Math.cos(th) * rad;
        let z = Math.sin(th) * rad;
        // Desenrollar: cada columna pasa de su lugar en el tubo a una hoja plana tangente (borde suelto primero).
        const k = THREE.MathUtils.smoothstep((unroll - (1 - t) * 0.55) / 0.45, 0, 1);
        if (k > 0) {
          const fx = A + 0.0004;
          const fz = -this.arc[c] + total * 0.25;
          const lift = Math.sin(Math.PI * k) * 0.004;
          const len = Math.hypot(x, z) || 1;
          x = THREE.MathUtils.lerp(x, fx, k) + (x / len) * lift;
          z = THREE.MathUtils.lerp(z, fz, k) + (z / len) * lift;
        }
        arr[i] = x;
        arr[i + 1] = y;
        arr[i + 2] = z;
      }
    }
    pos.needsUpdate = true;
    this.object.geometry.computeVertexNormals();
  }
}
