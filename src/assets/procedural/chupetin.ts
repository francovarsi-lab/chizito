import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';

/**
 * Chupetín tipo "Mister Pop": bola de caramelo brillante en un palito blanco de papel, con su envoltorio
 * transparente que la encierra, las típicas líneas blancas impresas y el nudo retorcido donde el film
 * se junta sobre el palito (con la "pollerita" que sobra abajo). Se clava por la punta del palito.
 * Marco 'tip' ya orientado (`keepOrientation`): la punta del palito en el origen, la bola arriba (+Y).
 * Aproximación sin marca; los colores se pueden afinar con fotos de referencia.
 */
export const CHUPETIN_STICK = 0.055;
export const CHUPETIN_BALL_R = 0.0105;
const STICK_R = 0.0017;

const FLAVORS = ['#e8203a', '#ff7a1a', '#ffc21a', '#7a2fbf', '#3cb043', '#ff4f9a'];

let stickMat: THREE.MeshPhysicalMaterial | null = null;
let filmMat: THREE.MeshPhysicalMaterial | null = null;
const candyMats = new Map<string, THREE.MeshPhysicalMaterial>();

function materials(color: string) {
  stickMat ??= new THREE.MeshPhysicalMaterial({ name: 'palito-chupetin', color: '#f8f6f0', roughness: 0.8, sheen: 0.3 });
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
  let candy = candyMats.get(color);
  if (!candy) {
    candy = new THREE.MeshPhysicalMaterial({
      name: `caramelo-${color}`,
      color,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      transmission: 0.25,
      thickness: 0.01,
      sheen: 0.2,
    });
    candyMats.set(color, candy);
  }
  return { stick: stickMat, film: filmMat, candy };
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
  // Líneas blancas que bajan hacia el nudo (en la lathe, u = alrededor, v = de la punta al nudo).
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

export function createChupetin(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.Group {
  const rnd = mulberry32(seed * 2909 + 11);
  const noise = new Simplex3(seed + 5);
  const flavor = FLAVORS[Math.floor(rnd() * FLAVORS.length)];
  const { stick, film, candy } = materials(flavor);
  const g = new THREE.Group();
  g.name = 'chupetin';
  const seg = detail === 'hero' ? 1 : 0.4;

  // Palito de papel: la punta (abajo) es la que se clava.
  const st = new THREE.Mesh(new THREE.CylinderGeometry(STICK_R, STICK_R, CHUPETIN_STICK, Math.round(18 * seg) + 6, 1), stick);
  st.position.y = CHUPETIN_STICK / 2;
  g.add(st);

  // Bola de caramelo, apenas achatada, con la base que abraza el palito.
  const R = CHUPETIN_BALL_R * (0.96 + rnd() * 0.08);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, Math.round(40 * seg) + 8, Math.round(28 * seg) + 6), candy);
  ball.scale.set(1, 0.94, 1);
  const ballY = CHUPETIN_STICK + R * 0.78;
  ball.position.y = ballY;
  g.add(ball);

  // Envoltorio (lathe): de la punta de la bola baja ceñido, se junta en el nudo sobre el palito y abre
  // una "pollerita" con pliegues.
  const neckY = CHUPETIN_STICK - 0.0005;
  const prof: THREE.Vector2[] = [];
  const steps = detail === 'hero' ? 28 : 10;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 0.82; // desde arriba de la bola hasta debajo del ecuador
    prof.push(new THREE.Vector2(Math.sin(a) * R * 1.06, ballY + Math.cos(a) * R * 0.94 * 1.06));
  }
  const last = prof[prof.length - 1];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    prof.push(new THREE.Vector2(THREE.MathUtils.lerp(last.x, STICK_R * 1.4, t * t), THREE.MathUtils.lerp(last.y, neckY, t)));
  }
  // Pollerita debajo del nudo.
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    prof.push(new THREE.Vector2(STICK_R * 1.4 + t * 0.0055, neckY - t * 0.007));
  }
  const filmGeo = new THREE.LatheGeometry(prof, detail === 'hero' ? 64 : 20);
  // Arrugas del film: más fuertes cerca del nudo y en la pollerita.
  const p = filmGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const th = Math.atan2(z, x);
    const nearKnot = THREE.MathUtils.smoothstep(ballY - y, -0.002, 0.012);
    const folds = 1 + (0.05 + 0.28 * nearKnot) * Math.sin(th * 14 + noise.noise(y * 300, 0, 1) * 2) + 0.03 * noise.noise(x * 600, y * 600, z * 600);
    p.setX(i, x * folds);
    p.setZ(i, z * folds);
  }
  filmGeo.computeVertexNormals();
  const filmMesh = new THREE.Mesh(filmGeo, film);
  filmMesh.renderOrder = 2;
  g.add(filmMesh);
  // Nudo: el film retorcido (un toro gordito con vueltas).
  const knot = new THREE.Mesh(new THREE.TorusGeometry(STICK_R * 1.9, 0.0011, 8, Math.round(20 * seg) + 6), film);
  knot.rotation.x = Math.PI / 2;
  knot.position.y = neckY + 0.0004;
  knot.scale.set(1, 1, 1.6);
  g.add(knot);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = o !== filmMesh;
      o.receiveShadow = true;
    }
  });
  return g;
}
