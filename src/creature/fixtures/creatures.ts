/**
 * Las seis criaturas de prueba del MVP 0, con el cuerpo acostado a lo largo de X (el eje largo del chizito) y
 * "arriba" = +Y: los brazos salen de las puntas (±X) y las piernas de abajo (−Y). El frente de combate es un
 * parámetro del generador (por defecto +X). Ojo: son coordenadas del marco raíz, así que valen igual aunque el
 * constructor muestre el chizito parado.
 */
import { addScaled, norm, scale, sub } from '../math/vec';
import type { V3 } from '../types';
import { type BuiltCreature, CreatureBuilder, DEFAULT_FRONT, DEFAULT_UP } from './build';

const D = 0.009; // clavado de una extremidad "normal" (9 mm: más del 20 % del palito)

type Maker = (front: V3, up: V3) => BuiltCreature;

/** A) cuerpo + 2 brazos + 2 piernas. */
const makeA: Maker = (front, up) => {
  const b = new CreatureBuilder('A', 'A · cuerpo + 2 brazos + 2 piernas', 3, front, up);
  const core = b.root;
  for (const [i, s] of ([-1, 1] as const).entries()) {
    const leg = b.side(s * 0.011, 180);
    b.rod(core, leg.point, b.lean(leg.n, [s, 0, 0], 12), D, { seed: 101 + i });
    const arm = b.end(s, 25, 0);
    b.rod(core, arm.point, arm.n, D, { seed: 103 + i });
  }
  return b.build();
};

/**
 * B) cuerpo + 4 brazos + 0 piernas. Dos brazos por punta, los dos por ENCIMA de la horizontal (a 25° y a 55°):
 * ninguno apunta hacia abajo, así que ninguno hace de pierna (un brazo que baja y toca el piso es una pierna).
 */
const makeB: Maker = (front, up) => {
  const b = new CreatureBuilder('B', 'B · cuerpo + 4 brazos, sin piernas', 3, front, up);
  let seed = 201;
  for (const s of [-1, 1] as const) {
    for (const tilt of [25, 55]) {
      const e = b.end(s, tilt, 0);
      b.rod(b.root, e.point, e.n, D, { seed: seed++ });
    }
  }
  return b.build();
};

/** C) cuerpo + 1 brazo + 0 piernas (el brazo sale de la cara +Z, hacia la cámara del constructor, inclinado hacia arriba). */
const makeC: Maker = (front, up) => {
  const b = new CreatureBuilder('C', 'C · cuerpo + 1 brazo, sin piernas', 3, front, up);
  const a = b.side(0.004, 90);
  b.rod(b.root, a.point, b.lean(a.n, [0, 1, 0], 35), D, { seed: 301 });
  return b.build();
};

/** D) erizo: 28 palitos en todas direcciones. */
const makeD: Maker = (front, up) => {
  const b = new CreatureBuilder('D', 'D · erizo (muchas extremidades)', 3, front, up);
  let seed = 401;
  const dd = 0.008;
  const xs = [-0.017, -0.0085, 0, 0.0085, 0.017];
  xs.forEach((x, row) => {
    for (let k = 0; k < 5; k++) {
      const s = b.side(x, k * 72 + (row % 2) * 36);
      // Los de los extremos se abren hacia afuera: un erizo, no un peine.
      const fan = x === 0 ? s.n : b.lean(s.n, [Math.sign(x), 0, 0], (Math.abs(x) / 0.017) * 40);
      b.rod(b.root, s.point, fan, dd, { seed: seed++ });
    }
  });
  for (const sign of [-1, 1] as const) {
    const e = b.end(sign, 0, 0);
    b.rod(b.root, e.point, e.n, dd, { seed: seed++ });
  }
  for (const [x, th] of [[-0.004, 45], [0.004, 225], [0, 315]] as const) {
    const s = b.side(x, th);
    b.rod(b.root, s.point, s.n, dd, { seed: seed++ });
  }
  return b.build();
};

/** E) asimétrica y rara: vara pasante, papita con vara, palito flojo, palito casi enterrado, maza (chizito ensartado) y ketchup. */
const makeE: Maker = (front, up) => {
  const b = new CreatureBuilder('E', 'E · asimétrica / extraña', 3, front, up);
  const R = b.coreR;
  // 1) Vara pasante rasante por arriba: entra por el frente (+Z) y sale por atrás con punta libre.
  const y0 = 0.86 * R;
  const z0 = Math.sqrt(R * R - y0 * y0);
  const chord = 2 * z0;
  b.rod(b.root, [-0.008, y0, z0], [0, 0, 1], chord + 0.011, { seed: 501 });
  // 2) Papita clavada arriba con un palito que la atraviesa (ancla débil: solo agarra la papita).
  const top = b.side(0.012, 20);
  const pap = b.plate(b.root, top.point, top.n, 0.006, { seed: 502, spin: 0.6 });
  const ps = b.shapeOfItem(pap);
  if (ps.kind === 'disc') {
    const face = addScaled(ps.center, ps.normal, ps.thickness / 2);
    b.rod(pap, face, ps.normal, 0.004, { seed: 503 });
  }
  // 3) Palito flojo: solo 3 mm adentro.
  const loose = b.side(-0.015, 270);
  b.rod(b.root, loose.point, loose.n, 0.003, { seed: 504 });
  // 4) Palito casi enterrado: lo que sobra de cada lado es menos de 1 cm.
  const buried = b.side(0.016, 200);
  b.rod(b.root, buried.point, buried.n, 0.028, { seed: 505 });
  // 5) Maza: palito en la punta +X con un chizito ensartado en su cola, y otro palito clavado en ese chizito.
  const tip = b.end(1, 10, 180);
  const stick = b.rod(b.root, tip.point, tip.n, D, { seed: 506 });
  const mace = b.mountChizito(stick, 0.008, { seed: 7 });
  const ms = b.shapeOfItem(mace);
  if (ms.kind === 'capsule') {
    const axis = norm(sub(ms.b, ms.a));
    const perp = norm([axis[1] * 1 - 0, -axis[0], 0] as V3); // perpendicular al eje del chizito, en el plano XY
    const c = scale(addScaled(ms.a, ms.b, 1), 0.5);
    const entry = addScaled(c, perp, ms.radius);
    b.rod(mace, entry, perp, D, { seed: 507 });
  }
  // 6) Ketchup por arriba (cosmético).
  const pts: V3[] = [];
  const nrm: V3[] = [];
  for (let i = 0; i < 6; i++) {
    pts.push([-0.015 + i * 0.006, R, 0]);
    nrm.push([0, 1, 0]);
  }
  b.stroke(b.root, pts, nrm);
  return b.build();
};

/** Rival vegetal "sano": como A, con piezas PROXY marcadas con `proxyDe` (brazos = zanahoria, piernas = apio, cuerpo = brócoli). */
const makeVeg: Maker = (front, up) => {
  const b = new CreatureBuilder('V', 'Rival vegetal (proxy: cuerpo = brócoli, brazos = zanahoria, piernas = apio)', 11, front, up);
  for (const [i, s] of ([-1, 1] as const).entries()) {
    const leg = b.side(s * 0.012, 180);
    b.rod(b.root, leg.point, b.lean(leg.n, [s, 0, 0], 8), D, { seed: 601 + i, params: { proxyDe: 'apio' } });
    const arm = b.end(s, 20, 0);
    b.rod(b.root, arm.point, arm.n, D, { seed: 603 + i, params: { proxyDe: 'zanahoria' } });
  }
  return b.build();
};

export const CREATURE_MAKERS: { id: string; make: Maker }[] = [
  { id: 'A', make: makeA },
  { id: 'B', make: makeB },
  { id: 'C', make: makeC },
  { id: 'D', make: makeD },
  { id: 'E', make: makeE },
  { id: 'veg', make: makeVeg },
];

/** Construye las seis criaturas con el frente indicado (por defecto el de fábrica del juego: +Z, arriba +Y). */
export function buildAllCreatures(front: V3 = DEFAULT_FRONT, up: V3 = DEFAULT_UP): BuiltCreature[] {
  return CREATURE_MAKERS.map((m) => ({ ...m.make(front, up), id: m.id }));
}
