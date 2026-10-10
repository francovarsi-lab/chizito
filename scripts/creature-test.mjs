// Pruebas del intérprete de criaturas (módulos puros). No necesita navegador ni `npm run dev`:
// Vite carga los .ts en Node (ssrLoadModule).
// Uso: node scripts/creature-test.mjs
import { createServer } from 'vite';
import fs from 'node:fs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);

let passed = 0;
const failures = [];
const section = (name) => console.log(`\n# ${name}`);
const ok = (cond, msg) => {
  if (cond) passed++;
  else {
    failures.push(msg);
    console.log(`  FALLA: ${msg}`);
  }
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (esperado ${b}, dio ${a}, tol ${tol})`);
const nearV = (a, b, tol, msg) => a.forEach((x, i) => near(x, b[i], tol, `${msg}[${i}]`));

try {
  // ───────────── Tanda 1: contrato y límites ─────────────
  section('tanda 1: límites y configuración');
  const idx = await load('/src/creature/index.ts');
  ok(idx.MAX_PIECES === 40, 'MAX_PIECES = 40');
  ok(idx.MAX_STROKES === 30, 'MAX_STROKES = 30');
  const gameCfg = fs.readFileSync('src/config.ts', 'utf8');
  const m = /maxPieces:\s*(\d+)/.exec(gameCfg);
  ok(!!m && Number(m[1]) === idx.MAX_PIECES, `MAX_PIECES coincide con CONFIG.creature.maxPieces del juego (${m?.[1]})`);
  ok(!/^\s*import\s/m.test(fs.readFileSync('src/creature/limits.ts', 'utf8')), 'limits.ts no tiene imports');
  ok(idx.CREATURE_CONFIG.limits.maxPieces === 40 && idx.CREATURE_CONFIG.limits.maxStrokes === 30, 'config reexporta los topes');
  const c = idx.CREATURE_CONFIG;
  ok(c.limb.minFreeAbs === 0.01 && c.limb.minFreeRatio === 0.25, 'umbral de largo libre: 10 mm / 25 %');
  ok(c.limb.minEmbeddedAbs === 0.006 && c.limb.minEmbeddedRatio === 0.2, 'umbral de embebido: 6 mm / 20 %');
  ok(c.limb.maxTiltDeg === 70 && c.mobility.swingDeg === 120, 'inclinación 70° y giro 120°');
  ok(Object.keys(c.densities).includes('chizito') && c.densities.ketchup === 0, 'densidades presentes (ketchup = 0)');
  ok(idx.SNAPSHOT_SCHEMA === 'chizito.creature-snapshot' && idx.SNAPSHOT_VERSION === 1, 'esquema del snapshot');

  // ───────────── resto de las tandas se agregan abajo ─────────────

  // ───────────── Tanda 2: matemática, perfiles y masa ─────────────
  section('tanda 2: vectores y base de la criatura');
  const V = await load('/src/creature/math/vec.ts');
  nearV(V.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1], 1e-12, 'x × y = z');
  near(V.dot([1, 2, 3], [4, 5, 6]), 32, 1e-12, 'producto punto');
  near(V.len([3, 4, 12]), 13, 1e-12, 'largo 3-4-12');
  nearV(V.norm([0, 0, 5]), [0, 0, 1], 1e-12, 'normalizar');
  const B = await load('/src/creature/math/basis.ts');
  const basis = B.makeBasis([0, 0, 1], [0, 1, 0]);
  nearV(basis.s, [-1, 0, 0], 1e-12, 'con frente +Z y arriba +Y, la profundidad es −X');
  nearV(B.toProfile(basis, [0.01, 0.02, 0.03]), [0.03, 0.02], 1e-12, 'perfil: x = z (hacia el frente), y = arriba');
  near(B.depthOf(basis, [0.01, 0.02, 0.03]), -0.01, 1e-12, 'profundidad = −x');
  const tilted = B.makeBasis([0, 0, 1], [0, 1, 1]); // arriba no perpendicular al frente
  near(V.dot(tilted.f, tilted.u), 0, 1e-12, 'ortonormaliza: up ⟂ frente');
  nearV(tilted.u, [0, 1, 0], 1e-12, 'ortonormaliza: up corregido');
  const bx = B.makeBasis([1, 0, 0], [0, 1, 0]);
  nearV(B.toProfile(bx, [0.04, 0.01, 0.02]), [0.04, 0.01], 1e-12, 'con frente +X el perfil usa x e y');
  // Giro de 180° alrededor de "arriba": en el perfil es x → −x, y igual.
  const rotY180 = (v) => [-v[0], v[1], -v[2]];
  for (const v of [[0.01, 0.02, 0.03], [-0.02, 0.005, 0.04], [0.03, -0.01, -0.02]]) {
    const direct = B.toProfile(basis, rotY180(v));
    const viaFacing = B.applyFacing(B.toProfile(basis, v), -1);
    nearV(direct, viaFacing, 1e-12, 'giro de 180° = facing −1');
  }
  nearV(B.applyFacing([0.03, 0.02], 1), [0.03, 0.02], 1e-12, 'facing +1 no cambia nada');

  section('tanda 2: formas 2D y colisiones');
  const S = await load('/src/creature/math/shapes2d.ts');
  const square = (x, y, h) => [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
  const hull = S.convexHull([...square(0, 0, 1), [0, 0], [0.5, 0.5], [0.2, -0.3]]);
  ok(hull.length === 4, 'casco de un cuadrado con puntos adentro = 4 vértices');
  near(S.polygonArea(hull), 4, 1e-12, 'área del cuadrado 2×2');
  ok(S.convexHull([[0, 0], [1, 1], [2, 2]]).length <= 3, 'casco de puntos colineales no explota');
  ok(S.polyPolyOverlap(square(0, 0, 1), square(1.5, 0, 1)), 'SAT: cuadrados solapados');
  ok(!S.polyPolyOverlap(square(0, 0, 1), square(2.5, 0, 1)), 'SAT: cuadrados separados');
  ok(!S.polyPolyOverlap(square(0, 0, 1), square(2.0001, 0, 1)), 'SAT: separados por un pelo');
  const cap = (a, b, r) => ({ kind: 'capsule', a, b, r });
  const poly = (pts) => ({ kind: 'poly', pts });
  ok(S.overlap2D(cap([0, 0], [1, 0], 0.1), cap([0.5, 0.15], [0.5, 1], 0.1)), 'cápsulas que se tocan');
  ok(!S.overlap2D(cap([0, 0], [1, 0], 0.1), cap([0.5, 0.25], [0.5, 1], 0.1)), 'cápsulas separadas (0,25 > 0,2)');
  ok(S.overlap2D(cap([-1, 0], [1, 0], 0.01), cap([0, -1], [0, 1], 0.01)), 'cápsulas en cruz');
  ok(S.overlap2D(cap([2, 0], [3, 0], 0.1), poly(square(0, 0, 1))) === false, 'cápsula lejos del polígono');
  ok(S.overlap2D(cap([1.05, 0], [3, 0], 0.1), poly(square(0, 0, 1))), 'cápsula que roza el polígono');
  ok(S.overlap2D(cap([0, 0], [0.2, 0], 0.05), poly(square(0, 0, 1))), 'cápsula dentro del polígono');
  near(S.distSegmentSegment([0, 0], [1, 0], [0, 1], [1, 1]), 1, 1e-12, 'distancia entre segmentos paralelos');
  const bb = S.bounds2D([cap([0, 0], [1, 0], 0.1), poly(square(3, 1, 0.5))]);
  nearV(bb.min, [-0.1, -0.1], 1e-12, 'AABB mínimo');
  nearV(bb.max, [3.5, 1.5], 1e-12, 'AABB máximo');
  const mir = S.transform2D(poly([[0, 0], [1, 0], [1, 1]]), { facing: -1 });
  near(S.polygonArea(mir.pts), 0.5, 1e-12, 'espejo conserva el área');
  nearV(mir.pts[0], [-1, 1], 1e-12, 'espejo reordena el polígono (sigue convexo/antihorario)');
  const rt = S.transform2D(cap([1, 0], [2, 0], 0.1), { rotate: Math.PI / 2 });
  nearV(rt.a, [0, 1], 1e-9, 'giro de 90° alrededor del origen');

  section('tanda 2: proyección de formas 3D');
  const front = B.makeBasis([0, 0, 1], [0, 1, 0]);
  // Palito de 3,5 cm clavado hacia +Z (hacia el frente): se ve entero, horizontal.
  const rodFwd = { kind: 'capsule', a: [0, 0, 0], b: [0, 0, 0.035], radius: 0.0017 };
  const pf = S.projectShape(rodFwd, front);
  near(S.foreshortening(rodFwd, front), 1, 1e-12, 'palito hacia +Z con frente +Z: sin acortamiento');
  near(Math.abs(pf.b[0] - pf.a[0]), 0.035 - 2 * 0.0017, 1e-9, 'su largo en el perfil (menos las tapas)');
  // El mismo palito clavado hacia +X (punta del chizito): queda en profundidad.
  const rodSide = { kind: 'capsule', a: [0, 0, 0], b: [0.035, 0, 0], radius: 0.0017 };
  near(S.foreshortening(rodSide, front), 0, 1e-12, 'palito hacia +X con frente +Z: en profundidad (acortamiento 0)');
  near(S.foreshortening(rodSide, bx), 1, 1e-12, 'palito hacia +X con frente +X: entero');
  // Palito vertical: igual con cualquier frente.
  const rodDown = { kind: 'capsule', a: [0, 0, 0], b: [0, -0.035, 0], radius: 0.0017 };
  near(S.foreshortening(rodDown, front), 1, 1e-12, 'palito hacia abajo, frente +Z');
  near(S.foreshortening(rodDown, bx), 1, 1e-12, 'palito hacia abajo, frente +X');
  // Chizito (cápsula de 4,8 cm, radio 1,025 cm) con el eje largo en X.
  const chiz = { kind: 'capsule', a: [-0.024, 0, 0], b: [0.024, 0, 0], radius: 0.01025 };
  const cz = S.projectShape(chiz, front); // frente +Z: se ve de punta
  near(Math.hypot(cz.b[0] - cz.a[0], cz.b[1] - cz.a[1]), 0, 1e-12, 'chizito con frente +Z: círculo (eje largo en profundidad)');
  near(cz.r, 0.01025, 1e-12, 'radio del círculo = radio del chizito');
  const cx = S.projectShape(chiz, bx); // frente +X: se ve de costado
  near(Math.hypot(cx.b[0] - cx.a[0], cx.b[1] - cx.a[1]), 0.048 - 2 * 0.01025, 1e-9, 'chizito con frente +X: cápsula larga');
  // Disco (papita) de cara y de canto.
  const faceOn = { kind: 'disc', center: [0, 0, 0], normal: [0, 0, 1], radius: 0.025, thickness: 0.0015, solidFraction: 1 };
  const edgeOn = S.projectShape({ ...faceOn, normal: [1, 0, 0] }, bx); // normal ∥ frente: de canto en el perfil
  const eb = S.bounds2D([edgeOn]);
  near(eb.max[0] - eb.min[0], 0.0015, 1e-9, 'disco de canto: ancho = su grosor');
  near(eb.max[1] - eb.min[1], 0.05, 1e-3, 'disco de canto: alto = su diámetro');
  const sideDisc = S.projectShape({ ...faceOn, normal: [0, 0, 1] }, bx); // normal ∥ profundidad: se ve el disco entero
  ok(sideDisc.kind === 'poly', 'disco de cara a la cámara = polígono');
  near(S.polygonArea(sideDisc.pts), (12 / (2 * Math.PI)) * Math.sin((2 * Math.PI) / 12) * Math.PI * 0.025 * 0.025, 2e-6, 'área del disco de 12 lados');
  ok(S.projectShape({ kind: 'polyline', points: [[0, 0, 0]], radius: 0.001 }, front) === null, 'el ketchup no tiene forma de perfil');

  section('tanda 2: perfiles y masa');
  const P = await load('/src/creature/profiles.ts');
  ok(P.kindOfType('palito') === 'rod' && P.kindOfType('papita') === 'plate' && P.kindOfType('ketchup') === 'stroke', 'clases de pieza');
  ok(P.kindOfType('zanahoria-rara') === 'blob' && !P.isKnownType('zanahoria-rara'), 'tipo desconocido = bulto genérico');
  ok(P.stabilityOf('palito') === 'stable', 'palito estable');
  ok(P.stabilityOf('ketchup') === 'unstable', 'ketchup inestable');
  ok(P.stabilityOf('chizito', { mode: 'tail' }) === 'unstable', 'chizito ensartado: inestable');
  ok(P.stabilityOf('papita', { params: { bites: [123] } }) === 'unstable', 'papita partida: inestable');
  ok(P.stabilityOf('papita') === 'stable', 'papita entera: estable');
  ok(P.stabilityOf('mandarina') === 'unstable', 'tipo desconocido: inestable');
  const M = await load('/src/creature/math/mass.ts');
  const mk = (type, kind, shape, extra = {}) => ({ id: 'x', type, seed: 1, kind, shape, cosmetic: false, stability: 'stable', ...extra });
  near(M.shapeVolume({ kind: 'capsule', a: [0, 0, 0], b: [0, 0, 0.02], radius: 0.01 }, 'blob'), (4 / 3) * Math.PI * 1e-6, 1e-12, 'volumen: esfera (largo = 2r)');
  near(M.shapeVolume(rodFwd, 'rod'), 3.17776e-7, 1e-11, 'volumen del palito: π·r²·L');
  near(M.pieceMass(mk('palito', 'rod', rodFwd)), 1.74777e-4, 1e-8, 'masa del palito = 550 · V');
  const chizVol = Math.PI * 0.01025 ** 2 * (0.048 - 0.0205) + (4 / 3) * Math.PI * 0.01025 ** 3;
  near(M.pieceMass(mk('chizito', 'core', chiz)), 250 * 0.85 * chizVol, 1e-9, 'masa del chizito = 250 · 0,85 · V');
  const papita = (f) => mk('papita', 'plate', { kind: 'disc', center: [0, 0, 0], normal: [0, 0, 1], radius: 0.025, thickness: 0.0015, solidFraction: f });
  near(M.pieceMass(papita(1)), 1.030835e-3, 1e-8, 'masa de la papita entera');
  near(M.pieceMass(papita(0.8)), 0.8 * 1.030835e-3, 1e-8, 'una papita 20 % mordida pesa 20 % menos');
  ok(M.pieceMass(mk('ketchup', 'stroke', { kind: 'polyline', points: [[0, 0, 0]], radius: 0.001 }, { cosmetic: true })) === 0, 'el ketchup no pesa');
  ok(M.pieceMass(mk('mandarina', 'blob', chiz)) > 0, 'tipo desconocido: masa con densidad por defecto');
  nearV(M.centerOfMass([{ mass: 1, at: [0, 0, 0] }, { mass: 1, at: [0.02, 0, 0] }]), [0.01, 0, 0], 1e-12, 'centro de masa: dos masas iguales');
  nearV(M.centerOfMass([{ mass: 3, at: [0, 0, 0] }, { mass: 1, at: [0.04, 0, 0] }]), [0.01, 0, 0], 1e-12, 'centro de masa: 3 a 1');
  nearV(M.centerOfMass([]), [0, 0, 0], 1e-12, 'centro de masa sin piezas');
  nearV(M.shapeCenter(rodFwd), [0, 0, 0.0175], 1e-12, 'centro de la vara');

  // @@TESTS@@
} finally {
  await server.close();
}

console.log(`\n${passed} comprobaciones OK, ${failures.length} fallas`);
process.exit(failures.length ? 1 : 0);
