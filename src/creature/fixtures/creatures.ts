/**
 * Las seis criaturas de prueba del MVP 0, armadas COMO LAS ARMARÍA UN JUGADOR HOY: con el chizito parado (su eje largo
 * X hacia arriba: la cabeza es la tapa +X, los pies la tapa −X), mirándolo desde la cámara del constructor. Lo que se ve
 * a izquierda y derecha de la pantalla son los lados ±Y (la derecha es −Y); +Z mira a la cámara. Los brazos salen de los
 * costados, las piernas de abajo. El frente y el "arriba" de combate son parámetros del generador (por defecto frente
 * −Y = derecha de la pantalla, arriba +X).
 */
import { addScaled, norm, scale, sub } from '../math/vec';
import type { V3 } from '../types';
import { type BuiltCreature, CreatureBuilder, DEFAULT_FRONT, DEFAULT_UP } from './build';

const D = 0.009; // clavado de una extremidad "normal" (9 mm: más del 20 % del palito)
const UP: V3 = [1, 0, 0];
/** Ángulo de costado (theta) de los dos lados de la pantalla: 0 = +Y (izquierda), 180 = −Y (derecha). */
const SIDES: [number, number][] = [[-1, 0], [1, 180]];

type Maker = (front: V3, up: V3) => BuiltCreature;

/** A) cuerpo + 2 brazos + 2 piernas: brazos a los costados, un poco hacia arriba; piernas de abajo, abiertas hacia afuera. */
const makeA: Maker = (front, up) => {
  const b = new CreatureBuilder('A', 'A · cuerpo + 2 brazos + 2 piernas', 3, front, up);
  for (const [i, [, theta]] of SIDES.entries()) {
    const arm = b.side(0.011, theta);
    b.rod(b.root, arm.point, b.lean(arm.n, UP, 22), D, { seed: 101 + i });
    const leg = b.end(-1, 25, theta);
    b.rod(b.root, leg.point, leg.n, D, { seed: 103 + i });
  }
  return b.build();
};

/**
 * B) cuerpo + 4 brazos + 0 piernas. Dos brazos por costado, los dos por ENCIMA de la horizontal (a 20° y a 50°):
 * ninguno apunta hacia abajo, así que ninguno hace de pierna (un brazo que baja y toca el piso es una pierna).
 */
const makeB: Maker = (front, up) => {
  const b = new CreatureBuilder('B', 'B · cuerpo + 4 brazos, sin piernas', 3, front, up);
  let seed = 201;
  for (const [, theta] of SIDES) {
    for (const [x, lift] of [[0.014, 20], [0.004, 50]] as const) {
      const a = b.side(x, theta);
      b.rod(b.root, a.point, b.lean(a.n, UP, lift), D, { seed: seed++ });
    }
  }
  return b.build();
};

/** C) cuerpo + 1 brazo + 0 piernas: el brazo sale de la cara +Z (hacia la cámara del constructor), inclinado hacia arriba. */
const makeC: Maker = (front, up) => {
  const b = new CreatureBuilder('C', 'C · cuerpo + 1 brazo, sin piernas', 3, front, up);
  const a = b.side(0.006, 90);
  b.rod(b.root, a.point, b.lean(a.n, UP, 35), D, { seed: 301 });
  return b.build();
};

/** D) erizo: 30 palitos en todas direcciones (no depende de cómo esté parado el chizito). */
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
  // Las púas de las puntas también se abren (30°): un erizo no tiene una púa de nariz aislada.
  for (const sign of [-1, 1] as const) {
    const e = b.end(sign, 30, sign === 1 ? 0 : 180);
    b.rod(b.root, e.point, e.n, dd, { seed: seed++ });
  }
  for (const [x, th] of [[-0.004, 45], [0.004, 225], [0, 315]] as const) {
    const s = b.side(x, th);
    b.rod(b.root, s.point, s.n, dd, { seed: seed++ });
  }
  return b.build();
};

/**
 * E) asimétrica y rara: vara pasante, papita con vara, palito flojo, palito casi enterrado, un arma (maza = chizito
 * ensartado en la cola de un palito, con otro palito clavado en él) del lado derecho de la pantalla, y ketchup.
 */
const makeE: Maker = (front, up) => {
  const b = new CreatureBuilder('E', 'E · asimétrica / extraña', 3, front, up);
  const R = b.coreR;
  // 1) Vara pasante rasante: entra por el frente (+Z) y sale por atrás con punta libre.
  const y0 = 0.86 * R;
  const z0 = Math.sqrt(R * R - y0 * y0);
  const chord = 2 * z0;
  b.rod(b.root, [-0.008, y0, z0], [0, 0, 1], chord + 0.011, { seed: 501 });
  // 2) Papita clavada en el costado izquierdo con un palito que la atraviesa (ancla débil: solo agarra la papita).
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
  // 5) Maza del lado derecho (−Y): palito hacia afuera y un poco hacia arriba, con un chizito ensartado en su cola
  //    y otro palito clavado en ese chizito.
  const arm = b.side(0.004, 180);
  const stick = b.rod(b.root, arm.point, b.lean(arm.n, UP, 15), D, { seed: 506 });
  const mace = b.mountChizito(stick, 0.008, { seed: 7 });
  const ms = b.shapeOfItem(mace);
  if (ms.kind === 'capsule') {
    const axis = norm(sub(ms.b, ms.a));
    const perp = norm([axis[1], -axis[0], 0] as V3); // perpendicular al eje del chizito, en el plano de la pantalla
    const c = scale(addScaled(ms.a, ms.b, 1), 0.5);
    b.rod(mace, addScaled(c, perp, ms.radius), perp, D, { seed: 507 });
  }
  // 6) Ketchup a lo largo del costado izquierdo (cosmético).
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
  for (const [i, [, theta]] of SIDES.entries()) {
    const arm = b.side(0.012, theta);
    b.rod(b.root, arm.point, b.lean(arm.n, UP, 18), D, { seed: 603 + i, params: { proxyDe: 'zanahoria' } });
    const leg = b.end(-1, 20, theta);
    b.rod(b.root, leg.point, leg.n, D, { seed: 601 + i, params: { proxyDe: 'apio' } });
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
