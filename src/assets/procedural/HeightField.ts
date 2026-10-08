import * as THREE from 'three';
import { mulberry32 } from '../../util/noise';

/**
 * Campo de alturas cuadrado y TILEABLE (todas las operaciones envuelven en los bordes).
 * Se usa para fabricar normal maps, roughness maps y variación de color por código.
 */
export class HeightField {
  readonly data: Float32Array;
  constructor(readonly size: number) {
    this.data = new Float32Array(size * size);
  }

  idx(x: number, y: number): number {
    const s = this.size;
    x = ((x % s) + s) % s;
    y = ((y % s) + s) % s;
    return y * s + x;
  }

  get(x: number, y: number): number {
    return this.data[this.idx(x, y)];
  }

  /** Ruido de valor periódico (tileable) con interpolación quíntica. `cells` = celdas por lado. */
  addPeriodicNoise(cells: number, amp: number, seed: number, octaves = 1): this {
    const rnd = mulberry32(seed);
    for (let o = 0; o < octaves; o++) {
      const c = cells << o;
      const a = amp / (1 << o) ** 0.85;
      const lattice = new Float32Array(c * c);
      for (let i = 0; i < lattice.length; i++) lattice[i] = rnd() * 2 - 1;
      const s = this.size;
      for (let y = 0; y < s; y++) {
        const fy = (y / s) * c;
        const y0 = Math.floor(fy);
        const ty = fy - y0;
        const wy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
        const r0 = (y0 % c) * c;
        const r1 = ((y0 + 1) % c) * c;
        for (let x = 0; x < s; x++) {
          const fx = (x / s) * c;
          const x0 = Math.floor(fx);
          const tx = fx - x0;
          const wx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
          const c0 = x0 % c;
          const c1 = (x0 + 1) % c;
          const top = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * wx;
          const bot = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * wx;
          this.data[y * s + x] += a * (top + (bot - top) * wy);
        }
      }
    }
    return this;
  }

  /**
   * Estampa un rasgo radial (poro, burbuja, grano) con envoltura en los bordes.
   * `profile(t)` recibe t = distancia/radio en [0,1] y devuelve el desplazamiento.
   * `aspect` estira el rasgo en X (para poros alargados en el sentido del inflado).
   */
  stamp(cx: number, cy: number, r: number, amp: number, profile: (t: number) => number, aspect = 1): void {
    const rx = r * aspect;
    const ry = r;
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / ry;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const t = Math.sqrt(dx * dx + dy * dy);
        if (t >= 1) continue;
        this.data[this.idx(x, y)] += amp * profile(t);
      }
    }
  }

  /** Normaliza a [0,1]. */
  normalize(): this {
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of this.data) {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const k = mx > mn ? 1 / (mx - mn) : 1;
    for (let i = 0; i < this.data.length; i++) this.data[i] = (this.data[i] - mn) * k;
    return this;
  }

  /** Normal map en espacio tangente (convención OpenGL, +V = +Y). `strength` en "texels de altura". */
  toNormalMap(strength: number): THREE.DataTexture {
    const s = this.size;
    const out = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (this.get(x + 1, y) - this.get(x - 1, y)) * 0.5 * strength;
        const dy = (this.get(x, y + 1) - this.get(x, y - 1)) * 0.5 * strength;
        let nx = -dx;
        let ny = -dy;
        let nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        const i = (y * s + x) * 4;
        out[i] = (nx * 0.5 + 0.5) * 255;
        out[i + 1] = (ny * 0.5 + 0.5) * 255;
        out[i + 2] = (nz * 0.5 + 0.5) * 255;
        out[i + 3] = 255;
      }
    }
    return dataTexture(out, s, THREE.NoColorSpace);
  }

  /** Mapea cada texel con `fn(h, x, y)` a un valor de 0..1 en escala de grises. */
  toGrayTexture(fn: (h: number, x: number, y: number) => number): THREE.DataTexture {
    const s = this.size;
    const out = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = Math.max(0, Math.min(1, fn(this.data[y * s + x], x, y))) * 255;
        const i = (y * s + x) * 4;
        out[i] = out[i + 1] = out[i + 2] = v;
        out[i + 3] = 255;
      }
    }
    return dataTexture(out, s, THREE.NoColorSpace);
  }

  /** Textura de color sRGB. `fn` escribe r,g,b (0..1, sRGB) en `rgb`. */
  toColorTexture(fn: (h: number, x: number, y: number, rgb: number[]) => void): THREE.DataTexture {
    const s = this.size;
    const out = new Uint8Array(s * s * 4);
    const rgb = [0, 0, 0];
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        fn(this.data[y * s + x], x, y, rgb);
        const i = (y * s + x) * 4;
        out[i] = Math.max(0, Math.min(1, rgb[0])) * 255;
        out[i + 1] = Math.max(0, Math.min(1, rgb[1])) * 255;
        out[i + 2] = Math.max(0, Math.min(1, rgb[2])) * 255;
        out[i + 3] = 255;
      }
    }
    return dataTexture(out, s, THREE.SRGBColorSpace);
  }
}

export function dataTexture(data: Uint8Array, size: number, colorSpace: THREE.ColorSpace): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Perfiles típicos para `stamp`. */
export const Profiles = {
  /** Cráter: hundido con un leve labio elevado (poro de snack inflado). */
  crater: (t: number) => {
    const bowl = -Math.pow(1 - t * t, 1.5);
    const rim = 0.35 * Math.exp(-Math.pow((t - 0.85) / 0.12, 2));
    return bowl + rim;
  },
  /** Ampolla / burbuja convexa suave. */
  blister: (t: number) => Math.pow(1 - t * t, 2),
  /** Grano pequeño y duro (sal, migas). */
  grain: (t: number) => Math.pow(1 - t, 1.2),
};
