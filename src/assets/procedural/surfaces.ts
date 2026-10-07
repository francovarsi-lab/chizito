import * as THREE from 'three';
import { Simplex3, mulberry32 } from '../../util/noise';
import { HeightField, Profiles, dataTexture } from './HeightField';

/** Texturas de superficies del set: madera de la mesa, mantel de cumpleaños, cartón/papel. */

export function woodMaterial(): THREE.MeshPhysicalMaterial {
  const size = 1024;
  const n = new Simplex3(42);
  const col = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const hf = new HeightField(size);
  const light = new THREE.Color('#9a6a42');
  const dark = new THREE.Color('#5b3820');
  const c = new THREE.Color();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Vetas: anillos estirados a lo largo de U, perturbados.
      const warp = n.fbm(u * 2, v * 6, 0.5, 3) * 1.8;
      const ring = Math.sin((v * 34 + warp) * Math.PI);
      const fiber = n.noise(u * 60, v * 900, 3.3) * 0.5 + 0.5;
      let t = 0.5 + 0.35 * ring + 0.25 * (fiber - 0.5);
      t = THREE.MathUtils.clamp(t + n.fbm(u * 3, v * 3, 9, 2) * 0.25, 0, 1);
      c.copy(dark).lerp(light, t);
      const i = (y * size + x) * 4;
      col[i] = c.r * 255;
      col[i + 1] = c.g * 255;
      col[i + 2] = c.b * 255;
      col[i + 3] = 255;
      const r = 0.42 + (1 - t) * 0.18 + fiber * 0.08;
      rough[i] = rough[i + 1] = rough[i + 2] = r * 255;
      rough[i + 3] = 255;
      hf.data[y * size + x] = ring * 0.2 + fiber * 0.35;
    }
  }
  const map = dataTexture(col, size, THREE.SRGBColorSpace);
  const roughnessMap = dataTexture(rough, size, THREE.NoColorSpace);
  const normalMap = hf.toNormalMap(1.5);
  return new THREE.MeshPhysicalMaterial({
    name: 'wood',
    map,
    roughnessMap,
    normalMap,
    roughness: 1,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
  });
}

/**
 * Mantel de cumpleaños de plástico: fondo blanco con confeti impreso y arrugas suaves.
 * El tile cubre 30 cm × 30 cm.
 */
export function tableclothMaterial(): THREE.MeshPhysicalMaterial {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f3efe6';
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(2024);
  const colors = ['#e2483d', '#f2b632', '#3a8fd8', '#4bb56a', '#e86fae', '#8a5cc7'];
  const drawWrapped = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
  };
  for (let i = 0; i < 130; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const color = colors[Math.floor(rnd() * colors.length)];
    const kind = rnd();
    const r = 7 + rnd() * 9;
    const rot = rnd() * Math.PI;
    drawWrapped((ox, oy) => {
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(rot);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      if (kind < 0.45) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind < 0.75) {
        ctx.fillRect(-r * 1.4, -r * 0.35, r * 2.8, r * 0.7);
      } else {
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const rr = k % 2 ? r * 0.5 : r * 1.3;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const hf = new HeightField(512);
  hf.addPeriodicNoise(3, 1, 77, 3);
  const rnd2 = mulberry32(5);
  // Pliegues largos de mantel recién desplegado.
  for (let i = 0; i < 14; i++) hf.stamp(rnd2() * 512, rnd2() * 512, 30 + rnd2() * 40, 0.4, Profiles.blister, 6 + rnd2() * 6);
  hf.normalize();
  const normalMap = hf.toNormalMap(2.2);
  const roughnessMap = hf.toGrayTexture((h) => 0.42 + h * 0.12);

  const mat = new THREE.MeshPhysicalMaterial({
    name: 'tablecloth',
    map,
    normalMap,
    roughnessMap,
    roughness: 1,
    sheen: 0.2,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
  });
  return mat;
}

/** Tile de papel liso con fibras finas (servilletas, gorrito). */
export function paperNormal(): THREE.Texture {
  const hf = new HeightField(256);
  hf.addPeriodicNoise(16, 1, 9, 3);
  return hf.normalize().toNormalMap(1.2);
}

/** Textura de rayas para el gorrito de cumpleaños. */
export function stripesTexture(a: string, b: string, n = 8): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < n * 2; i++) {
    ctx.fillStyle = i % 2 ? a : b;
    ctx.fillRect((i * 256) / (n * 2), 0, 256 / (n * 2) + 1, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
