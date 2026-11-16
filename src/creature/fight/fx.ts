/**
 * Efectos de golpe en 3D (G3): partículas blandas con textura de humo procedural (4 variantes), chispas y destello en estrella
 * aditivos, y onda sobre la tabla. Todo en dos `Points` con su shader (una sola llamada de dibujo por tipo), con un tope de
 * partículas vivas: si se llena, las nuevas reemplazan a las más viejas.
 */
import * as THREE from 'three';

const MAX = 300;

/** Atlas 2×2 de 256 px: 4 manchas de humo con ruido (para que ninguna bocanada sea igual). */
function smokeAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Ruido de valor en una grilla chica, suavizado (alcanza para el borde irregular del humo).
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 17 * 17 }, rnd));
  const vn = (v: number, x: number, y: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const at = (i: number, j: number): number => grid[v][((j % 16) * 17 + (i % 16))];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
  };
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * 128, oy = Math.floor(v / 2) * 128;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const dx = x / 64 - 1, dy = y / 64 - 1;
      const r = Math.hypot(dx, dy);
      const n = 0.55 * vn(v, x / 16, y / 16) + 0.3 * vn(v, x / 8 + 3, y / 8) + 0.15 * vn(v, x / 4, y / 4 + 5);
      const a = Math.max(0, 1 - r / (0.55 + 0.45 * n)) ** 1.6;
      const i = ((oy + y) * 256 + ox + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * a * (0.6 + 0.4 * n));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Atlas 2×2: estrella irregular de impacto, chispa redonda, anillo (onda) y punto blando. */
function glowAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const cell = (i: number, draw: (cx: number, cy: number) => void): void => draw((i % 2) * 128 + 64, Math.floor(i / 2) * 128 + 64);
  cell(0, (cx, cy) => {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 60);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,240,200,0.8)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = grad;
    g.beginPath();
    const spikes = 9;
    for (let k = 0; k <= spikes * 2; k++) {
      const a = (k / (spikes * 2)) * Math.PI * 2;
      const r = k % 2 ? 10 + 6 * Math.sin(k * 3.1) : 44 + 16 * Math.sin(k * 1.7);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.fill();
  });
  cell(1, (cx, cy) => {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,230,170,0.7)');
    grad.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = grad;
    g.fillRect(cx - 64, cy - 64, 128, 128);
  });
  cell(2, (cx, cy) => {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 7;
    g.shadowColor = 'white';
    g.shadowBlur = 10;
    g.beginPath();
    g.arc(cx, cy, 50, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
  });
  cell(3, (cx, cy) => {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 60);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(cx - 64, cy - 64, 128, 128);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface P {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  grow: number;
  alpha: number;
  color: THREE.Color;
  cell: number;
  rot: number;
  spin: number;
  drag: number;
  gravity: number;
}

const VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aCell; attribute float aRot;
uniform float uScale;
varying float vAlpha; varying vec3 vColor; varying float vCell; varying float vRot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  vAlpha = aAlpha; vColor = aColor; vCell = aCell; vRot = aRot;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha; varying vec3 vColor; varying float vCell; varying float vRot;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec2 cell = vec2(mod(vCell, 2.0), floor(vCell / 2.0));
  vec4 t = texture2D(uMap, (cell + vec2(uv.x, 1.0 - uv.y)) * 0.5);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
}`;

class Pool {
  readonly points: THREE.Points;
  private list: P[] = [];
  private geo = new THREE.BufferGeometry();
  private a = {
    pos: new Float32Array(MAX * 3),
    size: new Float32Array(MAX),
    alpha: new Float32Array(MAX),
    color: new Float32Array(MAX * 3),
    cell: new Float32Array(MAX),
    rot: new Float32Array(MAX),
  };
  readonly mat: THREE.ShaderMaterial;
  constructor(map: THREE.Texture, additive: boolean) {
    const A = this.a;
    this.geo.setAttribute('position', new THREE.BufferAttribute(A.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(A.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(A.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(A.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCell', new THREE.BufferAttribute(A.cell, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(A.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: !additive,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
  }
  add(p: P): void {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(p);
  }
  update(dt: number, ground: number): void {
    const A = this.a;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      q.v.y -= q.gravity * dt;
      q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.gravity > 0 && q.p.y < ground) {
        q.p.y = ground;
        q.v.set(q.v.x * 0.4, Math.abs(q.v.y) * 0.25, q.v.z * 0.4);
      }
      q.rot += q.spin * dt;
    }
    for (const q of this.list) {
      const t = 1 - q.life / q.max;
      A.pos.set([q.p.x, q.p.y, q.p.z], n * 3);
      A.size[n] = q.size * (1 + q.grow * t);
      // Entra rápido y se apaga suave.
      A.alpha[n] = q.alpha * Math.min(1, t * 8) * (1 - t) ** 1.3;
      A.color.set([q.color.r, q.color.g, q.color.b], n * 3);
      A.cell[n] = q.cell;
      A.rot[n] = q.rot;
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aSize', 'aAlpha', 'aColor', 'aCell', 'aRot']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
  clear(): void {
    this.list.length = 0;
    this.geo.setDrawRange(0, 0);
  }
}

export class FightFx {
  private smoke: Pool;
  private glow: Pool;
  private rnd = Math.random;
  constructor(scene: THREE.Scene, private ground: number) {
    this.smoke = new Pool(smokeAtlas(), false);
    this.glow = new Pool(glowAtlas(), true);
    scene.add(this.smoke.points, this.glow.points);
  }
  /** Humo / polvo / vapor: bocanadas blandas que se inflan, suben y se desvanecen. `dir` empuja hacia un lado. */
  puff(at: THREE.Vector3, n: number, color: number, size: number, spread: number, rise: number, dir = 0): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const r = this.rnd;
      const max = 0.7 + r() * 0.7;
      this.smoke.add({
        p: at.clone().add(new THREE.Vector3((r() - 0.5) * spread, (r() - 0.3) * spread * 0.6, (r() - 0.5) * spread * 0.6)),
        v: new THREE.Vector3((r() - 0.5) * 0.06 + dir * (0.05 + r() * 0.08), rise * (0.5 + r()), (r() - 0.5) * 0.03),
        life: max, max, size: size * 2.6 * (0.6 + r() * 0.8), grow: 1.4, alpha: 0.5 + r() * 0.3, color: c, cell: Math.floor(r() * 4), rot: r() * 6.3, spin: (r() - 0.5) * 1.2, drag: 1.5, gravity: 0,
      });
    }
  }
  /** Impacto: destello en estrella (2–3 cuadros), chispas que saltan y caen, y polvo. */
  impact(at: THREE.Vector3, power: number, blocked: boolean): void {
    const r = this.rnd;
    this.glow.add({ p: at.clone(), v: new THREE.Vector3(), life: 0.06, max: 0.06, size: 0.03 * (0.6 + power * 0.6), grow: 0.6, alpha: blocked ? 0.6 : 1, color: new THREE.Color(blocked ? 0xb8e4ff : 0xfff0d0), cell: 0, rot: r() * 6.3, spin: 0, drag: 0, gravity: 0 });
    const n = Math.round((blocked ? 5 : 12) * Math.min(2, power));
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const sp = (0.15 + r() * 0.35) * power;
      const max = 0.25 + r() * 0.3;
      this.glow.add({ p: at.clone(), v: new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp + 0.08, (r() - 0.5) * 0.15), life: max, max, size: 0.0035 + r() * 0.003, grow: -0.5, alpha: 1, color: new THREE.Color(i % 3 ? 0xffd27a : 0xffffff), cell: 1, rot: 0, spin: 0, drag: 2, gravity: 0.9 });
    }
    if (!blocked) this.puff(at, 3, 0xd9c7a8, 0.006, 0.01, 0.015);
  }
  /** Cañón de confeti (el que gana): papelitos de colores que saltan y caen. */
  confetti(at: THREE.Vector3, n = 70): void {
    const r = this.rnd;
    const cols = [0xff4d6d, 0xffd23f, 0x3ec1ff, 0x7cff6b, 0xb36bff, 0xffffff];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 1.4;
      const sp = 0.4 + r() * 0.5;
      const max = 1.4 + r();
      this.glow.add({ p: at.clone(), v: new THREE.Vector3(Math.sin(a) * sp * 0.6, -Math.cos(a) * sp, (r() - 0.5) * 0.25), life: max, max, size: 0.004 + r() * 0.003, grow: 0, alpha: 0.9, color: new THREE.Color(cols[i % cols.length]).multiplyScalar(0.7), cell: 3, rot: r() * 6, spin: (r() - 0.5) * 12, drag: 1.2, gravity: 0.35 });
    }
  }
  /** Onda: aro que crece (de frente a la cámara) — para bloqueos y poderes. */
  ring(at: THREE.Vector3, size: number, color: number): void {
    this.glow.add({ p: at.clone(), v: new THREE.Vector3(), life: 0.22, max: 0.22, size: size * 2.2, grow: 1.6, alpha: 0.8, color: new THREE.Color(color), cell: 2, rot: 0, spin: 0, drag: 0, gravity: 0 });
  }
  update(dt: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void {
    // Tamaño en píxeles: alto del buffer / 2 / tan(fov/2).
    const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const k = h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    this.smoke.mat.uniforms.uScale.value = k;
    this.glow.mat.uniforms.uScale.value = k;
    this.smoke.update(dt, this.ground);
    this.glow.update(dt, this.ground);
  }
  clear(): void {
    this.smoke.clear();
    this.glow.clear();
  }
  dispose(): void {
    this.smoke.points.removeFromParent();
    this.glow.points.removeFromParent();
  }
}
