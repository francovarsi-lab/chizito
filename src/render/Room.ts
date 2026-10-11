import * as THREE from 'three';
import { tableclothMaterial, woodMaterial } from '../assets/procedural/surfaces';

/**
 * Habitación simple y lógica para la fiesta: una mesa de cumpleaños con patas y el mantel cayendo por los
 * costados, piso de madera, tres paredes LISAS (fondo e izquierda/derecha) con zócalo blanco y techo. Las
 * guirnaldas se clavan en la pared del fondo (ver `Party`). Medidas reales (1 u = 1 m); la mesa está en y = 0.
 *
 *   x: −1,7 ……… pared izq.            mesa 1,9 × 1,5 m (x ±0,95, z −1,2 … +0,3)           pared der. ……… +1,7
 *   y: −0,75 piso · 0 mesa · 1,6 techo                 z: −1,85 pared del fondo
 */
export const ROOM = {
  table: { halfW: 0.95, zBack: -1.2, zFront: 0.3, legInset: 0.08 },
  floorY: -0.75,
  ceilingY: 1.6,
  backZ: -1.85,
  sideX: 1.7,
  frontZ: 1.6,
  clothDrop: 0.3,
};

export interface Room {
  /** Tapa de la mesa con su mantel (sigue visible con una foto de fondo). */
  table: THREE.Group;
  /** Lo demás: patas, faldones, piso, paredes, zócalo y techo (se oculta con una foto de fondo). */
  shell: THREE.Group;
  /** Superficies de la mesa (tapa y mantel): se funden con la foto de fondo si existe. */
  tableSurfaces: THREE.Mesh[];
}

export function buildRoom(): Room {
  const g = new THREE.Group();
  g.name = 'habitacion';
  const tableGroup = new THREE.Group();
  tableGroup.name = 'mesa';
  const { table: t, floorY, ceilingY, backZ, sideX, frontZ } = ROOM;
  const tw = t.halfW * 2;
  const td = t.zFront - t.zBack;
  const tcz = (t.zFront + t.zBack) / 2;

  // Mesa: tapa de madera y cuatro patas.
  const wood = woodMaterial();
  const top = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.03, td), wood);
  top.position.set(0, -0.015, tcz);
  top.receiveShadow = true;
  tableGroup.add(top);
  const legGeo = new THREE.BoxGeometry(0.05, -floorY - 0.03, 0.05);
  for (const sx of [-1, 1]) {
    for (const z of [t.zBack + t.legInset, t.zFront - t.legInset]) {
      const leg = new THREE.Mesh(legGeo, wood);
      leg.position.set(sx * (t.halfW - t.legInset), (floorY - 0.03) / 2, z);
      leg.castShadow = true;
      leg.receiveShadow = true;
      g.add(leg);
    }
  }

  // Mantel: la tapa y los cuatro faldones que caen con pliegues suaves (UV en metros: 25 cm por tile).
  const cloth = tableclothMaterial();
  const m = 0.012; // sobra del mantel más allá del borde
  const clothTop = new THREE.Mesh(planeXZ(tw + 2 * m, td + 2 * m, 0.25), cloth);
  clothTop.position.set(0, 0.0006, tcz);
  clothTop.receiveShadow = true;
  tableGroup.add(clothTop);
  const skirts: [number, number, number, number][] = [
    // ancho, x, z, giro (alrededor de Y)
    [tw + 2 * m, 0, t.zFront + m, 0],
    [tw + 2 * m, 0, t.zBack - m, Math.PI],
    [td + 2 * m, t.halfW + m, tcz, Math.PI / 2],
    [td + 2 * m, -t.halfW - m, tcz, -Math.PI / 2],
  ];
  for (const [w, x, z, ry] of skirts) {
    const skirt = new THREE.Mesh(skirtGeometry(w, ROOM.clothDrop, 0.25), cloth);
    skirt.position.set(x, 0.0016, z); // apenas por encima de la tapa: no asoma la madera en el borde
    skirt.rotation.y = ry;
    skirt.receiveShadow = true;
    skirt.castShadow = true;
    g.add(skirt);
  }

  // Piso de madera clara.
  const floorMat = new THREE.MeshStandardMaterial({ name: 'piso', color: '#e2c29a', roughness: 0.62 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(sideX * 2, frontZ - backZ), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, floorY, (frontZ + backZ) / 2);
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes lisas (color cálido claro, para que el mantel celeste y el chizito amarillo resalten) y techo.
  const wallMat = new THREE.MeshStandardMaterial({ name: 'pared', color: '#f7dcd2', roughness: 0.92 });
  const h = ceilingY - floorY;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(sideX * 2, h), wallMat);
  back.position.set(0, floorY + h / 2, backZ);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(frontZ - backZ, h), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-sideX, floorY + h / 2, (frontZ + backZ) / 2);
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.x = sideX;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(sideX * 2, frontZ - backZ), new THREE.MeshStandardMaterial({ color: '#fbf1ea', roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ceilingY, (frontZ + backZ) / 2);
  for (const w of [back, left, right, ceiling]) {
    w.receiveShadow = true;
    g.add(w);
  }
  // Zócalo blanco: marca dónde termina el piso y da la profundidad de la habitación.
  const trim = new THREE.MeshStandardMaterial({ name: 'zocalo', color: '#fdfaf6', roughness: 0.5 });
  const zb = 0.09;
  const bBack = new THREE.Mesh(new THREE.BoxGeometry(sideX * 2, zb, 0.015), trim);
  bBack.position.set(0, floorY + zb / 2, backZ + 0.0075);
  const bLeft = new THREE.Mesh(new THREE.BoxGeometry(0.015, zb, frontZ - backZ), trim);
  bLeft.position.set(-sideX + 0.0075, floorY + zb / 2, (frontZ + backZ) / 2);
  const bRight = bLeft.clone();
  bRight.position.x = sideX - 0.0075;
  for (const b of [bBack, bLeft, bRight]) {
    b.receiveShadow = true;
    g.add(b);
  }

  for (const grp of [g, tableGroup]) {
    grp.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.userData.noPick = true;
    });
  }
  return { table: tableGroup, shell: g, tableSurfaces: [top, clothTop] };
}

/** Plano horizontal con UV en metros / `tile`. */
function planeXZ(w: number, d: number, tile: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  return geo;
}

/** Faldón del mantel: cuelga desde el borde (y = 0) hacia abajo, con pliegues que se abren hacia el ruedo. */
function skirtGeometry(w: number, drop: number, tile: number): THREE.BufferGeometry {
  const sx = Math.max(8, Math.round(w / 0.03));
  const geo = new THREE.PlaneGeometry(w, drop, sx, 6);
  geo.translate(0, -drop / 2, 0);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const k = -y / drop; // 0 arriba → 1 en el ruedo
    pos.setZ(i, 0.0005 + k * 0.004 + k * k * 0.012 * (0.6 + 0.4 * Math.sin(x * 23)) * Math.sin(x * 41 + 0.7));
    uv.setXY(i, (x + w / 2) / tile, y / tile);
  }
  geo.computeVertexNormals();
  return geo;
}
