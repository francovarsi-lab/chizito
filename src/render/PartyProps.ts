import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, Simplex3 } from '../util/noise';

/**
 * Restos de cumpleaños sobre la mesa (mismo mundo en el constructor y en la pelea): caramelos masticables envueltos (el
 * envoltorio sale de `public/assets/fight/sugus.jpg`, generado a partir de una foto de referencia, sin marca), carozos de
 * aceituna ya comidos y servilletas usadas hechas un bollo. Medidas reales; apoyados en y = 0 de su grupo.
 */
const noise = new Simplex3(77);

/** Esfera de vértices compartidos: la del three repite vértices por cara y, deformada, sale facetada como una piedra. */
function smoothSphere(detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return mergeVertices(g);
}
let wrapper: THREE.Texture | null = null;

function wrapperTexture(): THREE.Texture {
  if (!wrapper) {
    wrapper = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/fight/sugus.jpg`);
    wrapper.colorSpace = THREE.SRGBColorSpace;
    wrapper.anisotropy = 8;
  }
  return wrapper;
}

/** Caramelo masticable envuelto (2,2 × 0,9 cm): sabor 0..4 = limón, naranja, frutilla, manzana, frambuesa. */
export function candy(flavor: number, seed = 1): THREE.Mesh {
  const geo = new RoundedBoxGeometry(0.022, 0.009, 0.022, 3, 0.0024);
  // Papel apenas arrugado: el caramelo no es una caja perfecta.
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = noise.noise(v.x * 400 + seed, v.y * 400, v.z * 400) * 0.00035;
    pos.setXYZ(i, v.x + d, v.y + d * 0.6, v.z - d);
  }
  geo.computeVertexNormals();
  const map = wrapperTexture().clone();
  map.needsUpdate = true;
  map.repeat.set(0.2, 1);
  map.offset.set((flavor % 5) * 0.2, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.25 }));
  mesh.position.y = 0.0045;
  return mesh;
}

/** Carozo de aceituna ya comido: ovalado, con surcos, húmedo. */
export function olivePit(seed = 1): THREE.Mesh {
  const geo = smoothSphere(4);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const base = new THREE.Color('#b98c69');
  const groove = new THREE.Color('#7a5238');
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const g = Math.abs(noise.noise(v.x * 3 + seed, v.y * 7, v.z * 7));
    const k = 1 - 0.06 * (1 - g);
    pos.setXYZ(i, v.x * 0.0068 * k, v.y * 0.0043 * k, v.z * 0.0046 * k);
    const c = base.clone().lerp(groove, (1 - g) * 0.7);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
  mesh.position.y = 0.004;
  return mesh;
}

/** Servilleta de papel usada, hecha un bollo, con una mancha (ketchup). */
export function napkin(seed = 1, size = 0.04): THREE.Mesh {
  const rnd = mulberry32(seed);
  const geo = smoothSphere(5);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const paper = new THREE.Color('#f3eee6');
  const stain = new THREE.Color('#c0442a');
  const spot = new THREE.Vector3(rnd() - 0.5, 0.6, rnd() - 0.5).normalize();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Arrugas: pliegues filosos (ruido "ridged") en dos escalas.
    const r1 = 1 - Math.abs(noise.noise(v.x * 2.6 + seed, v.y * 2.6, v.z * 2.6));
    const r2 = 1 - Math.abs(noise.noise(v.x * 7 + seed * 3, v.y * 7, v.z * 7));
    const k = 0.72 + 0.32 * r1 * r1 + 0.1 * r2 * r2;
    pos.setXYZ(i, v.x * k * size * 0.5, v.y * k * size * 0.33, v.z * k * size * 0.45);
    const s = THREE.MathUtils.smoothstep(v.dot(spot), 0.55, 0.85) * (0.6 + 0.4 * r2);
    const c = paper.clone().multiplyScalar(0.9 + 0.1 * r1).lerp(stain, s * 0.75);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.position.y = size * 0.28;
  return mesh;
}

/** Un puñado de restos acomodados alrededor de (x, z), con giro y algo de azar. Devuelve el grupo (sombras incluidas). */
export function litter(items: { kind: 'candy' | 'pit' | 'napkin'; x: number; z: number; rot?: number; flavor?: number; size?: number; tilt?: number }[], seed = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'restos-de-fiesta';
  items.forEach((it, i) => {
    const m = it.kind === 'candy' ? candy(it.flavor ?? i, seed + i) : it.kind === 'pit' ? olivePit(seed + i) : napkin(seed + i, it.size);
    const holder = new THREE.Group();
    holder.position.set(it.x, 0, it.z);
    holder.rotation.y = it.rot ?? 0;
    if (it.tilt) holder.rotation.z = it.tilt;
    holder.add(m);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.noPick = true;
    g.add(holder);
  });
  return g;
}
