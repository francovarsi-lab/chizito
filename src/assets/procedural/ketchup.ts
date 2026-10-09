import * as THREE from 'three';
import { mulberry32 } from '../../util/noise';
import { buildTube } from './tube';

/**
 * Ketchup: el sobrecito (herramienta para dibujar y relleno del recipiente) y los trazos que deja
 * sobre las piezas. Genérico, sin marca.
 */
export const SACHET_W = 0.026;
export const SACHET_H = 0.036;
export const KETCHUP_RADIUS = 0.0011;

let sachetMat: THREE.MeshPhysicalMaterial | null = null;
let sauceMat: THREE.MeshPhysicalMaterial | null = null;

function sachetMaterial(): THREE.MeshPhysicalMaterial {
  if (sachetMat) return sachetMat;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 356;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8473f';
  g.fillRect(0, 0, 256, 356);
  // Franja blanca ondulada y un tomatito dibujado: se lee "ketchup" aunque esté desenfocado.
  g.fillStyle = '#fff6ee';
  g.beginPath();
  g.moveTo(0, 210);
  for (let x = 0; x <= 256; x += 8) g.lineTo(x, 210 + Math.sin(x / 26) * 9);
  g.lineTo(256, 262);
  for (let x = 256; x >= 0; x -= 8) g.lineTo(x, 262 + Math.sin(x / 26 + 1) * 9);
  g.closePath();
  g.fill();
  g.fillStyle = '#c62f2a';
  g.beginPath();
  g.arc(128, 120, 48, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7fbf6a';
  g.beginPath();
  g.ellipse(128, 74, 22, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff55';
  g.beginPath();
  g.ellipse(110, 104, 12, 7, -0.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c62f2a';
  g.font = 'bold 34px Nunito, sans-serif';
  g.textAlign = 'center';
  g.fillText('KETCHUP', 128, 248);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  sachetMat = new THREE.MeshPhysicalMaterial({
    name: 'sobre-ketchup',
    map: tex,
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  return sachetMat;
}

export function ketchupMaterial(): THREE.MeshPhysicalMaterial {
  sauceMat ??= new THREE.MeshPhysicalMaterial({
    name: 'ketchup',
    color: '#b8231c',
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    sheen: 0.25,
    sheenColor: new THREE.Color('#ff8a70'),
  });
  return sauceMat;
}

/**
 * Sobrecito de ketchup: almohadita plana con los bordes sellados (crimpados). En el plano XY,
 * centrado, con el frente hacia +Z.
 */
export function createSachet(seed: number, detail: 'hero' | 'prop' = 'hero'): THREE.Mesh {
  const rnd = mulberry32(seed * 911 + 3);
  const seg = detail === 'hero' ? 24 : 8;
  const geo = new THREE.BoxGeometry(SACHET_W, SACHET_H, 1, seg, Math.round(seg * 1.4), 1);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const border = 0.0026; // borde sellado
  const fill = 0.0016 + rnd() * 0.0006; // medio espesor en el centro
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const side = Math.sign(pos.getZ(i));
    const ex = Math.max(0, (Math.abs(x) - (SACHET_W / 2 - border)) / border);
    const ey = Math.max(0, (Math.abs(y) - (SACHET_H / 2 - border)) / border);
    const inner = 1 - Math.min(1, Math.max(ex, ey));
    // Almohada: más gorda en el centro; en el borde sellado queda una lámina con dientitos.
    const px = 1 - Math.pow((2 * x) / SACHET_W, 4);
    const py = 1 - Math.pow((2 * y) / SACHET_H, 4);
    const crimp = inner <= 0 ? 0.00008 * Math.sin((x + y) * 3000) : 0;
    const t = 0.00012 + fill * Math.max(0, px * py) * THREE.MathUtils.smoothstep(inner, 0, 0.6) + crimp;
    pos.setZ(i, side * t + (rnd() - 0.5) * 0.00003);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, sachetMaterial());
  mesh.name = 'sobre-ketchup';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Sobrecito en la mano: con la esquina cortada (el pico) en el origen y el cuerpo hacia +Y. */
export function createSachetInHand(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sobre-en-la-mano';
  const s = createSachet(7, 'hero');
  s.rotation.z = Math.PI / 4;
  const half = Math.hypot(SACHET_W, SACHET_H) / 2;
  s.position.y = half * 0.92;
  g.add(s);
  // Gotita en el pico.
  const drop = new THREE.Mesh(new THREE.SphereGeometry(KETCHUP_RADIUS * 1.1, 16, 12), ketchupMaterial());
  drop.scale.set(1, 1.3, 1);
  drop.position.y = KETCHUP_RADIUS * 0.6;
  g.add(drop);
  return g;
}

/** Trazo guardado: puntos y normales (coordenadas locales de la pieza pintada), aplanados. */
export interface KetchupParams {
  points?: number[];
  normals?: number[];
}

/**
 * Cordón de ketchup que sigue los puntos sobre la superficie: tubo brillante apenas apoyado (la
 * mitad de abajo se hunde en la pieza), con puntas redondeadas y grosor que respira un poco.
 */
export function createKetchupStroke(seed: number, params: KetchupParams = {}): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  const nrm: THREE.Vector3[] = [];
  const P = params.points ?? [];
  const N = params.normals ?? [];
  for (let i = 0; i + 2 < P.length; i += 3) {
    const n = new THREE.Vector3(N[i] ?? 0, N[i + 1] ?? 1, N[i + 2] ?? 0).normalize();
    nrm.push(n);
    pts.push(new THREE.Vector3(P[i], P[i + 1], P[i + 2]).addScaledVector(n, KETCHUP_RADIUS * 0.45));
  }
  const rnd = mulberry32(seed * 131 + 9);
  const R = KETCHUP_RADIUS * (0.9 + rnd() * 0.2);
  const mat = ketchupMaterial();
  if (pts.length === 0) {
    pts.push(new THREE.Vector3());
    nrm.push(new THREE.Vector3(0, 1, 0));
  }

  // Suavizado (Chaikin, dos pasadas) para que el pulso de la mano no se note.
  let line = pts;
  for (let k = 0; k < 2 && line.length > 2; k++) {
    const out = [line[0]];
    for (let i = 0; i < line.length - 1; i++) {
      out.push(line[i].clone().lerp(line[i + 1], 0.25), line[i].clone().lerp(line[i + 1], 0.75));
    }
    out.push(line[line.length - 1]);
    line = out;
  }
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + line[i].distanceTo(line[i - 1]));
  const L = cum[cum.length - 1];

  let geo: THREE.BufferGeometry;
  if (L < R * 0.8) {
    // Un toque: gotita aplastada.
    geo = new THREE.SphereGeometry(R * 1.35, 20, 14);
    const up = nrm[0];
    geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 0.6, 1));
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up));
    geo.translate(line[0].x, line[0].y, line[0].z);
  } else {
    const avgN = nrm.reduce((a, n) => a.add(n), new THREE.Vector3()).normalize();
    const total = L + 2 * R; // con las tapas semiesféricas
    const at = (s: number, out: THREE.Vector3) => {
      const d = THREE.MathUtils.clamp(s, 0, L);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const seg = cum[i] - cum[i - 1] || 1;
      return out.copy(line[i - 1]).lerp(line[i], (d - cum[i - 1]) / seg);
    };
    // El eje sigue la línea; en las tapas se prolonga en la dirección de la punta (para que el
    // tubo tenga tangente definida hasta el polo).
    const dirA = line[1].clone().sub(line[0]).normalize();
    const dirB = line[line.length - 1].clone().sub(line[line.length - 2]).normalize();
    const center = (u: number, out: THREE.Vector3) => {
      const s = u * total - R;
      if (s < 0) return out.copy(line[0]).addScaledVector(dirA, s);
      if (s > L) return out.copy(line[line.length - 1]).addScaledVector(dirB, s - L);
      return at(s, out);
    };
    const radius = (u: number): [number, number] => {
      const s = u * total - R;
      const e = Math.min(s + R, L + R - s);
      const cap = e >= R ? 1 : Math.sqrt(Math.max(0, 1 - ((R - e) / R) ** 2));
      // Arranca un poco más finito y termina en una gotita algo más gorda.
      const taper = 0.85 + 0.15 * THREE.MathUtils.smoothstep(s, 0, 0.006) + 0.12 * THREE.MathUtils.smoothstep(s, L - 0.004, L);
      const wob = 1 + 0.06 * Math.sin(s * 900 + seed);
      const r = u <= 0 || u >= 1 ? 0 : R * cap * taper * wob;
      return [r * 0.82, r]; // apenas aplastado contra la superficie (el primer semieje va según la normal)
    };
    geo = buildTube({
      rows: Math.min(900, Math.max(12, Math.ceil(total / 0.0003))),
      cols: 14,
      center,
      radius,
      up: avgN,
    });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ketchup';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // Los trazos no se atraviesan ni se pinta encima de ellos, pero se pueden elegir (clic + Supr) y
  // borrar con la goma (Shift + mantener con el sobrecito).
  mesh.userData.stroke = true;
  return mesh;
}
