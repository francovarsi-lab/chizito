import * as THREE from 'three';
import type { Construction, PieceNode } from '../../model/Construction';
import { markHero } from '../../render/ContactShadow';
import { ownMeshes } from '../resolve/measure';
import type { V3 } from '../types';
import { BROCCOLI_TOP, createBrocoli, type BroccoliParts } from './brocoli';
import { BROCCOLI_CY, BROCCOLI_K, type FighterModel } from './fighter';
import type { Q } from './quat';
import { FIGHT } from './tuning';

/** Lo que el render necesita de un luchador en un instante (se mezcla entre dos pasos para que el movimiento sea fluido). */
export interface RenderPose {
  x: number;
  y: number;
  tilt: number;
  facing: 1 | -1;
  qs: Q[];
  broken: string[];
}

export function blendPose(a: RenderPose, b: RenderPose, t: number): RenderPose {
  if (t >= 1 || a.facing !== b.facing) return b;
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    tilt: a.tilt + (b.tilt - a.tilt) * t,
    qs: b.qs.map((q, i) => nlerp(a.qs[i] ?? q, q, t)),
  };
}

function nlerp(a: Q, b: Q, t: number): Q {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const r: Q = [a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t, a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t];
  const l = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
  return [r[0] / l, r[1] / l, r[2] / l, r[3] / l];
}

export interface FighterView {
  /** El objeto raíz en la escena (para las sombras del escenario). */
  root: THREE.Object3D;
  apply(p: RenderPose, z0: number, dt: number): void;
  /** Aplastón de impacto (0..1): el cuerpo se achata y rebota. */
  bump(strength: number): void;
  /** Un escudo recibe un golpe: se achica hacia donde está clavado (se va astillando). Devuelve su centro en el mundo (para las migas). */
  chip(pieceId: string, left01: number): THREE.Vector3 | null;
  /** Un escudo se rompe: desaparece (queda en migas). Devuelve su centro en el mundo. */
  shatter(pieceId: string): THREE.Vector3 | null;
  /** Vuelve a poner los escudos enteros (round nuevo). */
  reattach(): void;
  /** Punto de mundo de la cabeza (para las estrellitas de mareo). */
  head(): THREE.Vector3;
  dispose(): void;
}

const V = (a: readonly number[]): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);
/** Giro de la vista según el lado: de perfil, con la cara hacia el rival y girada `stanceYaw` hacia la cámara (mismo criterio que el motor). */
const yawFor = (facing: 1 | -1): number => (facing > 0 ? -FIGHT.stanceYaw : -Math.PI + FIGHT.stanceYaw);
const tmpM = new THREE.Matrix4();

/** Resorte de aplastón compartido por las dos vistas. */
class Squash {
  v = 0;
  x = 0;
  kick(s: number): void {
    this.v -= s * 9;
  }
  step(dt: number): number {
    const k = 900;
    const c = 24;
    // Subpasos de 1/240 s: con el cuadro de un juego lento (< ~24 fps) el resorte divergía, oscilando con signo alternado,
    // y la criatura se agrandaba titilando hasta salirse de la pantalla.
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-k * this.x - c * this.v) * h;
      this.x += this.v * h;
    }
    this.x = Math.max(-0.25, Math.min(0.25, this.x));
    return this.x;
  }
}

/**
 * La criatura REAL del constructor: el mismo grupo (`pivot`) con todas sus mallas. El cuerpo se ubica según el motor
 * (posición, inclinación, giro de 180° animado) y cada extremidad gira alrededor de su punto de clavado. La parte de la vara
 * que queda adentro del chizito se recorta con un plano (si no, al girar mucho asomaría del otro lado).
 */
export function creatureView(construction: Construction, pivot: THREE.Group, model: FighterModel, renderer: THREE.WebGLRenderer): FighterView {
  const b = model.basis;
  const B = new THREE.Matrix4().makeBasis(V(b.f), V(b.u), V(b.s)).transpose();
  const Binv = B.clone().transpose();
  const O = V(model.origin);
  const home = { position: pivot.position.clone(), quaternion: pivot.quaternion.clone(), scale: pivot.scale.clone(), parent: pivot.parent };
  pivot.updateWorldMatrix(true, true);
  const toRoot = pivot.matrixWorld.clone().invert();
  const clipWas = renderer.localClippingEnabled;
  renderer.localClippingEnabled = true;

  interface LimbRig {
    node: PieceNode;
    parentToRoot: THREE.Matrix4;
    rest: THREE.Matrix4;
    pivotRoot: THREE.Vector3;
    clip: { plane: THREE.Plane; point: THREE.Vector3; normal: THREE.Vector3 } | null;
    mats: { mesh: THREE.Mesh; was: THREE.Material | THREE.Material[] }[];
  }
  const limbs: (LimbRig | null)[] = model.limbs.map((l) => {
    const node = construction.get(l.id);
    if (!node?.parent) return null;
    node.object.updateMatrix();
    const pr = V(l.pivot);
    const pivotRoot = O.clone().add(V(b.f).multiplyScalar(pr.x)).add(V(b.u).multiplyScalar(pr.y)).add(V(b.s).multiplyScalar(pr.z));
    const rig: LimbRig = { node, parentToRoot: toRoot.clone().multiply(node.parent.object.matrixWorld), rest: node.object.matrix.clone(), pivotRoot, clip: null, mats: [] };
    if (l.clip) {
      const plane = new THREE.Plane();
      rig.clip = { plane, point: V(l.clip.point), normal: V(l.clip.normal).normalize() };
      for (const mesh of ownMeshes(node)) {
        rig.mats.push({ mesh, was: mesh.material });
        const clone = (m: THREE.Material): THREE.Material => {
          const c = m.clone();
          c.clippingPlanes = [plane];
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      }
    }
    return rig;
  });

  // Escudos (papitas, nachos): su escala de fábrica, para astillarlos y devolverlos enteros.
  const shieldHome = new Map<string, { node: PieceNode; scale: THREE.Vector3 }>();
  for (const id of Object.keys(model.shields)) {
    const node = construction.get(id);
    if (node) shieldHome.set(id, { node, scale: node.object.scale.clone() });
  }
  const centerOf = (o: THREE.Object3D): THREE.Vector3 => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());

  let psi = 0;
  let psiInit = false;
  const squash = new Squash();
  const ry = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  const lr = new THREE.Matrix4();
  const tr = new THREE.Matrix4();
  const tq = new THREE.Quaternion();
  const sc = new THREE.Matrix4();

  return {
    root: pivot,
    apply(p, z0, dt) {
      const target = yawFor(p.facing);
      if (!psiInit) {
        psi = target;
        psiInit = true;
      }
      // Giro real (no espejo) al cambiar de lado: pasa mostrando la cara a la cámara.
      psi += (target - psi) * Math.min(1, dt * 14);
      const s = squash.step(dt);
      sc.makeScale(1 - s * 0.5, 1 + s, 1 - s * 0.5);
      const W = new THREE.Matrix4()
        .makeTranslation(p.x, p.y, z0)
        .multiply(rz.makeRotationZ(-p.facing * p.tilt))
        .multiply(ry.makeRotationY(psi))
        .multiply(sc)
        .multiply(B)
        .multiply(new THREE.Matrix4().makeTranslation(-O.x, -O.y, -O.z));
      W.decompose(pivot.position, pivot.quaternion, pivot.scale);
      pivot.updateMatrixWorld(true);
      model.limbs.forEach((_, k) => {
        const r = limbs[k];
        if (!r) return;
        const q = p.qs[k];
        tq.set(q[0], q[1], q[2], q[3]);
        // Giro (marco local del luchador) llevado al marco raíz de la criatura, alrededor del pivote.
        lr.makeRotationFromQuaternion(tq);
        const Rroot = Binv.clone().multiply(lr).multiply(B);
        tr.makeTranslation(r.pivotRoot.x, r.pivotRoot.y, r.pivotRoot.z).multiply(Rroot).multiply(tmpM.makeTranslation(-r.pivotRoot.x, -r.pivotRoot.y, -r.pivotRoot.z));
        const local = r.parentToRoot.clone().invert().multiply(tr).multiply(r.parentToRoot).multiply(r.rest);
        local.decompose(r.node.object.position, r.node.object.quaternion, r.node.object.scale);
        if (r.clip) {
          const n = r.clip.normal.clone().applyMatrix4(Rroot.clone().setPosition(0, 0, 0)).transformDirection(pivot.matrixWorld);
          const pt = r.clip.point.clone().applyMatrix4(tr).applyMatrix4(pivot.matrixWorld).addScaledVector(n, -0.0004);
          r.clip.plane.setFromNormalAndCoplanarPoint(n, pt);
        }
      });
    },
    bump(st) {
      squash.kick(st);
    },
    chip(id, left01) {
      const h = shieldHome.get(id);
      if (!h) return null;
      // El origen de la pieza es por donde entra: achicarla ahí es comerle el borde de afuera.
      h.node.object.scale.copy(h.scale).multiplyScalar(0.5 + 0.5 * Math.max(0, left01));
      return centerOf(h.node.object);
    },
    shatter(id) {
      const h = shieldHome.get(id);
      if (!h || !h.node.object.visible) return null;
      const c = centerOf(h.node.object);
      h.node.object.visible = false;
      return c;
    },
    reattach() {
      for (const h of shieldHome.values()) {
        h.node.object.visible = true;
        h.node.object.scale.copy(h.scale);
      }
    },
    head() {
      const top = model.body[0].b[1] > model.body[0].a[1] ? model.body[0].b : model.body[0].a;
      const v = O.clone().add(V(b.f).multiplyScalar(top[0])).add(V(b.u).multiplyScalar(top[1] + model.body[0].r + 0.004)).add(V(b.s).multiplyScalar(top[2]));
      return v.applyMatrix4(pivot.matrixWorld);
    },
    dispose() {
      this.reattach();
      home.parent?.add(pivot);
      pivot.position.copy(home.position);
      pivot.quaternion.copy(home.quaternion);
      pivot.scale.copy(home.scale);
      for (const r of limbs) {
        if (!r) continue;
        r.rest.decompose(r.node.object.position, r.node.object.quaternion, r.node.object.scale);
        for (const m of r.mats) {
          const cur = m.mesh.material;
          (Array.isArray(cur) ? cur : [cur]).forEach((c) => c.dispose());
          m.mesh.material = m.was;
        }
      }
      renderer.localClippingEnabled = clipWas;
    },
  };
}

/**
 * EL BROCOLOCO: de perfil como la criatura (la cara hacia el rival, en 3/4 hacia la cámara) y con giro real al cambiar de lado.
 * Brazos y piernas de zanahoria articulados en su punto de entrada al tallo.
 */
export function broccoliView(scene: THREE.Scene, model: FighterModel, level = 1, parts: BroccoliParts | null = null): FighterView {
  const outer = new THREE.Group();
  outer.matrixAutoUpdate = false;
  const inner = createBrocoli({ level, parts });
  outer.add(inner);
  markHero(outer);
  scene.add(outer);
  const K = BROCCOLI_K;
  const b = model.basis;
  const B = new THREE.Matrix4().makeBasis(V(b.f), V(b.u), V(b.s)).transpose();
  const Bq = new THREE.Quaternion().setFromRotationMatrix(B);
  const BqInv = Bq.clone().invert();
  const base = new THREE.Matrix4().makeScale(K, K, K).multiply(new THREE.Matrix4().makeTranslation(0, -BROCCOLI_CY, 0));
  const carrots = model.limbs.map((_, i) => ({ obj: inner.children[i], base: inner.children[i].quaternion.clone() }));
  let psi = 0;
  let init = false;
  const squash = new Squash();
  const ry = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  const sc = new THREE.Matrix4();
  const tq = new THREE.Quaternion();
  return {
    root: outer,
    apply(p, z0, dt) {
      const target = yawFor(p.facing);
      if (!init) {
        psi = target;
        init = true;
      }
      psi += (target - psi) * Math.min(1, dt * 14);
      const s = squash.step(dt);
      sc.makeScale(1 - s * 0.5, 1 + s, 1 - s * 0.5);
      outer.matrix
        .makeTranslation(p.x, p.y, z0)
        .multiply(rz.makeRotationZ(-p.facing * p.tilt))
        .multiply(ry.makeRotationY(psi))
        .multiply(sc)
        .multiply(B)
        .multiply(base);
      outer.matrixWorldNeedsUpdate = true;
      carrots.forEach((c, k) => {
        const q = p.qs[k];
        // Giro en el marco del luchador llevado al del modelo: Bᵀ · q · B.
        tq.set(q[0], q[1], q[2], q[3]);
        c.obj.quaternion.copy(BqInv).multiply(tq).multiply(Bq).multiply(c.base);
      });
    },
    bump(st) {
      squash.kick(st);
    },
    chip: () => null,
    shatter: () => null,
    reattach() {},
    head() {
      outer.updateMatrixWorld(true);
      return new THREE.Vector3(0, BROCCOLI_TOP, 0).applyMatrix4(outer.matrixWorld);
    },
    dispose() {
      outer.removeFromParent();
      outer.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.userData.shared) return;
        if (m.userData.ownGeometry !== false) m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    },
  };
}

export const v3 = (a: V3): THREE.Vector3 => V(a);
