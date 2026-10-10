import * as THREE from 'three';
import { papitaMaterial, buildChipGeometry, type ChipStyle, type PapitaParams } from './papita';

/**
 * Nacho (totopo): triángulo de tortilla de maíz con las puntas redondeadas, apenas ondulado, con
 * manchitas tostadas. Mismo generador que la papita (se clava de canto y se puede partir con B).
 */
export const NACHO_RADIUS = 0.03; // radio circunscripto (lado ≈ 5 cm)
export const NACHO_THICKNESS = 0.0018;

const NACHO_STYLE: ChipStyle = {
  radius: NACHO_RADIUS,
  thickness: NACHO_THICKNESS,
  contour: (th, noise, ox) => {
    // Triángulo en polares (circunradio 1): lados rectos y puntas apenas redondeadas (antes el tope
    // en 0,86 las cortaba tanto que se leía como un hexágono o una papita).
    const sector = (2 * Math.PI) / 3;
    const x = ((((th % sector) + sector) % sector) - sector / 2);
    const tri = 0.5 / Math.cos(x);
    const k = 0.035;
    const capped = 0.5 * (tri + 0.96 - Math.sqrt((tri - 0.96) ** 2 + k * k)); // smin(tri, 0.96)
    return capped * (1 + 0.012 * noise.noise(Math.cos(th) * 3 + ox, Math.sin(th) * 3, 1.7));
  },
  wave: [0.0009, 0.0008],
  colors: { base: '#eac46c', light: '#f5dc9a', toast: '#c58a3a' },
  edgeToast: 0.35,
  spots: 0.6,
  // Una punta hacia −X (en el plano XZ del generador).
  rotation: Math.PI / 3,
};

let sharedMaterial: THREE.MeshPhysicalMaterial | null = null;
function nachoMaterial(): THREE.MeshPhysicalMaterial {
  if (sharedMaterial) return sharedMaterial;
  // Misma textura fina que la papita, pero más mate (maíz horneado, sin aceite brillante).
  sharedMaterial = papitaMaterial().clone();
  sharedMaterial.name = 'nacho';
  sharedMaterial.clearcoat = 0.05;
  sharedMaterial.sheen = 0.25;
  sharedMaterial.sheenColor = new THREE.Color('#f8e2a8');
  return sharedMaterial;
}

/**
 * Ya en el marco 'tip' (la definición usa `keepOrientation`): la PUNTA del triángulo abajo (−Y, por
 * donde se clava), el lado opuesto arriba, la cara del chip hacia ±X.
 */
export function createNacho(seed: number, detail: 'hero' | 'prop' = 'hero', params: PapitaParams = {}): THREE.Mesh {
  const geo = buildChipGeometry(seed + 9001, detail, params, NACHO_STYLE);
  geo.rotateZ(Math.PI / 2); // punta −X → −Y; el espesor (Y) queda en X
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, nachoMaterial());
  mesh.name = 'nacho';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
