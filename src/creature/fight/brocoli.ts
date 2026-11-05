// Rival fijo "brócoli malvado". Procedural, según el boceto aprobado.
// Unidades: 1 unidad ≈ 100 px del boceto 2D. Suelo en y = 0.
// Las zanahorias de brazos y piernas entran con la punta fina dentro del tronco.
// Las 4 primeras mallas hijas son, en orden: brazo izq., brazo der., pierna izq., pierna der. (`broccoliRig.ts` las articula).

import * as THREE from 'three';

const COLOR = {
  crownDark: 0x2e5e1e,
  crownMid: 0x284f19,
  crownLight: 0x3b7a26,
  stalk: 0x9cc97a,
  eye: 0x6b1e6e, // remolacha violeta
  brow: 0xb3261e, // morrón rojo
  mouth: 0x3a0f1f,
  sesame: 0x1a1a1a, // semillas de sésamo negro
  carrot: 0xe8741e,
};

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 });

/** Zanahoria: punta fina en el origen, parte gruesa hacia +Y. */
function carrot(length: number, thickRadius: number, thinRadius: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(thickRadius, thinRadius, length, 12);
  geo.translate(0, length / 2, 0);
  return new THREE.Mesh(geo, mat(COLOR.carrot));
}

/** Miembro de zanahoria: `from` queda dentro del tronco, `to` es el extremo libre. */
function limb(from: THREE.Vector3, to: THREE.Vector3): THREE.Mesh {
  const dir = to.clone().sub(from);
  const length = dir.length();
  const mesh = carrot(length, 0.11, 0.03);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/** Barra fina entre dos puntos 2D (x, y), usada para cejas y boca. */
function bar(a: [number, number], b: [number, number], thick: number, color: number, z: number): THREE.Mesh {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const geo = new THREE.BoxGeometry(len, thick, 0.06);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
  mesh.rotation.z = Math.atan2(dy, dx);
  return mesh;
}

export interface BrocoliOptions {
  /** Nivel del rival: 1, 2, etc. Por ahora solo se guarda en userData. */
  level?: number;
}

/** Crea el brócoli malvado. Devuelve un Group. */
export function createBrocoli(options: BrocoliOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'brocoli';
  root.userData.level = options.level ?? 1;

  // 1) Extremidades primero: así la punta fina queda oculta dentro del tronco.
  root.add(limb(new THREE.Vector3(-0.24, 2.29, 0), new THREE.Vector3(-1.44, 1.61, 0))); // brazo izq.
  root.add(limb(new THREE.Vector3(0.24, 2.29, 0), new THREE.Vector3(1.44, 1.61, 0))); // brazo der.
  root.add(limb(new THREE.Vector3(-0.16, 1.53, 0), new THREE.Vector3(-0.38, 0.05, 0))); // pierna izq.
  root.add(limb(new THREE.Vector3(0.16, 1.53, 0), new THREE.Vector3(0.38, 0.05, 0))); // pierna der.

  // 2) Tronco verde claro.
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.32, 24), mat(COLOR.stalk));
  trunk.position.set(0, 2.09, 0);
  root.add(trunk);

  // 3) Copa oscura como pelo.
  const crown: [number, number, number, number][] = [
    // x, y, radio, color (0 = oscuro, 1 = medio, 2 = claro)
    [-0.4, 3.25, 0.48, 0],
    [0.06, 3.45, 0.54, 0],
    [0.52, 3.23, 0.46, 0],
    [-0.1, 2.95, 0.44, 2],
    [0.32, 2.93, 0.42, 2],
    [0.1, 3.17, 0.4, 1],
    [-0.64, 2.95, 0.3, 2],
    [0.8, 2.95, 0.3, 2],
  ];
  const crownColors = [COLOR.crownDark, COLOR.crownMid, COLOR.crownLight];
  for (const [x, y, r, c] of crown) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(crownColors[c]));
    ball.position.set(x, y, 0);
    root.add(ball);
  }

  // 4) Ojos de remolacha, aplastados para quedar medio embebidos en el tronco.
  for (const x of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), mat(COLOR.eye));
    eye.position.set(x, 2.39, 0.33);
    eye.scale.set(1, 0.78, 0.5);
    root.add(eye);
  }

  // 5) Cejas enojadas: inclinadas hacia adentro.
  root.add(bar([-0.31, 2.57], [-0.08, 2.47], 0.06, COLOR.brow, 0.36));
  root.add(bar([0.31, 2.57], [0.08, 2.47], 0.06, COLOR.brow, 0.36));

  // 6) Boca oscura con dientes de sésamo negro.
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.05), mat(COLOR.mouth));
  mouth.position.set(0, 1.99, 0.35);
  root.add(mouth);
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(COLOR.sesame));
    tooth.position.set(-0.16 + i * 0.08, 2.03, 0.37);
    root.add(tooth);
  }

  return root;
}
