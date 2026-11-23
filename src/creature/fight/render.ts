import * as THREE from 'three';
import type { Construction, PieceNode } from '../../model/Construction';
import { markHero } from '../../render/ContactShadow';
import { ownMeshes } from '../resolve/measure';
import type { V3 } from '../types';
import { BROCCOLI_TOP, createBrocoli, syncCrownClip, type BroccoliParts } from './brocoli';
import { createEgg, createQuinoa } from './rivals3d';
import { BROCCOLI_CY, BROCCOLI_K, EGG, QUINOA, type FighterModel } from './fighter';
import type { Q } from './quat';

/** Lo que el render necesita de un luchador en un instante (se mezcla entre dos pasos para que el movimiento sea fluido). */
export interface RenderPose {
  x: number;
  y: number;
  tilt: number;
  facing: 1 | -1;
  /** rad: giro hacia la cámara de ese luchador (el mismo que usa el motor). */
  yaw: number;
  /** rad: vuelta de carnero (el huevo rodando), se suma a la inclinación. */
  roll: number;
  qs: Q[];
  broken: string[];
  /** Coraza de granos que le falta (quinoa): 0..1 de lo que tiró. */
  armorLoss: number;
  /** Poder que está cargando o soltando (o null). */
  power: string | null;
  /** Vida (para la fase 2 del huevo: se raja; la quinoa se achica). */
  hp?: number;
  /** Ataque hecho a mano en curso y su cuadro (el derrumbe de la quinoa se dibuja aplastado). */
  mv?: string | null;
  mvT?: number;
  /** Guardia 0..1 y si está aguantando un golpe (bloqueo): se dibuja agachado, echado adelante y haciendo fuerza. */
  guard?: number;
  block?: number;
}

export function blendPose(a: RenderPose, b: RenderPose, t: number): RenderPose {
  if (t >= 1 || a.facing !== b.facing) return b;
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    tilt: a.tilt + (b.tilt - a.tilt) * t,
    // Una vuelta entera vuelve a 0: ahí no se mezcla (si no, por un cuadro desharía la vuelta).
    yaw: Math.abs(b.yaw - a.yaw) > Math.PI ? b.yaw : a.yaw + (b.yaw - a.yaw) * t,
    roll: Math.abs(b.roll - a.roll) > Math.PI ? b.roll : a.roll + (b.roll - a.roll) * t,
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
  /** Golpe recibido: destello blanco (0..1) y vibración (m). */
  hurt(flash: number, shake: number): void;
  /** Un escudo recibe un golpe: se achica hacia donde está clavado (se va astillando). Devuelve su centro en el mundo (para las migas). */
  chip(pieceId: string, left01: number): THREE.Vector3 | null;
  /** Un escudo se rompe: desaparece (queda en migas). Devuelve su centro en el mundo. */
  shatter(pieceId: string): THREE.Vector3 | null;
  /** Vuelve a poner los escudos enteros (round nuevo). */
  reattach(): void;
  /** Punto de mundo de la cabeza (para las estrellitas de mareo). */
  head(): THREE.Vector3;
  /** Gesto de la cara, si tiene una armada (el brócoli): boca abierta 0..1 y cejas (−1 furia, abajo; +1 arriba). */
  /** `dead`: noqueado (ojos cerrados, sin pupila ni brillo, boca floja). `sick` (0..1): olió el olor a pata (asco: ojos
   *  entrecerrados y torcidos, cejas arriba, boca fruncida que tiembla). */
  face?(open: number, brow: number, dead?: boolean, sick?: number, effort?: number): void;
  dispose(): void;
}

const V = (a: readonly number[]): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);
/** Giro de la vista según el lado: la cara hacia el rival, girada `yaw` hacia la cámara (mismo criterio que el motor). */
const yawFor = (facing: 1 | -1, yaw: number): number => (facing > 0 ? -yaw : -Math.PI + yaw);
const tmpM = new THREE.Matrix4();
/** Lleva `psi` hacia `target` por el camino corto (una vuelta entera de 2π no se desenrolla). */
const chase = (psi: number, target: number, k: number): number => {
  const d = target - psi;
  return psi + (d - Math.PI * 2 * Math.round(d / (Math.PI * 2))) * k;
};

/**
 * Vibración del cuerpo blando (`freq` Hz, se apaga con `decay`): la gelatina del huevo tiembla al recibir; la quinoa apenas se
 * abolla (los granos absorben el golpe y vuelven a su lugar).
 */
class Jiggle {
  a = 0;
  ph = 0;
  constructor(private freq: number, private decay: number) {}
  kick(s: number): void {
    this.a = Math.min(0.2, this.a + s);
    this.ph = 0;
  }
  step(dt: number): number {
    this.a *= Math.exp(-dt * this.decay);
    this.ph += dt * this.freq * Math.PI * 2;
    return this.a * Math.sin(this.ph);
  }
}

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

/** Destello blanco (emisivo) y vibración del que recibe un golpe. Guarda y devuelve el emisivo original de cada material. */
class Hurt {
  // Cada malla recibe su PROPIA copia del material: el original es compartido (bowl de chizitos, otros palitos) y el
  // destello no tiene que encenderlos. Mismos parámetros → mismo programa de shader, no compila nada nuevo.
  private meshes: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }[] = [];
  private mats: { m: THREE.MeshStandardMaterial; color: THREE.Color; i: number }[] = [];
  flash = 0;
  shake = 0;
  readonly offset = new THREE.Vector3();
  constructor(root: THREE.Object3D) {
    const copies = new Map<THREE.Material, THREE.Material>();
    const own = (m: THREE.Material): THREE.Material => {
      if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m;
      let c = copies.get(m);
      if (!c) {
        // Las varas con plano de recorte ya tienen copia propia (y clonarla copiaría el plano, que dejaría de moverse).
        c = m.clippingPlanes?.length ? m : m.clone();
        // clone() no copia los ajustes de shader (zanahoria naranja, látigo del huevo): se los pasa a mano.
        if (c !== m) {
          c.onBeforeCompile = m.onBeforeCompile;
          c.customProgramCacheKey = m.customProgramCacheKey;
        }
        copies.set(m, c);
        const sm = c as THREE.MeshStandardMaterial;
        this.mats.push({ m: sm, color: sm.emissive.clone(), i: sm.emissiveIntensity });
      }
      return c;
    };
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      this.meshes.push({ mesh, original: mesh.material });
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    });
  }
  step(dt: number): void {
    this.flash *= Math.exp(-dt * 16);
    this.shake *= Math.exp(-dt * 22);
    for (const { m, color, i } of this.mats) {
      if (this.flash > 0.01) {
        m.emissive.setRGB(1, 1, 1);
        m.emissiveIntensity = this.flash * 0.9;
      } else {
        m.emissive.copy(color);
        m.emissiveIntensity = i;
      }
    }
    this.offset.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0);
  }
  restore(): void {
    for (const { mesh, original } of this.meshes) mesh.material = original;
    for (const { m } of this.mats) if (!m.clippingPlanes?.length) m.dispose();
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
  let brace = 0;
  const squash = new Squash();
  const hurt = new Hurt(pivot);
  const ry = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  const lr = new THREE.Matrix4();
  const tr = new THREE.Matrix4();
  const tq = new THREE.Quaternion();
  const sc = new THREE.Matrix4();

  return {
    root: pivot,
    apply(p, z0, dt) {
      // Cubriéndose se abre hacia la cámara (de perfil no se entendía la guardia).
      const target = yawFor(p.facing, p.yaw + 0.5 * brace);
      if (!psiInit) {
        psi = target;
        psiInit = true;
      }
      // Giro real (no espejo) al cambiar de lado: pasa mostrando la cara a la cámara.
      psi = chase(psi, target, Math.min(1, dt * 14));
      const s = squash.step(dt);
      hurt.step(dt);
      brace += (Math.max(p.guard ?? 0, p.block ?? 0) - brace) * Math.min(1, dt * 12);
      // Cubriéndose: se achica (agachado) y se echa hacia el golpe; aguantando uno, tiembla.
      const bs = brace * 0.1;
      sc.makeScale(1 - s * 0.5 + bs * 0.4, (1 + s) * (1 - bs), 1 - s * 0.5 + bs * 0.4);
      const W = new THREE.Matrix4()
        .makeTranslation(p.x + hurt.offset.x, p.y + hurt.offset.y, z0)
        .multiply(rz.makeRotationZ(-p.facing * (p.tilt + p.roll + 0.14 * brace)))
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
    hurt(f, sh) {
      hurt.flash = Math.max(hurt.flash, f);
      hurt.shake = Math.max(hurt.shake, sh);
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
      hurt.restore();
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
  const K = BROCCOLI_K;
  const inner = createBrocoli({ level, parts });
  inner.userData.mouthTop = 2.05;
  inner.userData.top = BROCCOLI_TOP;
  return modelView(scene, model, inner, new THREE.Matrix4().makeScale(K, K, K).multiply(new THREE.Matrix4().makeTranslation(0, -BROCCOLI_CY, 0)));
}

/** El rival de cada nivel: 1 EL BROCOLOCO, 2 HUEVO DURO, 3 MONSTRUO DE QUINOA (estos dos en metros, con el origen en su centro). */
export function rivalView(scene: THREE.Scene, model: FighterModel, level: number, parts: BroccoliParts | null = null): FighterView {
  if (level === 2) return modelView(scene, model, createEgg(), new THREE.Matrix4().makeTranslation(0, -EGG.cy, 0));
  if (level >= 3) return modelView(scene, model, createQuinoa(), new THREE.Matrix4().makeTranslation(0, -QUINOA.cy, 0));
  return broccoliView(scene, model, level, parts);
}

/**
 * Un rival armado por partes (`inner`): las 4 primeras hijas son las extremidades (articuladas en su punto de clavado), la cara
 * tiene 'boca', 'dientes' y 'ceja' para los gestos, y `userData` dice dónde está el borde de arriba de la boca (`mouthTop`), la
 * coronilla (`top`), si es gelatinoso (`jelly`, multiplica el aplastón) y si tiene 'aura' que gira (el poder de la quinoa).
 * `base` lleva del marco del modelo a uno con el origen local del luchador.
 */
function modelView(scene: THREE.Scene, model: FighterModel, inner: THREE.Group, base: THREE.Matrix4): FighterView {
  const outer = new THREE.Group();
  outer.matrixAutoUpdate = false;
  outer.add(inner);
  markHero(outer);
  scene.add(outer);
  const b = model.basis;
  const B = new THREE.Matrix4().makeBasis(V(b.f), V(b.u), V(b.s)).transpose();
  const Bq = new THREE.Quaternion().setFromRotationMatrix(B);
  const BqInv = Bq.clone().invert();
  const jelly = (inner.userData.jelly as number | undefined) ?? 1;
  const jig = inner.userData.jiggle as { freq: number; decay: number; amp: number } | undefined;
  const jiggle = jig ? new Jiggle(jig.freq, jig.decay) : null;
  const carrots = model.limbs.map((_, i) => ({ obj: inner.children[i], base: inner.children[i].quaternion.clone() }));
  // Brazos de látigo (huevo): cada tramo llega tarde y se pasa (resorte sobre la velocidad de giro del brazo), tope 25° por tramo.
  const k_ = (c: (typeof carrots)[number]): number => carrots.indexOf(c);
  const whips = carrots.map((c) => {
    const u = c.obj.children[0]?.userData.whip as { uJ1: { value: THREE.Vector3 }; uJ2: { value: THREE.Vector3 } } | undefined;
    // Quinoa: codo/rodilla ('q-codo'); huevo: el látigo del espárrago. Los dos se doblan como un CODO de verdad: sobre UN eje,
    // hacia el frente de la cara (las rodillas hacia atrás) y nunca al revés (antes el resorte doblaba para cualquier lado).
    const elbow = c.obj.getObjectByName('q-codo') ?? null;
    if (!u && !elbow) return null;
    const arm = model.limbs[k_(c)].role === 'arm';
    const front = new THREE.Vector3(0, 0, arm ? 1 : -1).applyQuaternion(c.obj.quaternion.clone().invert());
    const axis = new THREE.Vector3(0, 1, 0).cross(front);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    // Flexión de reposo: codos doblados (puños adelante), rodillas apenas.
    const rest = elbow ? (arm ? 0.75 : 0.25) : 0.45;
    return { u, elbow, axis, rest, arm, prev: c.obj.quaternion.clone(), th: rest, v: 0, t: Math.random() * 6 };
  });
  const bodyGrains = inner.children.find((o) => o.name === 'cuerpo-granos') as THREE.InstancedMesh | undefined;
  const grainTotal = bodyGrains?.count ?? 0;
  const dq = new THREE.Quaternion();
  const wv = new THREE.Vector3();
  // Partes de la cara (ver `addFace`): la boca y los dientes se estiran hacia abajo desde su borde de arriba; las cejas suben o bajan.
  const faceParts = (name: string): THREE.Object3D[] => inner.children.filter((o) => o.name === name);
  const mouthParts = [...faceParts('boca'), ...faceParts('dientes')];
  const brows = faceParts('ceja');
  const eyes = faceParts('ojo').map((o) => ({ o, sy: o.scale.y, rz: o.rotation.z }));
  const MOUTH_K = (inner.userData.mouthStretch as number | undefined) ?? 1.1;
  let clock = 0;
  const eyeDots = [...faceParts('pupila'), ...faceParts('brillo')];
  const MOUTH_TOP = inner.userData.mouthTop as number;
  const TOP = inner.userData.top as number;
  const BROW_STEP = (inner.userData.browStep as number | undefined) ?? 0.05;
  let psi = 0;
  let init = false;
  let brace = 0;
  let breathT = Math.random() * 6;
  const squash = new Squash();
  const hurt = new Hurt(outer);
  const ry = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  const sc = new THREE.Matrix4();
  const tq = new THREE.Quaternion();
  return {
    root: outer,
    apply(p, z0, dt) {
      // Cubriéndose se abre hacia la cámara (de perfil no se entendía la guardia).
      const target = yawFor(p.facing, p.yaw + 0.5 * brace);
      if (!init) {
        psi = target;
        init = true;
      }
      psi = chase(psi, target, Math.min(1, dt * 14));
      const s = squash.step(dt);
      const j = jiggle ? jiggle.step(dt) : 0;
      hurt.step(dt);
      // La vibración alterna: se estira a lo alto y se ensancha (volumen parejo, como una gelatina).
      // Derrumbe (quinoa): se aplasta en un montón y se vuelve a armar.
      const t = p.mvT ?? 0;
      const fall = p.mv === 'derrumbe' ? (t < 30 ? Math.min(1, t / 8) : Math.max(0, 1 - (t - 30) / 14)) : 0;
      brace += (Math.max(p.guard ?? 0, p.block ?? 0) - brace) * Math.min(1, dt * 12);
      // La quinoa es una masa: respira hinchándose y se aplasta un poco al pisar (cambia de forma, no flotan pedazos).
      breathT += dt;
      const blob = bodyGrains ? 0.035 * Math.sin(breathT * 2.4) : 0;
      // Cubriéndose: agachado (más bajo y ancho) y echado hacia el golpe.
      const bs = brace * 0.12;
      sc.makeScale((1 - s * 0.5 - j * 0.5 - blob * 0.5 + bs * 0.4) * (1 + 0.45 * fall), (1 + s + j + blob) * (1 - 0.7 * fall) * (1 - bs), (1 - s * 0.5 - j * 0.5 - blob * 0.5 + bs * 0.4) * (1 + 0.45 * fall));
      if (bodyGrains) bodyGrains.count = Math.round(grainTotal * (0.45 + 0.55 * Math.max(0, Math.min(1, (p.hp ?? 100) / 100))));
      outer.matrix
        .makeTranslation(p.x + hurt.offset.x, p.y + hurt.offset.y, z0)
        .multiply(rz.makeRotationZ(-p.facing * (p.tilt + p.roll + 0.16 * brace)))
        .multiply(ry.makeRotationY(psi))
        .multiply(sc)
        .multiply(B)
        .multiply(base);
      outer.matrixWorldNeedsUpdate = true;
      outer.updateMatrixWorld(true);
      syncCrownClip(inner);
      const left = 1 - Math.min(1, p.armorLoss / 0.35);
      const charging = p.power === 'metralla';
      // Sin granos flotando: al cargar la metralla los granos se JUNTAN en los puños (crecen) y al tirarlos quedan flacos hasta
      // rearmarse.
      for (const w of whips) {
        if (!w?.elbow || !w.arm) continue;
        const want = charging ? 1.35 : 0.78 + 0.22 * left;
        const k = w.elbow.scale.x + (want - w.elbow.scale.x) * Math.min(1, dt * 8);
        w.elbow.scale.setScalar(k);
      }
      carrots.forEach((c, k) => {
        const q = p.qs[k];
        // Giro en el marco del luchador llevado al del modelo: Bᵀ · q · B.
        tq.set(q[0], q[1], q[2], q[3]);
        c.obj.quaternion.copy(BqInv).multiply(tq).multiply(Bq).multiply(c.base);
        const w = whips[k];
        if (w && dt > 0) {
          // Velocidad de giro del brazo en su propio marco (dq = prev⁻¹ · actual).
          dq.copy(w.prev).invert().multiply(c.obj.quaternion);
          const ang = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
          wv.set(dq.x, dq.y, dq.z);
          if (wv.lengthSq() > 1e-12) wv.normalize().multiplyScalar((Math.sign(dq.w) || 1) * ang / dt);
          else wv.set(0, 0, 0);
          w.prev.copy(c.obj.quaternion);
          w.t += dt;
          const sp = wv.length();
          // A dónde va el codo: su flexión de reposo, MÁS doblado cubriéndose (antebrazos delante de la cara), ESTIRADO cuando el
          // brazo se mueve rápido (la piña se estira), con un poco de retraso (llega tarde y se pasa) y respirando.
          let want = w.rest + (w.arm ? 1.0 * brace : 0.25 * brace);
          want *= 1 - Math.min(1, sp / (w.elbow ? 7 : 9)) * 0.85;
          want += -0.05 * wv.dot(w.axis) + Math.sin(w.t * (w.elbow ? 1.4 : 2)) * (w.arm ? 0.1 : 0.04);
          want = Math.max(0, Math.min(2.2, want));
          const K = w.elbow ? 110 : 150, C = w.elbow ? 11 : 12;
          const h = Math.min(dt, 1 / 30);
          w.v += ((want - w.th) * K - w.v * C) * h;
          w.th = Math.max(0, Math.min(2.3, w.th + w.v * h));
          if (w.u) {
            // Dos tramos del espárrago: una curva pareja como un brazo con codo.
            w.u.uJ1.value.copy(w.axis).multiplyScalar(w.th * 0.45);
            w.u.uJ2.value.copy(w.axis).multiplyScalar(w.th * 0.55);
          }
          if (w.elbow) w.elbow.quaternion.setFromAxisAngle(w.axis, w.th);
        }
      });
    },
    bump(st) {
      squash.kick(st * jelly);
      jiggle?.kick(Math.abs(st) * (jig?.amp ?? 0));
    },
    hurt(f, sh) {
      hurt.flash = Math.max(hurt.flash, f);
      hurt.shake = Math.max(hurt.shake, sh);
    },
    chip: () => null,
    shatter: () => null,
    reattach() {},
    head() {
      outer.updateMatrixWorld(true);
      return new THREE.Vector3(0, TOP, 0).applyMatrix4(outer.matrixWorld);
    },
    face(open, brow, dead = false, sick = 0, effort = 0) {
      clock += 1 / 60;
      // Haciendo fuerza (aguanta un golpe): ojos apretados, cejas abajo, boca cerrada y ancha, temblando.
      if (effort > 0) {
        open = 0;
        brow = -1.3 * effort + brow * (1 - effort);
      }
      // Noqueado: los ojos se cierran (rendija), sin mirada, y la boca queda floja.
      eyes.forEach((e, k) => {
        e.o.scale.y = dead ? e.sy * 0.12 : e.sy * (1 - 0.6 * sick) * (1 - 0.55 * effort);
        e.o.rotation.z = e.rz + sick * (k % 2 ? -0.35 : 0.35) * (1 + 0.3 * Math.sin(clock * 9));
      });
      for (const d of eyeDots) d.visible = !dead;
      // La boca se estira poco y los dientes no (estirados se despegaban de la cáscara del huevo como pestañas).
      const sy = 1 + MOUTH_K * Math.max(0, open) * (1 - sick);
      for (const o of mouthParts) {
        const teeth = o.name === 'dientes';
        // La boca se estira desde su borde de arriba; cada fila de dientes NO se estira: acompaña a su labio (la de arriba queda,
        // la de abajo baja con la mandíbula), así boca y dientes son un mismo movimiento.
        o.scale.y = teeth ? 1 : sy;
        o.scale.x = (1 - 0.35 * sick) * (1 + 0.18 * effort);
        o.rotation.z = 0.12 * sick * Math.sin(clock * 6) + 0.03 * effort * Math.sin(clock * 40);
        o.position.y = (MOUTH_TOP - (teeth ? ((o.userData.ty as number | undefined) ?? MOUTH_TOP) : 0)) * (1 - sy);
      }
      // Cuánto suben o bajan las cejas, en las unidades del modelo (el brócoli va en unidades del boceto; los otros, en metros).
      for (const o of brows) o.position.y = BROW_STEP * (brow * (1 - sick) + 1.2 * sick);
    },
    dispose() {
      hurt.restore();
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
