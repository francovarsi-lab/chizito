import * as THREE from 'three';
import { litter } from './PartyProps';
import type { AssetRegistry } from '../assets/AssetRegistry';
import { stripesTexture } from '../assets/procedural/surfaces';
import { mulberry32 } from '../util/noise';
import { PALITO_LENGTH } from '../assets/procedural/palito';
import { bakeStatic } from '../util/merge';
import { createSachet } from '../assets/procedural/ketchup';
import { buildParty, type Party } from './Party';
import { buildRoom } from './Room';

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
  /** Decoración de cumpleaños (guirnaldas, globos, torta…), animada. */
  party: Party;
}

export const BOWL_LAYOUT = {
  // Disposición pensada sobre la cámara real (45 mm, 24°, a 38 cm): todo CERCA del chizito y en foco, ningún recipiente cortado
  // ni encimado, el centro y el lugar donde cae su sombra libres. A la DERECHA las varas y las aceitunas (que se ensartan en
  // ellas); a la IZQUIERDA los escudos (papitas, nachos), el palito de la selva y el ketchup. Adelante lo bajo, atrás lo alto.
  ketchup: new THREE.Vector3(-0.061, 0, -0.062),
  nacho: new THREE.Vector3(-0.128, 0, -0.101),
  'palito-selva': new THREE.Vector3(-0.081, 0, -0.239),
  papita: new THREE.Vector3(-0.171, 0, -0.26),
  aceituna: new THREE.Vector3(0.104, 0, -0.069),
  'escarbadientes:espadita': new THREE.Vector3(0.135, 0, -0.057),
  escarbadientes: new THREE.Vector3(0.111, 0, -0.14),
  chupetin: new THREE.Vector3(0.067, 0, -0.132),
  palito: new THREE.Vector3(0.164, 0, -0.184),
} as Record<string, THREE.Vector3>;

export function buildBackdrop(assets: AssetRegistry): Backdrop {
  const root = new THREE.Group();
  root.name = 'backdrop';
  const bowls = new Map<string, THREE.Object3D>();

  // Habitación: mesa de cumpleaños con su mantel, piso, tres paredes lisas y techo (ver Room.ts).
  const room = buildRoom();
  root.add(room.table);

  // Cerámica ESMALTADA de colores vivos (no blanca ni pastel): cada recipiente se reconoce de lejos y la mesa tiene color.
  const glaze = (color: string): THREE.MeshPhysicalMaterial =>
    new THREE.MeshPhysicalMaterial({ name: 'ceramic', color, roughness: 0.14, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  const ceramic = glaze('#f6f1e8');
  // Palitos parados en un vaso descartable blanco, como en los cumpleaños.
  const palitoCup = makeStandCup(assets, { type: 'palito', count: 28, seed: 3, h: 0.026, r0: 0.017, r1: 0.024, stripe: '#e8323c' });
  palitoCup.position.copy(BOWL_LAYOUT.palito);
  palitoCup.userData.bowlFor = 'palito';
  root.add(palitoCup);
  bowls.set('palito', palitoCup);

  // Recipientes más chicos que antes (con menos piezas; las piezas mantienen su tamaño real): con el lente largo no entraban.
  const papitaBowl = makeBowl(0.044, 0.028, glaze('#ff6b57'));
  papitaBowl.position.copy(BOWL_LAYOUT.papita);
  papitaBowl.add(fillBowl(assets, 'papita', 0.044, 0.028, 14, 11));
  papitaBowl.userData.bowlFor = 'papita';
  root.add(papitaBowl);
  bowls.set('papita', papitaBowl);

  // Tira del frente: mismo lenguaje (cerámica blanca y vasito descartable), más chicos.
  // Escarbadientes y espaditas van en vasitos separados (cada uno da su variante).
  const nachoBowl = makeBowl(0.026, 0.017, glaze('#17b8a6'));
  nachoBowl.position.copy(BOWL_LAYOUT.nacho);
  nachoBowl.add(fillBowl(assets, 'nacho', 0.026, 0.017, 5, 41));
  const oliveBowl = makeBowl(0.019, 0.014, glaze('#7d5cff'));
  oliveBowl.position.copy(BOWL_LAYOUT.aceituna);
  oliveBowl.add(fillBowl(assets, 'aceituna', 0.019, 0.014, 5, 51));
  const pickCup = makeStandCup(assets, { type: 'escarbadientes', count: 18, seed: 61, h: 0.018, r0: 0.009, r1: 0.0125, params: () => ({ variant: 'liso' }), stripe: '#21a35a' });
  pickCup.position.copy(BOWL_LAYOUT.escarbadientes);
  const swordCup = makeStandCup(assets, { type: 'escarbadientes', count: 12, seed: 67, h: 0.018, r0: 0.009, r1: 0.0125, params: () => ({ variant: 'espadita' }), stripe: '#8a4dff' });
  swordCup.position.copy(BOWL_LAYOUT['escarbadientes:espadita']);
  // Sobrecitos de ketchup en un platito: clic = modo dibujar.
  // Un PLATITO playo (no un bowl: en la pared curva los sobres la atravesaban) con dos sobres acostados encima.
  const sachetDish = makePlate(0.032, ceramic);
  sachetDish.position.copy(BOWL_LAYOUT.ketchup);
  sachetDish.add(fillSachets(2, 81));
  // Palitos de la selva con su envoltorio (se desenrolla al agarrarlos) y chupetines en un vasito.
  // Platito playo con los paquetes acostados y prolijos (casi paralelos, apenas encimados).
  const selvaBowl = makeBowl(0.04, 0.009, glaze('#17b8a6'));
  selvaBowl.position.copy(BOWL_LAYOUT['palito-selva']);
  selvaBowl.add(fillSelvaDish(assets, 4, 91, 0.04));

  const popCup = makeStandCup(assets, { type: 'chupetin', count: 7, seed: 97, h: 0.028, r0: 0.014, r1: 0.019, params: () => ({ wrapped: true }), stripe: '#1f6fe0' });
  popCup.position.copy(BOWL_LAYOUT.chupetin);
  // (El bowl de chizitos para ensartar queda en pausa: el mecanismo sigue en la interacción.)
  const strip: [string, THREE.Object3D][] = [
    ['nacho', nachoBowl],
    ['aceituna', oliveBowl],
    ['escarbadientes', pickCup],
    ['escarbadientes:espadita', swordCup],
    ['ketchup', sachetDish],
    ['palito-selva', selvaBowl],
    ['chupetin', popCup],
  ];
  for (const [type, obj] of strip) {
    obj.userData.bowlFor = type;
    root.add(obj);
    bowls.set(type, obj);
  }

  const farProps = new THREE.Group();
  farProps.name = 'far-props';
  root.add(farProps);
  farProps.add(room.shell);
  // Fondo: bowl de chizitos de plástico, otro de palitos, vasos, gaseosa, servilletas, gorrito.
  // SÓLO EN LA PELEA (de fondo): el bowl de chizitos y los restos de fiesta. En el constructor confundían (parecían para elegir).
  const fightOnly = new THREE.Group();
  fightOnly.name = 'solo-pelea';
  fightOnly.visible = false;
  farProps.add(fightOnly);
  const plasticOrange = new THREE.MeshPhysicalMaterial({ color: '#ff8a3d', roughness: 0.35, clearcoat: 0.3 });
  const bgBowl = makeBowl(0.085, 0.05, plasticOrange);
  // La HINCHADA: pegado a la tabla, atrás a la izquierda; sus chizitos saltan para alentar (`stage.ts`, 'hinchada').
  bgBowl.name = 'hinchada';
  bgBowl.position.set(-0.2, 0, -0.35);
  bgBowl.add(fillBowl(assets, 'chizito', 0.085, 0.05, 26, 21));
  fightOnly.add(bgBowl);

  const plasticYellow = new THREE.MeshPhysicalMaterial({ color: '#d9cdf3', roughness: 0.35, clearcoat: 0.3 }); // lavanda
  const bgBowl2 = makeBowl(0.08, 0.048, plasticYellow);
  bgBowl2.position.set(0.36, 0, -0.85);
  bgBowl2.add(fillBowl(assets, 'papita', 0.08, 0.048, 40, 31));
  farProps.add(bgBowl2);

  // Restos de fiesta (los mismos que en la pelea: mismo mundo): servilleta usada, carozos y caramelos.
  fightOnly.add(
    litter(
      [
        { kind: 'pit', x: -0.03, z: -0.31, rot: 0.3 },
        { kind: 'pit', x: -0.015, z: -0.335, rot: 2.4 },
        { kind: 'candy', x: 0.235, z: -0.36, rot: 0.4, flavor: 2 },
        { kind: 'candy', x: 0.27, z: -0.405, rot: -0.3, flavor: 0 },
        { kind: 'candy', x: 0.205, z: -0.425, rot: 1.2, flavor: 4 },
      ],
      5,
    ),
  );

  // Pocos objetos y lejos: el centro de la mesa queda despejado para el juego.
  farProps.add(makeCup('#b9d8f2', -0.5, -0.95));
  farProps.add(makeBottle(0.22, -1.05));
  farProps.add(makePartyHat(-0.16, -0.9));
  const party = buildParty();
  farProps.add(party.group);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = o.castShadow || o.userData.noShadow !== true;
      o.receiveShadow = true;
    }
  });
  for (const m of room.tableSurfaces) m.castShadow = false;
  return { root, bowls, surfaces: room.tableSurfaces, farProps, party };
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

/** Espesor de pared de `makeBowl` (el interior se calcula con el mismo perfil). */
const BOWL_WALL = 0.0035;

/**
 * Altura mínima a la que puede estar un punto dentro del bowl (radio `rho` desde el eje) sin
 * atravesar la cerámica: el fondo, la pared curva y, más allá del borde, por encima del borde.
 */
function bowlFloor(radius: number, height: number, rho: number): number {
  const ri = radius - BOWL_WALL;
  const base = 0.004 + BOWL_WALL;
  if (rho <= ri * 0.45) return base;
  if (rho >= ri) return height + 0.0015;
  const a = (Math.asin(Math.min(1, (rho / ri - 0.45) / 0.55)) * 2) / Math.PI;
  return base + a * (height - BOWL_WALL - 0.004);
}

/**
 * Llena un bowl (de `makeBowl(radius, height)`) con instancias de la pieza, horneadas en pocas mallas.
 * Cada pieza se apoya: si algún vértice quedaría dentro de la cerámica, se la sube hasta que no.
 */
function fillBowl(
  assets: AssetRegistry,
  type: string,
  radius: number,
  height: number,
  count: number,
  seed: number,
  params?: Record<string, unknown>,
): THREE.Object3D {
  const innerR = radius - BOWL_WALL - 0.004;
  const rnd = mulberry32(seed);
  const pile = new THREE.Group();
  const variants = 6;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const obj = assets.create(type, seed * 100 + (i % variants), 'prop', params);
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd());
    const layer = i / count;
    if (type === 'palito') {
      // Montañita de palitos cruzados que sobresale del borde; algunos asoman parados.
      const up = rnd() < 0.22;
      const elev = up ? 0.5 + rnd() * 0.6 : 0.05 + rnd() * 0.4;
      const yaw = rnd() * Math.PI * 2;
      const dir = tmp.set(Math.cos(yaw) * Math.cos(elev), Math.sin(elev), Math.sin(yaw) * Math.cos(elev)).normalize();
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const r = rr * innerR * 0.8;
      const dome = (1 - (r * r) / (innerR * innerR)) * 0.035;
      const c = new THREE.Vector3(Math.cos(a) * r, 0.01 + layer * height * 0.8 + dome * layer, Math.sin(a) * r);
      obj.position.copy(c).addScaledVector(dir, -PALITO_LENGTH / 2);
    } else {
      const r = rr * innerR * 0.75;
      const dome = (1 - (r * r) / (innerR * innerR)) * height * 0.55;
      obj.position.set(Math.cos(a) * r, 0.008 + layer * height * 0.6 + dome * 0.5 + rnd() * 0.006, Math.sin(a) * r);
      // El marco 'tip' deja la punta/borde en el origen y el largo en Y: centrar la pieza y
      // acostarla (su eje más fino hacia arriba), con un desorden leve; las chatas, más planas.
      const inner = obj.children[0];
      const box = new THREE.Box3().setFromObject(inner);
      inner.position.sub(box.getCenter(tmp));
      const size = box.getSize(new THREE.Vector3());
      const thin = size.x <= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const lay = new THREE.Quaternion().setFromUnitVectors(thin, new THREE.Vector3(0, 1, 0));
      const tumble = assets.definition(type).dimensions.thickness < 0.003 ? 0.8 : 1.6;
      const jitter = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * tumble, rnd() * Math.PI * 2, (rnd() - 0.5) * tumble, 'YXZ'));
      obj.quaternion.copy(jitter).multiply(lay);
    }
    restOnBowl(obj, radius, height);
    pile.add(obj);
  }
  return bakeStatic(pile, `${type}-pile`);
}

/** Sube la pieza lo justo para que ningún vértice atraviese el fondo, la pared o el borde del bowl. */
function restOnBowl(obj: THREE.Object3D, radius: number, height: number): void {
  obj.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let lift = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    const stride = Math.max(1, Math.floor(pos.count / 600));
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      lift = Math.max(lift, bowlFloor(radius, height, Math.hypot(v.x, v.z)) + 0.0005 - v.y);
    }
  });
  obj.position.y += lift;
}

/** Paquetes de palitos de la selva acostados en el platito, ordenados como recién servidos. */
function fillSelvaDish(assets: AssetRegistry, count: number, seed: number, radius: number): THREE.Object3D {
  const rnd = mulberry32(seed);
  const pile = new THREE.Group();
  const tmp = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const obj = assets.create('palito-selva', seed * 100 + i, 'prop', { wrapped: true });
    const inner = obj.children[0];
    const box = new THREE.Box3().setFromObject(inner);
    inner.position.sub(box.getCenter(tmp));
    // Acostado con la cara de adelante (+Z) hacia arriba y el largo apuntando hacia la cámara, un poco girado.
    const lay = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5 + (i - (count - 1) / 2) * 0.16 + (rnd() - 0.5) * 0.08);
    obj.quaternion.copy(yaw).multiply(lay);
    const row = i < 4 ? 0 : 1; // dos capas: cuatro abajo, dos encima
    const slot = row === 0 ? i - 1.5 : i - 4.5;
    obj.position.set(slot * 0.0125, 0.008 + row * 0.0085, (rnd() - 0.5) * 0.003 + row * 0.003);
    restOnBowl(obj, radius, 0.009);
    pile.add(obj);
  }
  return bakeStatic(pile, 'palitos-selva');
}

/**
 * Platito playo de cerámica: fondo plano (hasta `radius − 7 mm`, a `PLATE_TOP` de alto) y un borde bajo y redondeado.
 */
const PLATE_TOP = 0.0022;
function makePlate(radius: number, mat: THREE.Material): THREE.Group {
  const pts = [
    [0, 0], [radius - 0.007, 0], [radius - 0.003, 0.0012], [radius - 0.0008, 0.0034], [radius, 0.0046],
    [radius - 0.0012, 0.0052], [radius - 0.0035, 0.0042], [radius - 0.007, PLATE_TOP], [0, PLATE_TOP],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), mat);
  mesh.name = 'bowl';
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/**
 * Dos sobrecitos de ketchup acostados sobre el platito, uno apenas encima del otro y girado: cada uno se APOYA en lo de abajo
 * (el plano del plato o la cara de arriba del anterior), así no atraviesan nada.
 */
function fillSachets(count: number, seed: number): THREE.Object3D {
  const rnd = mulberry32(seed);
  const pile = new THREE.Group();
  const S = 0.85; // un poco más chicos que en la mano: entran enteros en el fondo plano
  let top = PLATE_TOP;
  const box = new THREE.Box3();
  for (let i = 0; i < count; i++) {
    const s = createSachet(seed + i, 'prop');
    s.rotation.x = -Math.PI / 2;
    s.scale.setScalar(S);
    const g = new THREE.Group();
    g.add(s);
    g.rotation.y = Math.PI / 2 + (i ? -0.42 : 0.18) + (rnd() - 0.5) * 0.06;
    g.position.set((i - (count - 1) / 2) * 0.007, 0, (i - (count - 1) / 2) * -0.004);
    g.updateMatrixWorld(true);
    box.setFromObject(g);
    g.position.y = top - box.min.y + 0.0001;
    g.updateMatrixWorld(true);
    top = box.setFromObject(g).max.y - 0.0012; // el de arriba se apoya en la panza del de abajo (son blanditos)
    pile.add(g);
  }
  const wrap = new THREE.Group();
  wrap.add(pile);
  return bakeStatic(wrap, 'sobres-ketchup');
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
    new THREE.MeshPhysicalMaterial({ color: '#f6e3a6', roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.5, specularIntensity: 1 }), // limonada
  );
  g.add(body);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f5f2ea';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#f7b6c6';
  ctx.fillRect(0, 22, 256, 20);
  const labelTex = new THREE.CanvasTexture(c);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0535, 0.0535, 0.075, 48, 1, true),
    new THREE.MeshPhysicalMaterial({ map: labelTex, roughness: 0.35, clearcoat: 0.5 }),
  );
  label.position.y = 0.13;
  g.add(label);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 24), new THREE.MeshPhysicalMaterial({ color: '#bfe6d6', roughness: 0.4 }));
  cap.position.y = 0.32;
  g.add(cap);
  g.position.set(x, 0, z);
  return g;
}

function makePartyHat(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const tex = stripesTexture('#ffb7c8', '#fff7ee', 7);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.048, 0.13, 48, 1, true),
    new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.55, side: THREE.DoubleSide, sheen: 0.3 }),
  );
  cone.position.y = 0.065;
  g.add(cone);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.014, 20, 16), new THREE.MeshPhysicalMaterial({ color: '#ffe29a', roughness: 1, sheen: 1, sheenColor: new THREE.Color('#fff2c0'), sheenRoughness: 0.9 }));
  pom.position.y = 0.132;
  g.add(pom);
  g.position.set(x, 0, z);
  return g;
}

interface StandCupSpec {
  type: string;
  count: number;
  seed: number;
  /** Alto, radio de la base y radio de la boca del vaso. */
  h: number;
  r0: number;
  r1: number;
  params?: (i: number) => Record<string, unknown>;
  /** Color de las rayas del vasito de cumpleaños (blanco con rayas verticales). */
  stripe?: string;
}

/**
 * Vaso descartable blanco (plástico, con anillos) lleno de piezas largas paradas (palitos,
 * escarbadientes), levemente abiertas en abanico y asomando del borde. Se reconoce aunque esté
 * desenfocado.
 */
function makeStandCup(assets: AssetRegistry, spec: StandCupSpec): THREE.Group {
  const { type, count, seed, h, r0, r1 } = spec;
  const g = new THREE.Group();
  g.name = `vaso-${type}`;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0.0015), new THREE.Vector2(r0 - 0.001, 0.0015), new THREE.Vector2(r0, 0.003)];
  for (let i = 0; i <= 24; i++) {
    const a = i / 24;
    // Anillos típicos del vaso descartable cerca de la base y del borde.
    const ring = (a > 0.12 && a < 0.2) || (a > 0.82 && a < 0.86) ? 0.0006 : 0;
    pts.push(new THREE.Vector2(r0 + (r1 - r0) * a + ring, 0.003 + a * (h - 0.003)));
  }
  pts.push(new THREE.Vector2(r1 + 0.0011, h + 0.0008));
  pts.push(new THREE.Vector2(r1 - 0.0006, h + 0.0012));
  pts.push(new THREE.Vector2(r1 - 0.001, h - 0.002));
  pts.push(new THREE.Vector2(r0 - 0.0008, 0.005));
  pts.push(new THREE.Vector2(0, 0.005));
  const cup = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 64),
    new THREE.MeshPhysicalMaterial({
      name: 'vaso',
      color: '#ffffff',
      map: spec.stripe ? stripesTexture(spec.stripe, '#fbfaf6', 9) : null,
      roughness: 0.35,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      sheen: 0.2,
      side: THREE.DoubleSide,
    }),
  );
  g.add(cup);

  const rnd = mulberry32(seed);
  const pile = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const obj = assets.create(type, seed * 100 + (i % 9), 'prop', spec.params?.(i));
    // Base repartida en el fondo; inclinación hacia afuera según qué tan lejos del centro esté.
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * r0 * 0.75;
    // Que ningún palito atraviese la pared: a la altura del borde tiene que quedar adentro.
    const tiltMax = Math.asin(THREE.MathUtils.clamp((r1 - 0.003 - rr) / h, 0, 0.9));
    const tilt = Math.min(tiltMax, 0.05 + (rr / r0) * 0.3 + rnd() * 0.06);
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
    obj.quaternion.setFromUnitVectors(up, dir);
    obj.position.set(Math.cos(a) * rr, 0.005 + rnd() * 0.008, Math.sin(a) * rr);
    pile.add(obj);
  }
  g.add(bakeStatic(pile, `${type}-en-vaso`));
  return g;
}
