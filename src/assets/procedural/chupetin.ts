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

/** Film casi transparente con líneas blancas (meridianos y un par de vueltas) y apenas brillo. */
let filmTex: THREE.CanvasTexture | null = null;
function filmTexture(): THREE.CanvasTexture {
  if (filmTex) return filmTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineCap = 'round';
  // Líneas blancas que suben hacia el moño (en la lathe, u = alrededor, v = de abajo al moño).
  for (let i = 0; i < 12; i++) {
    const x = (i / 12) * 512 + 12;
    g.lineWidth = i % 3 === 0 ? 7 : 4;
    g.beginPath();
    g.moveTo(x, 20);
    g.bezierCurveTo(x + 18, 90, x - 14, 160, x + 6, 236);
    g.stroke();
  }
  g.lineWidth = 5;
  for (const y of [70, 120]) {
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) g.lineTo(x, y + Math.sin(x / 30) * 6);
    g.stroke();
  }
  filmTex = new THREE.CanvasTexture(c);
  filmTex.colorSpace = THREE.SRGBColorSpace;
  filmTex.wrapS = THREE.RepeatWrapping;
  return filmTex;
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
 * Envoltorio del chupetín: film transparente con líneas blancas, ceñido al palito abajo (con un poquito
 * de "pollerita") y retorcido ARRIBA en un moño. `setProgress(p)` lo saca tirando del moño: sube, se
 * abre y gira; después la mano lo deja caer.
 */
export class ChupetinWrapper {
  readonly object: THREE.Group;

  constructor(seed: number, detail: 'hero' | 'prop' = 'hero', ownMaterial = true) {
    const { R, ballY } = shape(seed);
    const noise = new Simplex3(seed + 5);
    // Material propio si se va a desvanecer (no afecta a los del vasito).
    const film = ownMaterial ? filmMaterial().clone() : filmMaterial();
    const g = (this.object = new THREE.Group());
    g.name = 'envoltorio';
    const topY = ballY + R * 0.94 * 1.07;
    // Perfil (de abajo hacia arriba): pollerita bajo la bola, ceñido al palito, abraza la bola y se
    // junta arriba en el cuello del moño.
    const neckLow = ballY - R * 0.94 - 0.0015;
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      prof.push(new THREE.Vector2(STICK_R * 1.3 + (1 - t) * 0.0035, neckLow - 0.004 + t * 0.004));
    }
    const steps = detail === 'hero' ? 30 : 12;
    for (let i = 1; i <= steps; i++) {
      const a = Math.PI - (i / steps) * Math.PI * 0.93; // desde abajo de la bola hasta casi la cima
      prof.push(new THREE.Vector2(Math.max(STICK_R * 1.3, Math.sin(a) * R * 1.07), ballY + Math.cos(a) * R * 0.94 * 1.07));
    }
    prof.push(new THREE.Vector2(0.0016, topY + 0.0012));
    const geo = new THREE.LatheGeometry(prof, detail === 'hero' ? 64 : 20);
    // Pliegues del film: fuertes cerca del moño y en la pollerita.
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const th = Math.atan2(z, x);
      const nearTop = THREE.MathUtils.smoothstep(y - ballY, R * 0.3, R * 1.05);
      const nearBottom = THREE.MathUtils.smoothstep(ballY - y, R * 0.6, R * 1.1);
      const amp = 0.04 + 0.3 * nearTop + 0.15 * nearBottom;
      const folds = 1 + amp * Math.sin(th * 12 + noise.noise(y * 300, 0, 1) * 2) + 0.03 * noise.noise(x * 600, y * 600, z * 600);
      p.setX(i, x * folds);
      p.setZ(i, z * folds);
    }
    geo.computeVertexNormals();
    const filmMesh = new THREE.Mesh(geo, film);
    filmMesh.renderOrder = 2;
    g.add(filmMesh);
    // Moño arriba: el cuello retorcido y dos "orejas" de film abiertas, con pliegues.
    const knot = new THREE.Mesh(new THREE.TorusGeometry(0.0019, 0.0011, 8, 18), film);
    knot.rotation.x = Math.PI / 2;
    knot.position.y = topY + 0.0012;
    g.add(knot);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.0095, 14, 1, true), film);
      ear.position.set(side * 0.0035, topY + 0.0045, 0);
      ear.rotation.z = -side * 1.0;
      const ep = ear.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < ep.count; i++) {
        const th = Math.atan2(ep.getZ(i), ep.getX(i));
        const k = 1 + 0.25 * Math.sin(th * 7);
        ep.setX(i, ep.getX(i) * k);
        ep.setZ(i, ep.getZ(i) * k);
      }
      ear.geometry.computeVertexNormals();
      g.add(ear);
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.renderOrder = 2;
        o.receiveShadow = true;
        o.userData.noPick = true;
      }
    });
  }

  /** 0 = envuelto; hacia 1 sale tirando del moño: sube, se abre y gira. */
  setProgress(p: number): void {
    const k = p * p;
    this.object.position.y = k * 0.034;
    this.object.scale.set(1 + p * 0.35, 1 + p * 0.15, 1 + p * 0.35);
    this.object.rotation.y = p * 1.2;
    this.object.rotation.z = p * 0.25;
  }
}
