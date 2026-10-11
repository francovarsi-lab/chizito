import * as THREE from 'three';

/**
 * La bola del chupetín es SÓLIDA (tiene masa): ninguna pieza puede entrar en su volumen, ni al clavarla,
 * ni al apuntarla, ni al girarla o hundirla estando ya colocada. Excepción: el palito del propio chupetín
 * (su bola no cuenta contra sí mismo) atraviesa como cualquier palito. El chupetín que se clava también
 * respeta a las demás piezas (su bola no puede entrar en ellas).
 *
 * Prueba exacta: cada triángulo de la malla contra la esfera de la bola, en el espacio de la bola (así el
 * achatado y la escala del mundo quedan incluidos). Tolerancia de 0,2 mm para poder rozar.
 */
const BALL_NAME = 'bola';
const TOL = 0.0002;

const tri = new THREE.Triangle();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const closest = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();
const inv = new THREE.Matrix4();
const toBall = new THREE.Matrix4();
const sphereA = new THREE.Sphere();
const sphereB = new THREE.Sphere();

function ballRadius(ball: THREE.Mesh): number {
  return (ball.geometry as THREE.SphereGeometry).parameters?.radius ?? 0.0105;
}

function isCountable(m: THREE.Mesh): boolean {
  return m.visible && !m.userData.stroke && m.name !== 'envoltorio';
}

function inside(o: THREE.Object3D, ancestor: THREE.Object3D | null): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/** Bolas de chupetín bajo `root`, salvo las que estén dentro de `skip`. */
export function ballsIn(root: THREE.Object3D, skip: THREE.Object3D | null): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.name === BALL_NAME && !inside(m, skip)) out.push(m);
  });
  return out;
}

/** ¿Algún triángulo de `mesh` entra en el volumen de la bola? */
export function meshHitsBall(mesh: THREE.Mesh, ball: THREE.Mesh): boolean {
  if (mesh === ball) return false;
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return false;
  // Descarte rápido: esfera envolvente de la malla contra la de la bola (en mundo).
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  sphereA.copy(geo.boundingSphere!).applyMatrix4(mesh.matrixWorld);
  const r = ballRadius(ball) - TOL;
  sphereB.set(new THREE.Vector3().setFromMatrixPosition(ball.matrixWorld), ballRadius(ball) * ball.matrixWorld.getMaxScaleOnAxis());
  if (sphereA.distanceToPoint(sphereB.center) > sphereB.radius) return false;

  inv.copy(ball.matrixWorld).invert();
  toBall.multiplyMatrices(inv, mesh.matrixWorld);
  const index = geo.getIndex();
  const n = index ? index.count : pos.count;
  const r2 = r * r;
  for (let i = 0; i + 2 < n; i += 3) {
    const i0 = index ? index.getX(i) : i;
    const i1 = index ? index.getX(i + 1) : i + 1;
    const i2 = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(toBall);
    b.fromBufferAttribute(pos, i1).applyMatrix4(toBall);
    c.fromBufferAttribute(pos, i2).applyMatrix4(toBall);
    tri.set(a, b, c).closestPointToPoint(ORIGIN, closest);
    if (closest.lengthSq() < r2) return true;
  }
  return false;
}

export interface SolidBallQuery {
  /** Raíz de toda la construcción (el chizito y todo lo clavado). */
  root: THREE.Object3D;
  /** Objeto de la pieza que se está moviendo (y todo lo que lleva encima). */
  active: THREE.Object3D;
  /** Objetos de todas las piezas del árbol: sirven para saber a qué pieza pertenece cada malla. */
  pieceObjects: Set<THREE.Object3D>;
  /** Objeto de la pieza donde se clava (su superficie la maneja el tope de clavado, no esta prueba). */
  parent: THREE.Object3D | null;
}

/**
 * Devuelve la bola contra la que choca la pieza activa (o null). Dos sentidos:
 *  - toda malla de la pieza activa contra las bolas de OTROS chupetines;
 *  - si la activa es un chupetín, su bola contra las mallas de las demás piezas (menos las de su padre).
 */
export function findBallHit(q: SolidBallQuery): THREE.Mesh | null {
  q.root.updateMatrixWorld(true);
  const others = ballsIn(q.root, q.active);
  if (others.length) {
    let hit: THREE.Mesh | null = null;
    q.active.traverse((o) => {
      const m = o as THREE.Mesh;
      if (hit || !m.isMesh || !isCountable(m)) return;
      for (const ball of others) {
        if (meshHitsBall(m, ball)) {
          hit = ball;
          return;
        }
      }
    });
    if (hit) return hit;
  }
  const own = ballsIn(q.active, null);
  if (!own.length) return null;
  const owner = (m: THREE.Object3D): THREE.Object3D | null => {
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (q.pieceObjects.has(p)) return p;
    return null;
  };
  let hit: THREE.Mesh | null = null;
  q.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (hit || !m.isMesh || !isCountable(m) || inside(m, q.active)) return;
    if (q.parent && owner(m) === q.parent) return;
    for (const ball of own) {
      if (meshHitsBall(m, ball)) {
        hit = ball;
        return;
      }
    }
  });
  return hit;
}
