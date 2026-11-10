import * as THREE from 'three';
import { QUAD_KEYS, ZONES } from '../creature/zones';

/**
 * Línea punteada sobre el chizito: lo divide en CABEZA (arriba, no es brazo), BRAZOS (al medio) y PIERNAS (un pedazo chico
 * abajo), y en izquierda/derecha como se ve al armarlo. Cada sección lleva su cartel con la tecla que la maneja en la pelea
 * (Q/W brazos, A/S piernas). Son las MISMAS secciones que usa la pelea (`creature/zones.ts`).
 *
 * Vive aparte de la construcción (copia el giro del chizito cada cuadro): no es una pieza, no se agarra, no entra al archivo.
 */
export class ZoneGuides {
  readonly root = new THREE.Group();
  private dots: THREE.InstancedMesh | null = null;
  private readonly mat = new THREE.MeshBasicMaterial({ color: '#fff8ec', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  private readonly dotGeo = new THREE.SphereGeometry(1, 8, 6);
  private labels: { el: HTMLElement; p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  private readonly box: HTMLElement;
  private k = 0;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly pivot: THREE.Object3D,
  ) {
    this.root.name = 'guias-de-secciones';
    this.root.matrixAutoUpdate = false;
    this.root.visible = false;
    this.root.userData.noPick = true;
    scene.add(this.root);
    this.box = document.createElement('div');
    this.box.id = 'zone-tags';
    document.body.appendChild(this.box);
  }

  /** Arma los puntos y los carteles para la forma del chizito (al arrancar y cuando cambia la semilla). */
  rebuild(model: THREE.Object3D): void {
    if (this.dots) {
      this.root.remove(this.dots);
      this.dots.dispose();
    }
    // Medida en el marco del chizito (no en el del mundo: girado, la caja del mundo sale inflada).
    this.pivot.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(this.pivot.matrixWorld).invert();
    const bb = new THREE.Box3();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      bb.union(mesh.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)));
    });
    const half = (bb.max.x - bb.min.x) / 2;
    const r = Math.max(bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 2;
    // Radio de la cápsula a la altura x (las puntas son redondas), apenas por fuera de la superficie.
    const R = (x: number): number => 1.1 * r * Math.sqrt(Math.max(0, 1 - Math.max(0, Math.abs(x) - (half - r)) ** 2 / (r * r)));
    const xLeg = ZONES.legBelow * half;
    const xHead = ZONES.headAbove * half;
    const pts: THREE.Vector3[] = [];
    for (const x of [xLeg, xHead]) {
      for (let i = 0; i < 52; i++) {
        const a = (i / 52) * Math.PI * 2;
        pts.push(new THREE.Vector3(x, Math.cos(a) * R(x), Math.sin(a) * R(x)));
      }
    }
    // Izquierda / derecha: de la punta de abajo hasta la cabeza, por adelante y por atrás.
    for (let x = -half + 0.0008; x <= xHead; x += 0.0017) for (const z of [1, -1]) pts.push(new THREE.Vector3(x, 0, z * R(x)));
    const dots = new THREE.InstancedMesh(this.dotGeo, this.mat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => dots.setMatrixAt(i, m.makeScale(0.00042, 0.00042, 0.00042).setPosition(p)));
    dots.userData.noPick = true;
    dots.frustumCulled = false;
    this.root.add(dots);
    this.dots = dots;

    // Carteles: cada sección con su tecla. Izquierda = +Y del chizito (la izquierda al armarlo, de frente).
    this.box.innerHTML = '';
    const tag = (html: string, x: number, side: number, cls = ''): void => {
      const a = (side * Math.PI) / 4;
      const n = new THREE.Vector3(0, Math.sin(a), Math.cos(a));
      const el = document.createElement('div');
      el.className = `zt ${cls}`;
      el.innerHTML = html;
      this.box.appendChild(el);
      this.labels.push({ el, p: new THREE.Vector3(x, n.y * R(x) * 1.25, n.z * R(x) * 1.25), n });
    };
    this.labels = [];
    const xArm = (xLeg + xHead) / 2;
    const xLegMid = (xLeg - half) / 2 + 0.002;
    tag('cabeza<small>no es brazo</small>', (xHead + half) / 2, 0, 'head');
    tag(`<b>${QUAD_KEYS.LA}</b>brazos izq`, xArm, 1);
    tag(`<b>${QUAD_KEYS.RA}</b>brazos der`, xArm, -1);
    tag(`<b>${QUAD_KEYS.LL}</b>piernas izq`, xLegMid, 1);
    tag(`<b>${QUAD_KEYS.RL}</b>piernas der`, xLegMid, -1);
  }

  /** `show`: se ven (con fundido). Copia el giro del chizito y ubica los carteles en pantalla. */
  update(dt: number, show: boolean): void {
    this.k += ((show ? 1 : 0) - this.k) * Math.min(1, dt * 6);
    const on = this.k > 0.02;
    this.root.visible = on;
    this.box.style.opacity = String(Math.max(0, this.k * 1.2 - 0.2));
    this.mat.opacity = 0.85 * this.k;
    if (!on) return;
    this.root.matrix.copy(this.pivot.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
    const camPos = this.camera.getWorldPosition(new THREE.Vector3());
    const nm = new THREE.Matrix3().getNormalMatrix(this.pivot.matrixWorld);
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const l of this.labels) {
      const p = l.p.clone().applyMatrix4(this.pivot.matrixWorld);
      const n = l.n.clone().applyMatrix3(nm).normalize();
      // Sólo los carteles del lado que mira a la cámara.
      const facing = n.dot(camPos.clone().sub(p).normalize());
      const v = p.project(this.camera);
      l.el.style.opacity = facing > 0.15 && v.z < 1 ? '1' : '0';
      l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }
}
