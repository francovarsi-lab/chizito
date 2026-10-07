import * as THREE from 'three';
import type { AssetRegistry } from '../assets/AssetRegistry';
import { paperNormal, stripesTexture, tableclothMaterial, woodMaterial } from '../assets/procedural/surfaces';
import { mulberry32 } from '../util/noise';
import { bakeStatic } from '../util/merge';

/**
 * Set de cumpleaños: mesa de madera con mantel, bowls de snacks en primer plano lateral
 * y objetos desenfocados al fondo. La mesa está en y = 0; el chizito flota en el centro.
 */
export interface Backdrop {
  root: THREE.Group;
  /** Bowls de los que se agarran piezas: tipo de pieza → objeto clickeable. */
  bowls: Map<string, THREE.Object3D>;
  /** Mesa y mantel (se funden con la foto de fondo si existe). */
  surfaces: THREE.Mesh[];
  /** Objetos modelados del fondo (se ocultan si hay foto de fondo). */
  farProps: THREE.Group;
}

export const BOWL_LAYOUT = {
  palito: new THREE.Vector3(0.082, 0, 0.07),
  papita: new THREE.Vector3(-0.082, 0, 0.066),
};

export function buildBackdrop(assets: AssetRegistry): Backdrop {
  const root = new THREE.Group();
  root.name = 'backdrop';
  const bowls = new Map<string, THREE.Object3D>();

  // Mesa
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 1.3), woodMaterial());
  table.position.set(0, -0.015, -0.3);
  table.receiveShadow = true;
  root.add(table);

  // Mantel (algo girado: deja ver la madera en el fondo a la derecha).
  const clothMat = tableclothMaterial();
  const clothGeo = new THREE.PlaneGeometry(1.0, 1.25, 1, 1);
  clothGeo.rotateX(-Math.PI / 2);
  // UV en metros / 0,3 m por tile.
  const uv = clothGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 1.0) / 0.25, (uv.getY(i) * 1.25) / 0.25);
  const cloth = new THREE.Mesh(clothGeo, clothMat);
  cloth.position.set(-0.12, 0.0006, -0.28);
  cloth.rotation.y = 0.12;
  cloth.receiveShadow = true;
  root.add(cloth);

  // Bowls de primer plano (cerámica blanca).
  const ceramic = new THREE.MeshPhysicalMaterial({
    name: 'ceramic',
    color: '#f1ece4',
    roughness: 0.16,
    clearcoat: 0.6,
    clearcoatRoughness: 0.12,
  });
  const palitoBowl = makeBowl(0.066, 0.046, ceramic);
  palitoBowl.position.copy(BOWL_LAYOUT.palito);
  palitoBowl.add(fillBowl(assets, 'palito', 0.058, 0.046, 70, 3));
  palitoBowl.userData.bowlFor = 'palito';
  root.add(palitoBowl);
  bowls.set('palito', palitoBowl);

  const papitaBowl = makeBowl(0.07, 0.044, ceramic);
  papitaBowl.position.copy(BOWL_LAYOUT.papita);
  papitaBowl.add(fillBowl(assets, 'papita', 0.06, 0.044, 46, 11));
  papitaBowl.userData.bowlFor = 'papita';
  root.add(papitaBowl);
  bowls.set('papita', papitaBowl);

  const farProps = new THREE.Group();
  farProps.name = 'far-props';
  root.add(farProps);
  // Fondo: bowl de chizitos de plástico, otro de palitos, vasos, gaseosa, servilletas, gorrito.
  const plasticOrange = new THREE.MeshPhysicalMaterial({ color: '#2e8bd6', roughness: 0.3, clearcoat: 0.3 });
  const bgBowl = makeBowl(0.085, 0.05, plasticOrange);
  bgBowl.position.set(-0.2, 0, -0.34);
  bgBowl.add(fillBowl(assets, 'chizito', 0.075, 0.05, 55, 21));
  farProps.add(bgBowl);

  const plasticYellow = new THREE.MeshPhysicalMaterial({ color: '#f2c230', roughness: 0.3, clearcoat: 0.3 });
  const bgBowl2 = makeBowl(0.08, 0.048, plasticYellow);
  bgBowl2.position.set(0.3, 0, -0.62);
  bgBowl2.add(fillBowl(assets, 'papita', 0.07, 0.048, 40, 31));
  farProps.add(bgBowl2);

  farProps.add(makeCup('#d8342c', 0.13, -0.46));
  farProps.add(makeCup('#2f7fd0', -0.36, -0.7));
  farProps.add(makeCup('#f2efe9', 0.2, -0.36, 0.2));
  farProps.add(makeBottle(0.06, -0.82));
  farProps.add(makeNapkins(-0.02, -0.56));
  farProps.add(makePartyHat(-0.34, -0.4));

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = o.castShadow || o.userData.noShadow !== true;
      o.receiveShadow = true;
    }
  });
  table.castShadow = false;
  cloth.castShadow = false;
  return { root, bowls, surfaces: [table, cloth], farProps };
}

function makeBowl(radius: number, height: number, mat: THREE.Material): THREE.Group {
  const t = 0.0035; // espesor de pared
  const pts: THREE.Vector2[] = [];
  const steps = 24;
  // Exterior: de la base al borde.
  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(radius * 0.45, 0));
  pts.push(new THREE.Vector2(radius * 0.47, 0.004));
  for (let i = 0; i <= steps; i++) {
    const a = i / steps;
    const r = radius * (0.5 + 0.5 * Math.sin((a * Math.PI) / 2));
    pts.push(new THREE.Vector2(r, 0.004 + a * (height - 0.004)));
  }
  // Borde redondeado
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * Math.PI;
    pts.push(new THREE.Vector2(radius - t / 2 + (Math.cos(a) * t) / 2, height + (Math.sin(a) * t) / 2));
  }
  // Interior: del borde al fondo.
  for (let i = steps; i >= 0; i--) {
    const a = i / steps;
    const r = (radius - t) * (0.45 + 0.55 * Math.sin((a * Math.PI) / 2));
    pts.push(new THREE.Vector2(r, 0.004 + t + a * (height - 0.004 - t)));
  }
  pts.push(new THREE.Vector2(0, 0.004 + t));
  const geo = new THREE.LatheGeometry(pts, 72);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'bowl';
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/** Llena un bowl con instancias de la pieza (horneadas en pocas mallas). */
function fillBowl(assets: AssetRegistry, type: string, innerR: number, height: number, count: number, seed: number): THREE.Object3D {
  const rnd = mulberry32(seed);
  const pile = new THREE.Group();
  const variants = 6;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const obj = assets.create(type, seed * 100 + (i % variants), 'prop');
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd());
    const layer = i / count;
    if (type === 'palito') {
      // Palitos cruzados; algunos asoman parados.
      const up = rnd() < 0.18;
      const elev = up ? 0.6 + rnd() * 0.5 : 0.05 + rnd() * 0.35;
      const yaw = rnd() * Math.PI * 2;
      const dir = tmp.set(Math.cos(yaw) * Math.cos(elev), Math.sin(elev), Math.sin(yaw) * Math.cos(elev)).normalize();
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const c = new THREE.Vector3(Math.cos(a) * rr * innerR * 0.5, 0.01 + layer * height * 0.95, Math.sin(a) * rr * innerR * 0.5);
      obj.position.copy(c).addScaledVector(dir, -0.05);
    } else {
      const r = rr * innerR * 0.75;
      const dome = (1 - (r * r) / (innerR * innerR)) * height * 0.55;
      obj.position.set(Math.cos(a) * r, 0.008 + layer * height * 0.6 + dome * 0.5 + rnd() * 0.006, Math.sin(a) * r);
      obj.rotation.set((rnd() - 0.5) * 2.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 2.2);
      if (type === 'papita') {
        // El marco 'tip' deja el borde en el origen: centrar el disco en su posición.
        const inner = obj.children[0];
        inner.position.y -= 0.025;
      }
    }
    pile.add(obj);
  }
  return bakeStatic(pile, `${type}-pile`);
}

function makeCup(color: string, x: number, z: number, roughness = 0.32): THREE.Mesh {
  const h = 0.1;
  const r0 = 0.026;
  const r1 = 0.039;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0.002), new THREE.Vector2(r0, 0.002)];
  for (let i = 0; i <= 10; i++) {
    const a = i / 10;
    // Leves anillos del vaso descartable.
    const ring = i > 1 && i < 4 ? 0.0006 : 0;
    pts.push(new THREE.Vector2(r0 + (r1 - r0) * a + ring, a * h));
  }
  pts.push(new THREE.Vector2(r1 + 0.0012, h + 0.001));
  pts.push(new THREE.Vector2(r1 - 0.0008, h + 0.0015));
  pts.push(new THREE.Vector2(r1 - 0.0012, h - 0.004));
  pts.push(new THREE.Vector2(r0 - 0.001, 0.006));
  pts.push(new THREE.Vector2(0, 0.006));
  const m = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 48),
    new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
  );
  m.position.set(x, 0, z);
  return m;
}

function makeBottle(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const prof: [number, number][] = [
    [0, 0], [0.04, 0], [0.05, 0.01], [0.053, 0.03], [0.053, 0.2], [0.05, 0.225], [0.035, 0.26],
    [0.02, 0.29], [0.015, 0.305], [0.015, 0.315], [0, 0.315],
  ];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 48),
    new THREE.MeshPhysicalMaterial({ color: '#2a1006', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, specularIntensity: 1 }),
  );
  g.add(body);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f5f2ea';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#1f5fae';
  ctx.fillRect(0, 22, 256, 20);
  const labelTex = new THREE.CanvasTexture(c);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0535, 0.0535, 0.075, 48, 1, true),
    new THREE.MeshPhysicalMaterial({ map: labelTex, roughness: 0.35, clearcoat: 0.5 }),
  );
  label.position.y = 0.13;
  g.add(label);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 24), new THREE.MeshPhysicalMaterial({ color: '#1f5fae', roughness: 0.4 }));
  cap.position.y = 0.32;
  g.add(cap);
  g.position.set(x, 0, z);
  return g;
}

function makeNapkins(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#f4b8c8', roughness: 0.9, normalMap: paperNormal(), sheen: 0.3, sheenColor: new THREE.Color('#ffffff') });
  const rnd = mulberry32(8);
  for (let i = 0; i < 14; i++) {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.0012, 0.11), mat);
    n.position.set((rnd() - 0.5) * 0.004, 0.0006 + i * 0.0013, (rnd() - 0.5) * 0.004);
    n.rotation.y = (rnd() - 0.5) * 0.08;
    g.add(n);
  }
  g.position.set(x, 0, z);
  g.rotation.y = 0.5;
  return g;
}

function makePartyHat(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const tex = stripesTexture('#e2483d', '#f6f0e2', 7);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.048, 0.13, 48, 1, true),
    new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.55, side: THREE.DoubleSide, sheen: 0.3 }),
  );
  cone.position.y = 0.065;
  g.add(cone);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.014, 20, 16), new THREE.MeshPhysicalMaterial({ color: '#f2b632', roughness: 1, sheen: 1, sheenColor: new THREE.Color('#fff2c0'), sheenRoughness: 0.9 }));
  pom.position.y = 0.132;
  g.add(pom);
  g.position.set(x, 0, z);
  return g;
}
