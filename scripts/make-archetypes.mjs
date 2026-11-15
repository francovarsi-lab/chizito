// Arquetipos de balance (T1 del plan): criaturas con el FRENTE REAL del juego (cara +Z, arriba +X), armadas a partir de A
// (2 brazos + 2 piernas, simétrica) cambiando tipos y agregando piezas en el espacio del snapshot (como la prueba del chupetín).
// Salida: src/creature/fixtures/arq/<id>.snapshot.json. Uso: node scripts/make-archetypes.mjs
import fs from 'node:fs';

const LEN = { palito: 0.035, escarbadientes: 0.03, 'palito-selva': 0.045, chupetin: 0.055 };
const RAD = { escarbadientes: 0.001, 'palito-selva': 0.0037, chupetin: 0.0017 };
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

const base = () => {
  const s = JSON.parse(fs.readFileSync('src/creature/fixtures/A.snapshot.json', 'utf8'));
  s.orientation = { front: [0, 0, 1], up: [1, 0, 0] };
  return s;
};
// En A: fxA1 / fxA3 = brazos (lado +Y / −Y), fxA2 / fxA4 = piernas.
const ARMS = ['palito-fxA1', 'palito-fxA3'];
const LEGS = ['palito-fxA2', 'palito-fxA4'];
const piece = (s, id) => s.pieces.find((p) => p.id === id);
const link = (s, id) => s.links.find((l) => l.childId === id);

/** Cambia el tipo de una vara y la estira/acorta a su largo real (la punta adentro queda donde estaba). */
function retype(s, id, type) {
  const p = piece(s, id);
  const d = nrm(sub(p.shape.b, p.shape.a));
  p.type = type;
  p.shape.b = add(p.shape.a, d, LEN[type]);
  if (RAD[type]) p.shape.radius = RAD[type];
  return p;
}
/** Copia una vara corrida `dx` a lo largo del eje largo del chizito (otro brazo del mismo lado, más arriba o más abajo). */
function clone(s, id, dx, suffix) {
  const p = piece(s, id), l = link(s, id);
  const nid = `${id}-${suffix}`, mv = (v) => [v[0] + dx, v[1], v[2]];
  s.pieces.push({ ...structuredClone(p), id: nid, shape: { ...p.shape, a: mv(p.shape.a), b: mv(p.shape.b) } });
  s.links.push({ ...structuredClone(l), id: `link-${nid}`, childId: nid, anchor: mv(l.anchor), attach: { ...l.attach, entryPoint: mv(l.attach.entryPoint) } });
}
/** Aceituna ensartada en la cola de la vara (como en criatura-20261011-1623: mitad sobre el palito, mitad pasada). */
function olive(s, id) {
  const p = piece(s, id), d = nrm(sub(p.shape.b, p.shape.a));
  const a = add(p.shape.b, d, -0.0104);
  const oid = `aceituna-${id}`;
  s.pieces.push({ id: oid, type: 'aceituna', seed: 1, kind: 'blob', cosmetic: false, stability: 'stable', shape: { kind: 'capsule', a, b: add(a, d, 0.02), radius: 0.0072 } });
  s.links.push({ ...structuredClone(link(s, id)), id: `link-${oid}`, parentId: id, childId: oid, mode: 'tail', anchor: p.shape.b, exit: null, crossings: [] });
}
/** Chupetín: vara de chupetín con el caramelo en la punta. */
function pop(s, id) {
  const p = retype(s, id, 'chupetin');
  const cid = `${id}~caramelo`;
  s.pieces.push({ id: cid, type: 'chupetin-caramelo', kind: 'blob', seed: 1, cosmetic: false, stability: 'stable', shape: { kind: 'capsule', a: p.shape.b, b: p.shape.b, radius: 0.0105 } });
  s.links.push({ ...structuredClone(link(s, id)), id: `link-${cid}`, parentId: id, childId: cid, mode: 'tail', anchor: p.shape.b, exit: null, crossings: [] });
}
/** Escudo (papita / nacho) apoyado en el cuerpo a `x` del centro y `th` grados alrededor del eje desde +Z (el frente). */
function shield(s, type, x, th) {
  const R = piece(s, 'root').shape.radius, t = (th * Math.PI) / 180;
  const n = [0, Math.sin(t), Math.cos(t)];
  const id = `${type}-arq-${s.pieces.length}`;
  const thick = type === 'nacho' ? 0.0018 : 0.0015;
  s.pieces.push({ id, type, seed: 1, kind: 'plate', cosmetic: false, stability: 'stable', shape: { kind: 'disc', center: add([x, 0, 0], n, R + thick / 2), normal: n, radius: type === 'nacho' ? 0.02 : 0.022, thickness: thick, solidFraction: 1 } });
  const entry = add([x, 0, 0], n, R);
  s.links.push({ id: `link-${id}`, parentId: 'root', childId: id, mode: 'pierce', attach: { entryPoint: entry, direction: n.map((v) => -v), depth: 0.004, spin: 0, frame: 'parent' }, integrity: 'ok', anchor: entry, normal: n, axis: n, tiltFromNormal: 0, embedded: 0.004, chord: null, freeTail: 0, exit: null, crossings: [] });
}

const ARQ = {
  boxeador: () => {},
  pinchudo: (s) => { for (const id of ARMS) { retype(s, id, 'escarbadientes'); clone(s, id, -0.007, 'b'); } },
  mazo: (s) => { ARMS.forEach((id) => olive(s, id)); LEGS.forEach((id) => retype(s, id, 'palito-selva')); },
  chupetin1: (s) => pop(s, ARMS[0]),
  chupetin2: (s) => ARMS.forEach((id) => pop(s, id)),
  tanque: (s) => { LEGS.forEach((id) => retype(s, id, 'palito-selva')); shield(s, 'nacho', 0.008, -25); shield(s, 'nacho', 0.008, 25); shield(s, 'papita', -0.006, -60); shield(s, 'papita', -0.006, 60); },
  desparejo: (s) => { pop(s, ARMS[0]); retype(s, ARMS[1], 'escarbadientes'); },
};

fs.mkdirSync('src/creature/fixtures/arq', { recursive: true });
for (const [id, make] of Object.entries(ARQ)) {
  const s = base();
  make(s);
  s.source = { ...(s.source ?? {}), name: `arquetipo ${id}` };
  fs.writeFileSync(`src/creature/fixtures/arq/${id}.snapshot.json`, JSON.stringify(s, null, 2) + '\n');
  console.log(id, s.pieces.map((p) => p.type).join(' '));
}
