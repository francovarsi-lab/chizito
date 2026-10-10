import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';

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

/** Sabores: frutilla, naranja, limón, uva, manzana, chicle y COLA (casi negro: a contraluz, marrón translúcido). */
const FLAVORS = ['#e8203a', '#ff7a1a', '#ffc21a', '#7a2fbf', '#3cb043', '#ff4f9a', '#2b0c04'];
const COLA = '#2b0c04';

let stickMat: THREE.MeshPhysicalMaterial | null = null;
let filmMat: THREE.MeshPhysicalMaterial | null = null;
const candyMats = new Map<string, THREE.MeshPhysicalMaterial>();

function filmMaterial(): THREE.MeshPhysicalMaterial {
  filmMat ??= new THREE.MeshPhysicalMaterial({
    name: 'film-chupetin',
    map: filmTexture(),
    transparent: true,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
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

/** Film transparente sobre la bola: líneas blancas que bajan curvándose, sin cruzarse (como la foto). */
let filmTex: THREE.CanvasTexture | null = null;
function filmTexture(): THREE.CanvasTexture {
  if (filmTex) return filmTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 4;
  // Todas en la misma dirección y con la misma curva (paralelas): giran como un remolino suave.
  for (let i = -8; i < 24; i++) {
    g.beginPath();
    for (let y = 0; y <= 256; y += 6) {
      const x = i * 26 + 70 * Math.sin((y / 256) * Math.PI * 0.9);
      if (y === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  filmTex = new THREE.CanvasTexture(c);
  filmTex.colorSpace = THREE.SRGBColorSpace;
  filmTex.wrapS = THREE.RepeatWrapping;
  return filmTex;
}

/** Abanico de arriba: film blanco con rayas verticales rojas, azules y verdes. */
let fanTex: THREE.CanvasTexture | null = null;
function fanTexture(): THREE.CanvasTexture {
  if (fanTex) return fanTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(0, 0, 512, 128);
  const cols = ['#d8263a', '#2340b8', '#3fa83c'];
  for (let i = 0; i < 18; i++) {
    g.fillStyle = cols[i % 3];
    g.fillRect(i * 28.4 + 6, 0, 12, 128);
  }
  fanTex = new THREE.CanvasTexture(c);
  fanTex.colorSpace = THREE.SRGBColorSpace;
  fanTex.wrapS = THREE.RepeatWrapping;
  return fanTex;
}

let fanMat: THREE.MeshPhysicalMaterial | null = null;
function fanMaterial(): THREE.MeshPhysicalMaterial {
  fanMat ??= new THREE.MeshPhysicalMaterial({
    name: 'abanico-chupetin',
    map: fanTexture(),
    transparent: true,
    roughness: 0.2,
    clearcoat: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return fanMat;
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
 * Envoltorio del chupetín (como la foto): film transparente con una red de líneas blancas que envuelve la
 * bola, ceñido abajo contra el palito, y ARRIBA un cuello retorcido (el nudo por donde se desenvuelve) que
 * se abre en un abanico blanco con rayas rojas, azules y verdes. `setProgress(p)` lo saca tirando del
 * nudo: sube, se abre y gira; después la mano lo deja caer.
 */
export class ChupetinWrapper {
  readonly object: THREE.Group;
  private filmMesh!: THREE.Mesh;
  private filmBase!: Float32Array;
  private top: THREE.Object3D[] = [];
  private ballY = 0;
  private R = 0;

  constructor(seed: number, detail: 'hero' | 'prop' = 'hero', ownMaterial = true) {
    const { R, ballY } = shape(seed);
    this.R = R;
    this.ballY = ballY;
    const noise = new Simplex3(seed + 5);
    // Materiales propios si se va a desvanecer (no afecta a los del vasito).
    const film = ownMaterial ? filmMaterial().clone() : filmMaterial();
    const fan = ownMaterial ? fanMaterial().clone() : fanMaterial();
    const g = (this.object = new THREE.Group());
    g.name = 'envoltorio';
    const hero = detail === 'hero';
    const topY = ballY + R * 0.94 * 1.07;
    const neckY = topY + 0.003;
    const bottomY = ballY - R * 0.94 - 0.0012;

    // Film sobre la bola: de abajo (ceñido al palito) hasta el cuello de arriba.
    const prof: THREE.Vector2[] = [new THREE.Vector2(STICK_R * 1.25, bottomY - 0.002)];
    const steps = hero ? 30 : 12;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI - (i / steps) * Math.PI; // de abajo de la bola a la cima
      prof.push(new THREE.Vector2(Math.max(STICK_R * 1.25, Math.sin(a) * R * 1.07), ballY + Math.cos(a) * R * 0.94 * 1.07));
    }
    prof.push(new THREE.Vector2(0.0018, neckY));
    const geo = new THREE.LatheGeometry(prof, hero ? 64 : 20);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const th = Math.atan2(z, x);
      // Pliegues que suben hacia el nudo.
      const nearTop = THREE.MathUtils.smoothstep(y - ballY, R * 0.35, R * 1.2);
      const folds = 1 + (0.03 + 0.25 * nearTop) * Math.sin(th * 12 + noise.noise(y * 300, 0, 1) * 2) + 0.02 * noise.noise(x * 600, y * 600, z * 600);
      p.setX(i, x * folds);
      p.setZ(i, z * folds);
    }
    geo.computeVertexNormals();
    this.filmMesh = new THREE.Mesh(geo, film);
    this.filmBase = (geo.getAttribute('position').array as Float32Array).slice();
    g.add(this.filmMesh);

    // Nudo: el cuello retorcido.
    const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0021, 0.004, 14, 3), film);
    const kp = knot.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < kp.count; i++) {
      const th = Math.atan2(kp.getZ(i), kp.getX(i)) + kp.getY(i) * 900; // vueltas del retorcido
      const k = 1 + 0.2 * Math.sin(th * 5);
      kp.setX(i, kp.getX(i) * k);
      kp.setZ(i, kp.getZ(i) * k);
    }
    knot.geometry.computeVertexNormals();
    knot.position.y = neckY + 0.0012;
    g.add(knot);
    this.top.push(knot);

    // Abanico: el film que sobra arriba del nudo, abierto con pliegues y rayas de colores.
    const fanProf: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      fanProf.push(new THREE.Vector2(0.0019 + t * t * 0.0105, neckY + 0.003 + t * 0.016));
    }
    const fanGeo = new THREE.LatheGeometry(fanProf, hero ? 72 : 24);
    const fp = fanGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i);
      const y = fp.getY(i);
      const z = fp.getZ(i);
      const th = Math.atan2(z, x);
      const t = THREE.MathUtils.clamp((y - neckY - 0.003) / 0.016, 0, 1);
      // Abanico más ancho de costado que de frente, con pliegues marcados y el borde irregular.
      const fold = 1 + 0.22 * t * Math.sin(th * 10 + noise.noise(th, 3, 1));
      const sx = 1 + 0.25 * t;
      const sz = 1 - 0.35 * t;
      fp.setX(i, x * fold * sx);
      fp.setZ(i, z * fold * sz);
      fp.setY(i, y + t * 0.0015 * noise.noise(Math.cos(th) * 3, Math.sin(th) * 3, 7));
    }
    fanGeo.computeVertexNormals();
    const fanMesh = new THREE.Mesh(fanGeo, fan);
    g.add(fanMesh);
    this.top.push(fanMesh);

    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.renderOrder = 2;
        o.receiveShadow = true;
        o.userData.noPick = true;
      }
    });
  }

  /**
   * 0 = envuelto. Se abre DESDE ARRIBA: primero se desata el nudo (el abanico sube un poco, gira y se
   * suelta, 0 → 0,35) y después el film se abre como una flor, de la cima hacia abajo, despegándose de
   * la bola (0,25 → 1). La mano después lo deja caer.
   */
  setProgress(p: number): void {
    const untie = THREE.MathUtils.smoothstep(p, 0, 0.35);
    for (const o of this.top) {
      o.position.y = (o.userData.y0 ??= o.position.y) + untie * 0.006;
      o.rotation.y = untie * 1.4;
      o.scale.setScalar(1 + untie * 0.3);
    }
    const open = THREE.MathUtils.smoothstep(p, 0.25, 1);
    const pos = this.filmMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const base = this.filmBase;
    const R = this.R;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i];
      const y = base[i + 1];
      const z = base[i + 2];
      // Cuánto "arriba" está el punto (0 = base de la bola, 1 = cima): la cima se abre primero.
      const h = THREE.MathUtils.clamp((y - (this.ballY - R)) / (2.2 * R), 0, 1);
      const k = THREE.MathUtils.smoothstep(open * 1.4 - (1 - h) * 0.6, 0, 1);
      const len = Math.hypot(x, z) || 1e-6;
      // Pétalos: el film se abre hacia afuera y se dobla hacia abajo alrededor de la bola.
      const push = k * R * (0.9 + h * 0.8);
      arr[i] = x + (x / len) * push;
      arr[i + 1] = y - k * h * R * 0.9;
      arr[i + 2] = z + (z / len) * push;
    }
    pos.needsUpdate = true;
    this.filmMesh.geometry.computeVertexNormals();
  }
}
