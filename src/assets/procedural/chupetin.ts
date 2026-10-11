import * as THREE from 'three';
import { mulberry32 } from '../../util/noise';

/**
 * Chupetín tipo "Mister Pop": bola de caramelo brillante y translúcida en un palito blanco de papel. En el
 * vasito viene ENVUELTO: film transparente con las típicas líneas blancas, ceñido al palito abajo y
 * retorcido ARRIBA en un moño. Al agarrarlo se desenvuelve desde el moño (`ChupetinWrapper`): el chupetín
 * en la mano (y clavado) va sin envoltorio, sin las líneas. Se clava por la punta del palito.
 * Marco 'tip' ya orientado (`keepOrientation`): la punta del palito en el origen, la bola arriba (+Y).
 * Aproximación sin marca.
 */
export const CHUPETIN_STICK = 0.055;
export const CHUPETIN_BALL_R = 0.0105;
const STICK_R = 0.0017;

/** Sabores (los de la marca): verde, rojo, naranja y COLA (casi negro: a contraluz, marrón translúcido). */
const FLAVORS = ['#3cb043', '#e8203a', '#ff7a1a', '#2b0c04'];
const COLA = '#2b0c04';

let stickMat: THREE.MeshPhysicalMaterial | null = null;
let filmMat: THREE.MeshPhysicalMaterial | null = null;
const candyMats = new Map<string, THREE.MeshPhysicalMaterial>();

function filmMaterial(): THREE.MeshPhysicalMaterial {
  filmMat ??= new THREE.MeshPhysicalMaterial({
    name: 'film-chupetin',
    map: sheetTexture(),
    transparent: true,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
    // Escribe profundidad: si no, el desenfoque de cámara lo toma como fondo y borronea el moño.
    depthWrite: true,
  });
  return filmMat;
}

function materials(color: string) {
  stickMat ??= new THREE.MeshPhysicalMaterial({ name: 'palito-chupetin', color: '#f8f6f0', roughness: 0.8, sheen: 0.3 });
  let candy = candyMats.get(color);
  if (!candy) {
    const cola = color === COLA;
    // Caramelo duro translúcido: la luz lo atraviesa teñida de su color (la cola se ve marrón oscuro).
    candy = new THREE.MeshPhysicalMaterial({
      name: `caramelo-${color}`,
      color: cola ? '#4a1a0a' : color,
      roughness: 0.07,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      transmission: cola ? 0.55 : 0.35,
      thickness: 0.018,
      attenuationColor: new THREE.Color(cola ? '#5a1e08' : color),
      attenuationDistance: cola ? 0.006 : 0.02,
      ior: 1.5,
    });
    candyMats.set(color, candy);
  }
  return { stick: stickMat, candy };
}

/**
 * La hoja del envoltorio (UNA sola pieza de film, rectangular). v = de abajo (0) hacia arriba (1):
 * abajo la pollerita que se retuerce sobre el palito, en el medio la parte que abraza la bola (líneas
 * blancas curvas y paralelas, sin cruzarse) y arriba el tramo que se retuerce en el moño (blanco con rayas
 * rojas, azules y verdes).
 */
export const SHEET_BANDS = { bottom: 0.16, top: 0.62 };
let sheetTex: THREE.CanvasTexture | null = null;
function sheetTexture(): THREE.CanvasTexture {
  if (sheetTex) return sheetTex;
  const W = 768;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 0, W, H);
  // Canvas: y = 0 arriba = v = 1 (moño).
  const yTop = (1 - SHEET_BANDS.top) * H;
  const yBottom = (1 - SHEET_BANDS.bottom) * H;
  // Moño: blanco translúcido con rayas de colores.
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, 0, W, yTop);
  const cols = ['#d8263a', '#2340b8', '#3fa83c'];
  for (let i = 0; i < 24; i++) {
    g.fillStyle = cols[i % 3];
    g.fillRect(i * 32 + 8, 0, 12, yTop);
  }
  // Sobre la bola: líneas blancas curvas, todas paralelas.
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 4;
  for (let i = -8; i < 32; i++) {
    g.beginPath();
    for (let y = yTop; y <= yBottom; y += 6) {
      const t = (y - yTop) / (yBottom - yTop);
      const x = i * 26 + 70 * Math.sin(t * Math.PI * 0.9);
      if (y === yTop) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  sheetTex = new THREE.CanvasTexture(c);
  sheetTex.colorSpace = THREE.SRGBColorSpace;
  sheetTex.wrapS = THREE.RepeatWrapping;
  sheetTex.anisotropy = 8;
  return sheetTex;
}

export interface ChupetinParams {
  /** Con el envoltorio puesto (los del vasito). */
  wrapped?: boolean;
}

/** Geometría base (bola y altura) compartida por el chupetín y su envoltorio. */
function shape(seed: number) {
  const rnd = mulberry32(seed * 2909 + 11);
  const flavor = FLAVORS[Math.floor(rnd() * FLAVORS.length)];
  const R = CHUPETIN_BALL_R * (0.96 + rnd() * 0.08);
  return { flavor, R, ballY: CHUPETIN_STICK + R * 0.78 };
}

export function createChupetin(seed: number, detail: 'hero' | 'prop' = 'hero', params: ChupetinParams = {}): THREE.Group {
  const { flavor, R, ballY } = shape(seed);
  const { stick, candy } = materials(flavor);
  const g = new THREE.Group();
  g.name = 'chupetin';
  const seg = detail === 'hero' ? 1 : 0.4;

  // Palito de papel: la punta (abajo) es la que se clava.
  const st = new THREE.Mesh(new THREE.CylinderGeometry(STICK_R, STICK_R, CHUPETIN_STICK, Math.round(18 * seg) + 6, 1), stick);
  st.position.y = CHUPETIN_STICK / 2;
  st.name = 'palito-chupetin';
  g.add(st);

  // Bola de caramelo, apenas achatada, abrazando la punta del palito.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, Math.round(40 * seg) + 8, Math.round(28 * seg) + 6), candy);
  ball.scale.set(1, 0.94, 1);
  ball.position.y = ballY;
  ball.name = 'bola';
  g.add(ball);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if (params.wrapped) g.add(new ChupetinWrapper(seed, detail, false).object);
  return g;
}

/**
 * Envoltorio del chupetín (como las fotos): UNA hoja rectangular de film enrollada alrededor de la bola y
 * retorcida en DOS puntos: abajo, sobre la base de la bola (con una pollerita que abraza el palito), y
 * arriba, donde forma el moño abierto en abanico. `setProgress(p)` lo saca: primero se destuercen las dos
 * puntas (0 → 0,4) y después la hoja se desenrolla desde el borde suelto hasta quedar plana, con sus
 * cuatro lados rectos (0,4 → 1). La mano después la deja caer.
 */
export class ChupetinWrapper {
  readonly object: THREE.Mesh;
  private readonly cols: number;
  private readonly rows: number;
  private readonly ys: number[] = [];
  private readonly arc: number[] = [];
  private readonly R: number;
  private readonly ballY: number;
  private readonly A: number;
  private readonly yNeckLow: number;
  private readonly yNeckTop: number;
  private readonly turns = 1.12;

  constructor(seed: number, detail: 'hero' | 'prop' = 'hero', ownMaterial = true) {
    const { R, ballY } = shape(seed);
    this.R = R;
    this.ballY = ballY;
    this.A = R * 1.08;
    const hero = detail === 'hero';
    const cols = (this.cols = hero ? 56 : 20);
    const rows = (this.rows = hero ? 44 : 16);
    // Alturas de la hoja: la pollerita, la bola y el moño (filas equiespaciadas: al abrirse es un rectángulo).
    this.yNeckLow = ballY - R * 0.94 - 0.0012;
    this.yNeckTop = ballY + R * 0.94 + 0.003;
    const y0 = this.yNeckLow - 0.0065;
    const y1 = this.yNeckTop + 0.016;
    for (let r = 0; r <= rows; r++) this.ys.push(y0 + (r / rows) * (y1 - y0));
    for (let c = 0; c <= cols; c++) this.arc.push((c / cols) * this.turns * Math.PI * 2 * this.A);
    const n = (cols + 1) * (rows + 1);
    const uv = new Float32Array(n * 2);
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const i = r * (cols + 1) + c;
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
    // Material propio si se va a desvanecer (no afecta a los del vasito).
    this.object = new THREE.Mesh(geo, ownMaterial ? filmMaterial().clone() : filmMaterial());
    this.object.name = 'envoltorio';
    this.object.renderOrder = 2;
    this.object.receiveShadow = true;
    this.object.userData.noPick = true;
    this.setProgress(0);
  }

  /** Radio del film envuelto a la altura y (sin retorcer): pollerita · cuello · bola · cuello · abanico. */
  private radiusAt(y: number): { r: number; neck: number; fan: number } {
    const { R, ballY, yNeckLow, yNeckTop } = this;
    const neckR = 0.0019;
    if (y <= yNeckLow) {
      // Pollerita bajo el cuello de abajo: se abre un poco hacia el palito.
      const t = (yNeckLow - y) / 0.0065;
      return { r: neckR + t * 0.0035, neck: 1 - t, fan: 0 };
    }
    if (y >= yNeckTop) {
      // Abanico del moño: se abre ancho y chato.
      const t = Math.min(1, (y - yNeckTop) / 0.016);
      return { r: neckR + t * t * 0.0105, neck: 1 - t, fan: t };
    }
    const dy = (y - ballY) / (R * 0.94 * 1.07);
    const onBall = Math.sqrt(Math.max(0, 1 - dy * dy)) * this.A;
    // Entre la bola y cada cuello el film baja hasta el radio del cuello.
    return { r: Math.max(neckR, onBall), neck: THREE.MathUtils.smoothstep(Math.abs(dy), 0.85, 1.25), fan: 0 };
  }

  /** 0 = envuelto y retorcido; 0,4 = puntas destorcidas; 1 = hoja plana (cuatro lados rectos). */
  setProgress(p: number): void {
    const untwist = THREE.MathUtils.smoothstep(p, 0, 0.4);
    const unroll = THREE.MathUtils.clamp((p - 0.4) / 0.6, 0, 1);
    const closed = 1 - untwist;
    const { cols, rows, A, turns } = this;
    const pos = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const total = this.arc[cols];
    for (let r = 0; r <= rows; r++) {
      const y = this.ys[r];
      const { r: rad0, neck, fan } = this.radiusAt(y);
      const outside = y < this.yNeckLow || y > this.yNeckTop;
      // Retorcido en los dos cuellos; destorcido, el film vuelve a un tubo suelto alrededor de la bola.
      const twist = (outside ? 1 : neck) * 3.2 * (y > this.ballY ? 1 : -1) * closed;
      const loose = A * (1.05 + 0.1 * Math.abs(y - this.ballY) / (this.R * 2));
      for (let c = 0; c <= cols; c++) {
        const i = (r * (cols + 1) + c) * 3;
        const t = c / cols;
        const th = t * turns * Math.PI * 2 + twist;
        const crinkle = 1 + 0.18 * fan * Math.sin(th * 10 + y * 3000) + 0.08 * neck * Math.sin(th * 14);
        const rad = THREE.MathUtils.lerp(Math.max(loose, rad0), rad0 * crinkle, closed) * (1 + t * 0.03);
        // El abanico de arriba es más ancho de costado que de frente.
        let x = Math.cos(th) * rad * (1 + 0.25 * fan * closed);
        let z = Math.sin(th) * rad * (1 - 0.35 * fan * closed);
        const k = THREE.MathUtils.smoothstep((unroll - (1 - t) * 0.55) / 0.45, 0, 1);
        if (k > 0) {
          const fx = A * 1.2;
          const fz = -this.arc[c] + total * 0.25;
          const lift = Math.sin(Math.PI * k) * 0.006;
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
