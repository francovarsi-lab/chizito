import * as THREE from 'three';
import { markHero } from '../../render/ContactShadow';
import type { Pose, SimPlan, SimState } from '../sim';
import type { CreatureAnalysis } from '../types';
import { BROCCOLI_K, type SketchName } from './broccoliAnalysis';
import { createBrocoli } from './brocoli';

/** Algo que se puede poner en la escena de pelea según la pose del simulador. */
export interface Poser {
  an: CreatureAnalysis;
  /** `lean`: inclinación del cuerpo en rad (+ = hacia adelante), con el pie como eje. */
  apply(plan: SimPlan, st: SimState, pose: Pose, z0: number, lean: number): void;
  dispose(): void;
}

const ORDER: SketchName[] = ['armL', 'armR', 'legL', 'legR'];

/**
 * El brócoli 3D en la escena: de frente a la cámara (como el boceto), con cada zanahoria girando alrededor de su hombro/cadera
 * el ángulo que calculó la pose. Al darse vuelta se espeja (escala X negativa), igual que la pose 2D.
 */
export function broccoliPoser(scene: THREE.Scene, an: CreatureAnalysis, ids: Record<SketchName, string>): Poser {
  const g = createBrocoli();
  markHero(g);
  scene.add(g);
  const pf = an.profile2D.facing;
  const limbs = ORDER.map((n, i) => ({ id: ids[n], mesh: g.children[i] as THREE.Mesh, base: (g.children[i] as THREE.Mesh).quaternion.clone() }));
  const qz = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  return {
    an,
    apply(plan, st, pose, z0, lean) {
      const turned = st.facing !== plan.facing;
      g.scale.set(BROCCOLI_K * (turned ? -1 : 1), BROCCOLI_K, BROCCOLI_K);
      g.position.set(pose.x, pose.lift, z0);
      g.rotation.z = -st.facing * lean;
      for (const l of limbs) {
        const d = pose.limbs.find((q) => q.id === l.id)?.deltaDeg ?? 0;
        // Mismo giro que `poseGroup`: grados · facing, antihorario, alrededor del pivote (el origen de la malla de la zanahoria).
        l.mesh.quaternion.copy(qz.setFromAxisAngle(axis, (d * pf * Math.PI) / 180)).multiply(l.base);
      }
    },
    dispose() {
      g.removeFromParent();
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    },
  };
}
