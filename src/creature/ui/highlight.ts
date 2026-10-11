import * as THREE from 'three';
import type { Construction } from '../../model/Construction';
import { ownMeshes } from '../resolve/measure';
import type { CreatureAnalysis } from '../types';
import { DECO_COLOR, ROLE_COLOR } from './colors';

interface Tinted {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  clones: THREE.Material[];
}

/**
 * Resalta por color las extremidades en la escena 3D (rojo golpea, verde apoya, azul defiende, gris alcanza). Cada malla recibe
 * una COPIA tintada de su material (los materiales del chizito y del palito son compartidos: no se pueden pintar en el lugar) y
 * `clear()` devuelve los originales. No usa los campos de `Ghost` para no pisar la selección del juego.
 */
export class LimbHighlighter {
  private tinted: Tinted[] = [];

  /** `hover` = id de una extremidad o de una pieza decorativa sobre la que está el mouse: se resalta más fuerte. */
  apply(construction: Construction, analysis: CreatureAnalysis, hover: string | null = null): void {
    this.clear();
    for (const limb of analysis.limbs) {
      const color = ROLE_COLOR[limb.dominant ?? 'none'];
      const strong = hover === limb.id;
      for (const id of limb.pieceIds) {
        const node = construction.get(id);
        if (node) for (const m of ownMeshes(node)) this.tint(m, color, strong ? 0.9 : 0.6, strong ? 0.7 : 0.5);
      }
    }
    if (hover) {
      const deco = analysis.decorative.find((d) => d.pieceId === hover);
      const node = deco ? construction.get(deco.pieceId) : undefined;
      if (node) for (const m of ownMeshes(node)) this.tint(m, DECO_COLOR, 0.9, 0.6);
    }
  }

  private tint(mesh: THREE.Mesh, hex: string, emissive: number, mix: number): void {
    // Si el juego está resaltando o "fantasmeando" esta malla, no se toca.
    if (mesh.userData.ghostOriginal || mesh.userData.hlOriginal) return;
    if (this.tinted.some((t) => t.mesh === mesh)) return;
    const color = new THREE.Color(hex);
    const clones: THREE.Material[] = [];
    const swap = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      const std = c as THREE.MeshStandardMaterial;
      if (std.color) std.color.lerp(color, mix);
      if (std.emissive) {
        std.emissive.copy(color);
        std.emissiveIntensity = emissive * 0.45;
      }
      clones.push(c);
      return c;
    };
    const original = mesh.material;
    mesh.material = Array.isArray(original) ? original.map(swap) : swap(original);
    this.tinted.push({ mesh, original, clones });
  }

  clear(): void {
    for (const t of this.tinted) {
      const mats = Array.isArray(t.mesh.material) ? t.mesh.material : [t.mesh.material];
      if (mats.some((m) => t.clones.includes(m))) t.mesh.material = t.original;
      for (const c of t.clones) c.dispose();
    }
    this.tinted = [];
  }

  /** Cantidad de mallas tintadas ahora (para las pruebas). */
  get count(): number {
    return this.tinted.length;
  }
}
