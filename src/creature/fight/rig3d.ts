import * as THREE from 'three';
import { Construction } from '../../model/Construction';
import { CHIZITO } from '../../pieces/definitions';
import type { PieceRegistry } from '../../pieces/PieceRegistry';
import type { AssetRegistry } from '../../assets/AssetRegistry';
import { poseFromData } from '../../interaction/attach';
import { fromCreatureFile } from '../../persistence/CreatureFile';
import { markHero } from '../../render/ContactShadow';
import { CREATURE_CONFIG } from '../config';
import { makeBasis } from '../math/basis';
import { ownMeshes } from '../resolve/measure';
import type { Pose, SimPlan, SimState } from '../sim';
import type { CreatureAnalysis } from '../types';

/**
 * La criatura REAL (las mallas del constructor) puesta en la escena de pelea. El simulador trabaja en 2D (perfil lateral);
 * acá ese resultado se lleva a la criatura 3D: el cuerpo se orienta con su frente/arriba/profundidad, se ubica donde dice la
 * simulación y cada extremidad se gira alrededor de su pivote, sobre el eje de profundidad, el ángulo que calculó la pose.
 */
export interface Rig3D {
  construction: Construction;
  pivot: THREE.Group;
  an: CreatureAnalysis;
  /** Marco local de la criatura → mundo de la vista lateral (filas f, u, s). */
  basis: THREE.Matrix4;
  limbs: { id: string; obj: THREE.Object3D; parentToRoot: THREE.Matrix4; rest: THREE.Matrix4; pivot: THREE.Vector3 }[];
  /** Para devolverlo todo como estaba. */
  home: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
}

const V = (a: readonly number[]): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);

export function makeRig(construction: Construction, pivot: THREE.Group, an: CreatureAnalysis, front: THREE.Vector3, up: THREE.Vector3): Rig3D {
  const b = makeBasis([front.x, front.y, front.z], [up.x, up.y, up.z]);
  const basis = new THREE.Matrix4().makeBasis(V(b.f), V(b.u), V(b.s)).transpose();
  pivot.updateWorldMatrix(true, true);
  const toLocal = pivot.matrixWorld.clone().invert();
  const seen = new Set<string>();
  const limbs: Rig3D['limbs'] = [];
  for (const l of an.limbs) {
    // Una vara pasante son dos extremidades sobre la MISMA pieza: una pieza no se puede girar dos veces, manda la primera.
    if (seen.has(l.rootPieceId)) continue;
    seen.add(l.rootPieceId);
    const node = construction.get(l.rootPieceId);
    if (!node?.parent) continue;
    node.object.updateMatrix();
    limbs.push({ id: l.id, obj: node.object, parentToRoot: toLocal.clone().multiply(node.parent.object.matrixWorld), rest: node.object.matrix.clone(), pivot: V(l.pivot) });
  }
  return { construction, pivot, an, basis, limbs, home: { position: pivot.position.clone(), quaternion: pivot.quaternion.clone(), scale: pivot.scale.clone() } };
}

const tmp = new THREE.Matrix4();

/** Pone la criatura 3D como la pose 2D: posición, giro de lado, rodada, encogimiento y ángulo de cada extremidad. */
export function applyRig(r: Rig3D, plan: SimPlan, st: SimState, pose: Pose, z0: number, cfg = CREATURE_CONFIG): void {
  const an = r.an;
  const pf = an.profile2D.facing;
  const O = an.profile2D.origin;
  const C = new THREE.Vector3(0, plan.comHeight, 0);
  const T = (x: number, y: number, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);
  const yaw = (flip: boolean) => new THREE.Matrix4().makeRotationY(flip ? Math.PI : 0);
  const guard = cfg.sim.guardFrames > 0 ? st.combat.guard / cfg.sim.guardFrames : 0;
  const curl = plan.defense.kind === 'curl' && guard > 0 ? 1 - (1 - cfg.sim.curlScale) * guard : 1;
  const m = T(st.x, pose.lift, z0);
  // Orden = el de `poseCreature.place`: encoger, dar vuelta, rodar, y recién ahí trasladar.
  const roll = plan.mode === 'roll' ? T(C.x, C.y).multiply(new THREE.Matrix4().makeRotationZ(st.angle)).multiply(T(-C.x, -C.y)) : new THREE.Matrix4();
  const shrink = T(C.x, C.y).multiply(new THREE.Matrix4().makeScale(curl, curl, curl)).multiply(T(-C.x, -C.y));
  m.multiply(roll).multiply(yaw(st.facing !== plan.facing)).multiply(shrink).multiply(T(-O[0] * pf, -O[1])).multiply(yaw(pf === -1)).multiply(r.basis);
  m.decompose(r.pivot.position, r.pivot.quaternion, r.pivot.scale);

  // Eje de profundidad (fila 3 de la base) en el marco de la criatura.
  const s = new THREE.Vector3(r.basis.elements[2], r.basis.elements[6], r.basis.elements[10]);
  for (const l of r.limbs) {
    const posed = pose.limbs.find((q) => q.id === l.id);
    const d = ((posed?.deltaDeg ?? 0) * Math.PI) / 180;
    if (!d) {
      l.obj.matrix.copy(l.rest);
      l.obj.matrix.decompose(l.obj.position, l.obj.quaternion, l.obj.scale);
      continue;
    }
    // Giro (en el marco raíz) de `d` alrededor del eje de profundidad `s` por el pivote; se lleva al marco del padre.
    tmp.makeTranslation(l.pivot.x, l.pivot.y, l.pivot.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(s, d))
      .multiply(new THREE.Matrix4().makeTranslation(-l.pivot.x, -l.pivot.y, -l.pivot.z));
    const local = l.parentToRoot.clone().invert().multiply(tmp).multiply(l.parentToRoot).multiply(l.rest);
    local.decompose(l.obj.position, l.obj.quaternion, l.obj.scale);
  }
}

/** Devuelve la criatura a como estaba antes de la pelea (transformación del grupo y de cada extremidad). */
export function resetRig(r: Rig3D): void {
  r.pivot.position.copy(r.home.position);
  r.pivot.quaternion.copy(r.home.quaternion);
  r.pivot.scale.copy(r.home.scale);
  for (const l of r.limbs) l.rest.decompose(l.obj.position, l.obj.quaternion, l.obj.scale);
}

export interface Enemy {
  construction: Construction;
  pivot: THREE.Group;
  dispose(): void;
}

/** Arma el rival con las MISMAS piezas y mallas del constructor (un segundo chizito con sus palitos) a partir de un archivo de criatura. */
export function buildEnemy(scene: THREE.Scene, assets: AssetRegistry, pieces: PieceRegistry, text: string): Enemy {
  const { snapshot } = fromCreatureFile(JSON.parse(text), pieces);
  const pivot = new THREE.Group();
  pivot.name = 'rival';
  const root = assets.create(CHIZITO.type, snapshot.rootSeed, 'hero');
  markHero(root);
  pivot.add(root);
  scene.add(pivot);
  const c = new Construction(CHIZITO.type, snapshot.rootSeed, pivot);
  c.front.fromArray(snapshot.front).normalize();
  c.up.fromArray(snapshot.up).normalize();
  const list = snapshot.pieces.map((p) => structuredClone(p));
  c.restore(
    list,
    (d) => {
      const o = assets.create(d.type, d.seed, 'hero', d.params);
      markHero(o);
      return o;
    },
    (d, parent) => poseFromData(d, pieces.get(d.type), parent),
  );
  return {
    construction: c,
    pivot,
    dispose() {
      pivot.removeFromParent();
      pivot.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

/** Rival vegetal (proxy): cuerpo = brócoli, brazos = zanahoria, piernas = apio. Copias tintadas de los materiales (los originales son compartidos). */
export function tintBroccoli(e: Enemy, an: CreatureAnalysis): void {
  const paint = (id: string, hex: string, mix: number): void => {
    const node = e.construction.get(id);
    if (!node) return;
    for (const m of ownMeshes(node)) {
      const swap = (mat: THREE.Material): THREE.Material => {
        const c = mat.clone() as THREE.MeshStandardMaterial;
        if (c.color) c.color.lerp(new THREE.Color(hex), mix);
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    }
  };
  paint('root', '#58c443', 0.9);
  for (const l of an.limbs) for (const id of l.pieceIds) paint(id, l.dominant === 'support' ? '#8fd05a' : '#f58a24', 0.85);
}
