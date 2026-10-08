import * as THREE from 'three';
import { fbm3, noise3 } from './noise';

// Real-world scale decisions (meters). Palito vuelve al largo original: con el
// tamaño acortado (3.4cm) el muñeco quedaba sin brazos reconocibles.
export const SCALE = {
  chizitoLength: 0.055,
  chizitoRadius: 0.014,
  palitoLength: 0.095,
  palitoRadius: 0.0017,
  papitaRadius: 0.025,
  papitaThickness: 0.0015,
};

function noiseCanvas(size: number, base: [number, number, number], variation: number, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm3((x / size) * scale, (y / size) * scale, 0, 4);
      const v = 1 + n * variation;
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, base[0] * v));
      img.data[i + 1] = Math.max(0, Math.min(255, base[1] * v));
      img.data[i + 2] = Math.max(0, Math.min(255, base[2] * v));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function bumpCanvas(size: number, scale: number, pits: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = fbm3((x / size) * scale, (y / size) * scale, 10, 5) * 0.5 + 0.5;
      // sparse pits (porosity)
      const p = noise3(x * 0.4, y * 0.4, 20);
      if (p > 1 - pits) n -= 0.4;
      const g = Math.max(0, Math.min(255, n * 255));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function chizitoGeometry(seed = 0): THREE.BufferGeometry {
  const L = SCALE.chizitoLength, R = SCALE.chizitoRadius;
  const geo = new THREE.CylinderGeometry(R, R, L, 14, 20, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const bend = 0.35 + noise3(seed, 0, 0) * 0.15;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / L; // -0.5..0.5 along length
    const ang = Math.atan2(z, x);
    const radial = 1 + fbm3(Math.cos(ang) * 1.5 + seed, Math.sin(ang) * 1.5, t * 3 + seed, 4) * 0.3
      + fbm3(ang * 4, t * 8, seed * 2, 3) * 0.12;
    const bendX = bend * Math.sin(t * Math.PI) * L * 0.5;
    pos.setX(i, x * radial + bendX);
    pos.setZ(i, z * radial);
    pos.setY(i, y + fbm3(ang * 2, t * 4, seed + 5, 3) * L * 0.04);
  }
  geo.computeVertexNormals();
  return geo;
}

export function chizitoMaterial(seed = 0): THREE.MeshStandardMaterial {
  const colorMap = new THREE.CanvasTexture(noiseCanvas(256, [224, 140, 60], 0.25, 6 + seed));
  const bumpMap = new THREE.CanvasTexture(bumpCanvas(256, 10, 0.15));
  return new THREE.MeshStandardMaterial({ map: colorMap, bumpMap, bumpScale: 0.0006, roughness: 0.78, metalness: 0.0 });
}

export function palitoGeometry(seed = 0): THREE.BufferGeometry {
  const L = SCALE.palitoLength, R = SCALE.palitoRadius;
  const geo = new THREE.CylinderGeometry(R, R, L, 8, 16, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const curve = (noise3(seed, 1, 1) - 0.5) * 0.08;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / L;
    const r = 1 + fbm3(x * 40 + seed, y * 10, z * 40, 3) * 0.08;
    pos.setX(i, x * r + curve * Math.sin((t + 0.5) * Math.PI) * L);
    pos.setZ(i, z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

export function palitoMaterial(seed = 0): THREE.MeshStandardMaterial {
  const colorMap = new THREE.CanvasTexture(noiseCanvas(128, [196, 150, 80], 0.2, 8 + seed));
  const bumpMap = new THREE.CanvasTexture(bumpCanvas(128, 14, 0.08));
  return new THREE.MeshStandardMaterial({ map: colorMap, bumpMap, bumpScale: 0.0003, roughness: 0.55, metalness: 0.0 });
}

export function papitaGeometry(seed = 0): THREE.BufferGeometry {
  const R = SCALE.papitaRadius, T = SCALE.papitaThickness;
  const shape = new THREE.Shape();
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = R * (1 + fbm3(Math.cos(a) * 2 + seed, Math.sin(a) * 2, seed, 3) * 0.25);
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, -T / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, pos.getY(i) + fbm3(x * 20 + seed, z * 20, seed, 3) * T * 2.5);
  }
  geo.computeVertexNormals();
  return geo;
}

export function papitaMaterial(seed = 0): THREE.MeshStandardMaterial {
  const colorMap = new THREE.CanvasTexture(noiseCanvas(128, [214, 178, 90], 0.2, 5 + seed));
  return new THREE.MeshStandardMaterial({ map: colorMap, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
}

export type PieceType = 'chizito' | 'palito' | 'papita';

export interface PieceDefinition {
  type: PieceType;
  length: number;        // along insertion axis
  radius: number;
  canPierce: boolean;     // can be driven into another piece
  canBePierced: boolean;  // other pieces can be driven into it
  minDepthOutside: number; // meters that must stay outside when fully inserted
  defaultAngleFromNormal: number; // radians, starting aim angle
  buildMesh(seed: number): THREE.Mesh;
}

export const PIECE_DEFS: Record<PieceType, PieceDefinition> = {
  chizito: {
    type: 'chizito', length: SCALE.chizitoLength, radius: SCALE.chizitoRadius,
    canPierce: false, canBePierced: true, minDepthOutside: 0, defaultAngleFromNormal: 0,
    buildMesh: (seed) => new THREE.Mesh(chizitoGeometry(seed), chizitoMaterial(seed)),
  },
  palito: {
    type: 'palito', length: SCALE.palitoLength, radius: SCALE.palitoRadius,
    canPierce: true, canBePierced: false, minDepthOutside: 0.012, defaultAngleFromNormal: 0,
    buildMesh: (seed) => new THREE.Mesh(palitoGeometry(seed), palitoMaterial(seed)),
  },
  papita: {
    type: 'papita', length: SCALE.papitaThickness * 6, radius: SCALE.papitaRadius,
    canPierce: false, canBePierced: true, minDepthOutside: SCALE.papitaRadius * 0.6, defaultAngleFromNormal: Math.PI / 2,
    buildMesh: (seed) => new THREE.Mesh(papitaGeometry(seed), papitaMaterial(seed)),
  },
};
