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
  const dflt = B.makeBasis(idx.CREATURE_CONFIG.orientation.defaultFront, idx.CREATURE_CONFIG.orientation.defaultUp);
  nearV(dflt.f, [0, -1, 0], 1e-12, 'frente de combate por defecto: −Y (la derecha de la pantalla del constructor)');
  nearV(dflt.u, [1, 0, 0], 1e-12, 'arriba de combate: +X (el chizito parado)');
  nearV(dflt.s, [0, 0, 1], 1e-12, 'profundidad = +Z, hacia el espectador: el perfil es la imagen del constructor');
  nearV(B.toProfile(dflt, [0.04, -0.01, 0.02]), [0.01, 0.04], 1e-12, 'perfil: un punto a la derecha (−Y) y arriba (+X) cae a la derecha y arriba');
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


  // ───────────── Tanda 3: criaturas de prueba ─────────────
  section('tanda 3: rayos (cuerda atravesada)');
  const R = await load('/src/creature/math/ray.ts');
  const ivC = R.rayCapsule([0, 0.01, 0], [0, -1, 0], [-0.02, 0, 0], [0.02, 0, 0], 0.01);
  near(ivC[1] - ivC[0], 0.02, 1e-9, 'rayo por el centro de una cápsula: cuerda = diámetro');
  const ivG = R.rayCapsule([0, 0.005, 0.2], [0, 0, -1], [-0.02, 0, 0], [0.02, 0, 0], 0.01);
  near(ivG[1] - ivG[0], 2 * Math.sqrt(0.01 ** 2 - 0.005 ** 2), 1e-9, 'rayo desplazado: cuerda de un círculo');
  ok(R.rayCapsule([0, 0.02, 0], [0, 0, -1], [-0.02, 0, 0], [0.02, 0, 0], 0.01) === null, 'rayo que pasa de largo');
  const ivCap = R.rayCapsule([0.05, 0, 0], [-1, 0, 0], [-0.02, 0, 0], [0.02, 0, 0], 0.01);
  near(ivCap[1] - ivCap[0], 0.04 + 0.02, 1e-9, 'rayo a lo largo del eje: largo total con las dos tapas');
  const ivD = R.rayDisc([0, 0, 0.05], [0, 0, -1], [0, 0, 0], [0, 0, 1], 0.0015, 0.025);
  near(ivD[1] - ivD[0], 0.0015, 1e-12, 'rayo perpendicular a un disco: cuerda = espesor');
  ok(R.rayDisc([0.04, 0, 0.05], [0, 0, -1], [0, 0, 0], [0, 0, 1], 0.0015, 0.025) === null, 'rayo fuera del radio del disco');
  const clip = R.clipToSegment([-0.01, 0.02], 0.012);
  near(clip.chord, 0.012, 1e-12, 'recorte al largo del segmento');
  ok(R.clipToSegment([0.02, 0.03], 0.01) === null, 'intervalo fuera del segmento');

  section('tanda 3: archivos de criatura (cargador real del juego)');
  globalThis.location ??= { search: '' };
  const fx = await load('/src/creature/fixtures/creatures.ts');
  const { fromCreatureFile } = await load('/src/persistence/CreatureFile.ts');
  const { PieceRegistry } = await load('/src/pieces/PieceRegistry.ts');
  const { ALL_DEFINITIONS } = await load('/src/pieces/definitions.ts');
  const registry = new PieceRegistry();
  ALL_DEFINITIONS.forEach((d) => registry.register(d));
  let oldFrontWarnings = 0;
  const built = fx.buildAllCreatures();
  const byId = Object.fromEntries(built.map((c) => [c.id, c]));
  ok(built.map((c) => c.id).join() === 'A,B,C,D,E,veg', 'las seis criaturas: A, B, C, D, E y vegetal');
  for (const c of built) {
    // Lo que está commiteado en disco es lo que genera el código hoy.
    const onDisk = JSON.parse(fs.readFileSync(`public/assets/creatures/${c.id}.json`, 'utf8'));
    ok(JSON.stringify(onDisk) === JSON.stringify(c.file), `${c.id}: public/assets/creatures/${c.id}.json está al día`);
    const snapDisk = JSON.parse(fs.readFileSync(`src/creature/fixtures/${c.id}.snapshot.json`, 'utf8'));
    ok(JSON.stringify(snapDisk) === JSON.stringify(c.snapshot), `${c.id}: snapshot de referencia al día`);
    const loaded = fromCreatureFile(c.file, registry);
    // El cargador actual del chat 3D todavía usa la convención vieja (±X): avisa y se queda con +X. Ese aviso es el único aceptable.
    const OLD_FRONT_WARNING = 'el frente de combate no era ±X: se usa +X';
    const real = loaded.warnings.filter((w) => w !== OLD_FRONT_WARNING);
    if (loaded.warnings.includes(OLD_FRONT_WARNING)) oldFrontWarnings++;
    ok(real.length === 0, `${c.id}: se carga sin avisos (${real.join('; ') || 'ninguno'})`);
    const expectedPieces = c.file.pieces.length;
    ok(loaded.snapshot.pieces.length === expectedPieces, `${c.id}: no se descartó ninguna pieza (${loaded.snapshot.pieces.length}/${expectedPieces})`);
    const ids = new Set(c.file.pieces.map((p) => p.id));
    ok(ids.size === c.file.pieces.length, `${c.id}: ids únicos`);
    ok(c.snapshot.budget.pieceCount <= idx.MAX_PIECES, `${c.id}: ${c.snapshot.budget.pieceCount} piezas ≤ ${idx.MAX_PIECES}`);
    ok(c.snapshot.budget.strokeCount <= idx.MAX_STROKES, `${c.id}: trazos ≤ ${idx.MAX_STROKES}`);
    ok(c.file.creature.pieceCount === c.snapshot.budget.pieceCount, `${c.id}: pieceCount del archivo = del snapshot`);
    // La conexión se guarda tal cual: lo que lee el cargador es lo que escribió el generador.
    c.file.pieces.forEach((fp, i) => {
      const lp = loaded.snapshot.pieces[i];
      nearV(lp.entryPoint, fp.attach.entryPoint, 1e-6, `${c.id}/${fp.id} entryPoint`);
      near(lp.depth, Math.min(fp.attach.depth, registry.get(fp.type).maxDepth || fp.attach.depth), 1e-6, `${c.id}/${fp.id} profundidad`);
      ok((lp.mount === 'tail') === (fp.attach.mode === 'tail'), `${c.id}/${fp.id} modo de conexión`);
    });
    // Invariantes del snapshot.
    const sn = c.snapshot;
    ok(sn.schema === idx.SNAPSHOT_SCHEMA && sn.version === 1, `${c.id}: esquema del snapshot`);
    ok(sn.pieces[0].id === 'root' && sn.pieces[0].kind === 'core', `${c.id}: el núcleo es el chizito raíz`);
    ok(sn.links.length === sn.pieces.length - 1, `${c.id}: una conexión por pieza no raíz`);
    const seen = new Set(['root']);
    let order = true;
    for (const l of sn.links) { if (!seen.has(l.parentId)) order = false; seen.add(l.childId); }
    ok(order, `${c.id}: orden padre → hijo`);
    const allFinite = (x) => (typeof x === 'number' ? Number.isFinite(x) : Array.isArray(x) ? x.every(allFinite) : x && typeof x === 'object' ? Object.values(x).every(allFinite) : true);
    ok(allFinite(sn), `${c.id}: todos los números del snapshot son finitos`);
    nearV(sn.orientation.front, [0, -1, 0], 1e-12, `${c.id}: frente de combate por defecto −Y (a la derecha de la pantalla)`);
    nearV(sn.orientation.up, [1, 0, 0], 1e-12, `${c.id}: arriba de combate +X (el chizito parado)`);
    nearV(c.file.creature.front.direction, [0, -1, 0], 1e-9, `${c.id}: el archivo lleva el frente de combate (dato por criatura)`);
    nearV(c.file.creature.front.up, [1, 0, 0], 1e-9, `${c.id}: y su arriba`);
  }

  console.log(`  INFO: ${oldFrontWarnings} de ${built.length} archivos dan el aviso del cargador viejo del frente de combate (pendiente del chat 3D).`);

  section('tanda 3: contenido de cada criatura');
  const rodsOf = (c) => c.snapshot.pieces.filter((p) => p.kind === 'rod');
  const linkOf = (c, id) => c.snapshot.links.find((l) => l.childId === id);
  const A = byId.A;
  ok(rodsOf(A).length === 4, 'A: 4 palitos (2 brazos + 2 piernas)');
  const legsA = rodsOf(A).filter((p) => linkOf(A, p.id).axis[0] < -0.8);
  const armsA = rodsOf(A).filter((p) => linkOf(A, p.id).axis[0] > 0 && Math.abs(linkOf(A, p.id).axis[1]) > 0.8);
  ok(legsA.length === 2 && armsA.length === 2, 'A: 2 piernas hacia abajo (−X) y 2 brazos hacia los costados (±Y) y un poco arriba');
  ok(rodsOf(A).every((p) => linkOf(A, p.id).exit === null && linkOf(A, p.id).freeTail > 0.023 && Math.abs(linkOf(A, p.id).embedded - 0.009) < 1e-6), 'A: ninguno atraviesa; ≥ 23 mm libres y 9 mm adentro');
  ok(rodsOf(byId.B).length === 4, 'B: 4 brazos');
  ok(rodsOf(byId.B).every((p) => linkOf(byId.B, p.id).axis[0] > 0.3), 'B: los cuatro por encima de la horizontal (ninguno hace de pierna)');
  ok(rodsOf(byId.B).every((p) => Math.abs(linkOf(byId.B, p.id).axis[1]) > 0.5), 'B: los cuatro salen de los costados (±Y)');
  const C = byId.C;
  ok(rodsOf(C).length === 1, 'C: un solo palito');
  const ca = linkOf(C, rodsOf(C)[0].id).axis;
  ok(ca[2] > 0.7 && ca[0] > 0.4, 'C: el brazo sale por +Z (hacia la cámara del constructor) inclinado hacia arriba (+X)');
  ok(byId.D.snapshot.budget.pieceCount === 30 && rodsOf(byId.D).length === 30, 'D: erizo de 30 palitos (dentro del tope de 40)');
  const dirsD = new Set(rodsOf(byId.D).map((p) => linkOf(byId.D, p.id).axis.map((v) => Math.round(v * 20)).join()));
  ok(dirsD.size >= 25, `D: palitos en direcciones distintas (${dirsD.size})`);
  const E = byId.E;
  const eRods = rodsOf(E);
  ok(eRods.length === 6, 'E: 6 palitos (pasante, en papita, flojo, enterrado, de la maza y del chizito ensartado)');
  const through = eRods.find((p) => linkOf(E, p.id).exit !== null && linkOf(E, p.id).parentId === 'root' && linkOf(E, p.id).freeTail > 0.01);
  ok(!!through && linkOf(E, through.id).exit.freeTip >= 0.0105 && linkOf(E, through.id).freeTail >= 0.0105, 'E: vara pasante con más de 1 cm libre de cada lado');
  const onPlate = eRods.find((p) => E.snapshot.pieces.find((q) => q.id === linkOf(E, p.id).parentId)?.kind === 'plate');
  ok(!!onPlate && linkOf(E, onPlate.id).embedded < 0.002, 'E: palito clavado en una papita (solo ~1,5 mm de sostén)');
  ok(E.snapshot.links.some((l) => l.mode === 'pierce' && l.parentId === 'root' && l.embedded < 0.004 && l.embedded > 0.002), 'E: palito flojo (3 mm adentro)');
  const buried = eRods.find((p) => { const l = linkOf(E, p.id); return l.exit && l.exit.freeTip < 0.01 && l.freeTail < 0.01; });
  ok(!!buried, 'E: palito casi enterrado (menos de 1 cm libre de cada lado)');
  const tailLink = E.snapshot.links.find((l) => l.mode === 'tail');
  ok(!!tailLink && tailLink.attach.frame === 'child', 'E: un chizito ensartado en la cola (mount:tail, marco del hijo)');
  const mace = E.snapshot.pieces.find((p) => p.id === tailLink.childId);
  ok(mace.type === 'chizito' && mace.kind === 'blob' && mace.stability === 'unstable', 'E: el chizito ensartado es un bulto inestable, no un núcleo');
  ok(E.snapshot.pieces.filter((p) => p.kind === 'core').length === 1, 'E: un solo núcleo');
  const secondLevel = eRods.find((p) => linkOf(E, p.id).parentId === mace.id);
  ok(!!secondLevel, 'E: un palito clavado en el chizito ensartado (segundo nivel)');
  const holder = eRods.find((p) => p.id === tailLink.parentId);
  ok(linkOf(E, holder.id).freeTail > 0 && linkOf(E, holder.id).freeTail < 0.035 - 0.009 - 0.0079, 'E: el palito de la maza solo muestra el tramo de vara a la vista');
  const stroke = E.snapshot.pieces.find((p) => p.kind === 'stroke');
  ok(!!stroke && stroke.cosmetic && stroke.stability === 'unstable' && E.snapshot.budget.strokeCount === 1, 'E: un trazo de ketchup cosmético que no suma a las piezas');
  ok(E.snapshot.budget.pieceCount === 8, 'E: 8 piezas (el ketchup no cuenta)');
  const V2 = byId.veg;
  ok(rodsOf(V2).filter((p) => p.proxyDe === 'zanahoria').length === 2 && rodsOf(V2).filter((p) => p.proxyDe === 'apio').length === 2, 'vegetal: 2 zanahorias (proxyDe) y 2 apios (proxyDe)');
  ok(V2.snapshot.pieces.every((p) => p.stability === 'stable'), 'vegetal: todo estable');
  ok(/brócoli/.test(V2.name), 'vegetal: el nombre marca el cuerpo proxy (brócoli)');

  section('tanda 3: el frente de combate es un parámetro');
  const flipped = fx.buildAllCreatures([0, 1, 0], [1, 0, 0]);
  ok(flipped.every((c) => JSON.stringify(c.snapshot.orientation.front) === '[0,1,0]'), 'con --front=+Y (giro de 180°) el snapshot lo refleja');
  const zfront = fx.buildAllCreatures([0, 0, 1], [1, 0, 0]);
  ok(zfront.every((c) => JSON.stringify(c.snapshot.orientation.front) === '[0,0,1]' && JSON.stringify(c.snapshot.orientation.up) === '[1,0,0]'), 'y también acepta cualquier otro (frente +Z, arriba +X)');
  ok(flipped.every((c) => JSON.stringify(c.file.creature.front.direction) === '[0,1,0]') && built.every((c) => JSON.stringify(c.file.creature.front.direction) === '[0,-1,0]'), 'el archivo lleva el frente de combate de cada criatura');
  ok([flipped, zfront].every((set) => set.every((c, i) => JSON.stringify(c.file.pieces) === JSON.stringify(built[i].file.pieces))), 'las piezas del archivo no dependen del frente de combate');
  ok(JSON.stringify(fx.buildAllCreatures()) === JSON.stringify(built), 'generar dos veces da lo mismo (determinista)');
  ok(E.snapshot.links.filter((l) => l.exit).every((l) => Math.abs(Math.hypot(...l.exit.normal) - 1) < 1e-9), 'E: la salida de la vara pasante trae su normal (unitaria)');
  // Información (no cuenta como falla): la convención de combate del cargador del chat 3D.
  const consText = fs.readFileSync('src/model/Construction.ts', 'utf8');
  const m3 = /DEFAULT_COMBAT_FRONT[^=]*=\s*\[([^\]]*)\]/.exec(consText);
  console.log(`  INFO: el cargador del juego usa DEFAULT_COMBAT_FRONT = [${m3?.[1]}] (convención vieja ±X / arriba +Y); la decisión vigente es ±Y / arriba +X: lo tiene que actualizar el chat 3D.`);

  section('tanda 3: validación del snapshot y frentes ±Y');
  const { validateSnapshot, isCombatFront } = idx;
  ok(built.every((c) => validateSnapshot(c.snapshot).length === 0), 'las seis criaturas validan sin avisos');
  ok(isCombatFront([0, -1, 0]) && isCombatFront([0, 1, 0]), '−Y (derecha) y +Y (izquierda) son frentes de combate válidos');
  ok(isCombatFront([0.01, -0.9999, 0]), 'un frente apenas torcido sigue valiendo');
  ok(!isCombatFront([0, 0, 1]) && !isCombatFront([1, 0, 0]) && !isCombatFront([0, 0, 0]), '+Z, +X y el vector nulo no');
  const withFront = (f, u = [1, 0, 0]) => ({ ...built[0].snapshot, orientation: { front: f, up: u } });
  ok(validateSnapshot(withFront([0, 1, 0])).length === 0, 'frente +Y (giro de 180°): sin avisos');
  ok(validateSnapshot(withFront([0, 0, 1])).some((m) => m.includes('±Y')), 'frente +Z: se acepta con aviso');
  ok(validateSnapshot(withFront([1, 0, 0], [1, 0, 0])).some((m) => m.includes('coinciden')), 'frente igual a "arriba": aviso (no hay perfil)');
  ok(validateSnapshot(withFront([0, -1, 0], [1, 0.3, 0])).some((m) => m.includes('perpendicular')), '"arriba" torcido: aviso de que se corrige');
  ok(validateSnapshot(withFront([0, 0, 0])).length > 0, 'frente nulo: aviso');
  ok(validateSnapshot({ ...built[0].snapshot, budget: { ...built[0].snapshot.budget, strokeCount: 31 } }).some((m) => m.includes('trazos')), '31 trazos: aviso (tope 30)');
  ok(validateSnapshot({ ...built[0].snapshot, budget: { ...built[0].snapshot.budget, pieceCount: 41 } }).some((m) => m.includes('41 piezas')), '41 piezas: aviso (tope 40)');
  // La base sale igual a la derecha que a la izquierda salvo por el signo: el giro de 180° es un espejo exacto.
  const bPlus = B.makeBasis([0, -1, 0], [1, 0, 0]);
  const bMinus = B.makeBasis([0, 1, 0], [1, 0, 0]);
  const pt = [0.013, 0.007, -0.011];
  nearV(B.toProfile(bMinus, pt), B.applyFacing(B.toProfile(bPlus, pt), -1), 1e-12, 'frente a la izquierda = frente a la derecha con x → −x');
  near(B.depthOf(bPlus, pt), -B.depthOf(bMinus, pt), 1e-12, 'la profundidad cambia de signo al girar');

  section('tanda 3: hoja de perfiles');
  const svg = fs.readFileSync('docs/creature/perfiles-a-vs-b.svg', 'utf8');
  ok(svg.startsWith('<svg') && svg.length > 5000, 'perfiles-a-vs-b.svg existe');
  ok(['frente a la derecha', 'giro de 180°', 'frente +Z'].every((t) => svg.includes(t)), 'las tres orientaciones');
  ok(['A', 'B', 'C', 'D', 'E', 'Rival vegetal'].every((t) => svg.includes(`>${t}</text>`)), 'las seis criaturas');
  const sheet = await load('/src/creature/fixtures/profileSheet.ts');
  ok(sheet.renderProfileSheet(built) === svg, 'la hoja en disco coincide con lo que genera el código');


  // ───────────── Tanda 4: detección de extremidades ─────────────
  section('tanda 4: detección en las criaturas de prueba');
  const { detectLimbs } = idx;
  const det = Object.fromEntries(built.map((c) => [c.id, detectLimbs(c.snapshot)]));
  ok(det.A.limbs.length === 4 && det.A.decorative.length === 0, 'A: 4 extremidades (2 brazos + 2 piernas), nada decorativo');
  ok(det.B.limbs.length === 4 && det.B.decorative.length === 0, 'B: 4 extremidades');
  ok(det.C.limbs.length === 1 && det.C.decorative.length === 0, 'C: 1 extremidad');
  ok(det.D.limbs.length === 30 && det.D.limbs.length <= idx.MAX_PIECES, `D: 30 extremidades, dentro del tope de ${idx.MAX_PIECES}`);
  ok(det.veg.limbs.length === 4 && det.veg.decorative.length === 0, 'vegetal: 4 extremidades');
  ok(built.every((c) => detectLimbs(c.snapshot).limbs.every((l) => l.freeLength >= 0.01 && l.anchorQuality >= 0.35)), 'toda extremidad cumple libre ≥ 1 cm y calidad ≥ 0,35');
  ok(JSON.stringify(detectLimbs(built[4].snapshot)) === JSON.stringify(detectLimbs(built[4].snapshot)), 'la detección es determinista');
  for (const id of ['A', 'B', 'C', 'veg']) {
    for (const l of det[id].limbs) near(l.length, l.freeLength, 1e-6, `${id}: el largo de ${l.id.split(':')[1]} es lo que sobresale`);
  }

  section('tanda 4: criatura E (rara)');
  const dE = det.E;
  ok(dE.limbs.length === 3, 'E: 3 extremidades (la vara pasante da dos + la maza)');
  const pair = dE.limbs.filter((l) => l.pairedWith);
  ok(pair.length === 2 && pair[0].pairedWith === pair[1].id && pair[1].pairedWith === pair[0].id && pair[0].rootPieceId === pair[1].rootPieceId, 'E: una vara pasante = dos extremidades hermanas (cola y punta)');
  ok(new Set(pair.map((l) => l.end)).size === 2, 'E: una por la cola y otra por la punta');
  near(pair[0].massShare + pair[1].massShare, 1, 1e-9, 'E: la vara pasante reparte su masa entre las dos (suman 1)');
  ok(pair.every((l) => l.tiltDeg > 50 && l.tiltDeg < 70 && l.anchorQuality >= 0.35), 'E: la pasante entra rasante (50°–70°) y aun así tiene base');
  const maza = dE.limbs.find((l) => l.tag === 'maza');
  ok(!!maza && maza.end === 'tail' && maza.pieceIds.length === 3, 'E: una maza (vara + chizito ensartado + palito del chizito)');
  ok(maza.branchIds.length === 1 && maza.length > 0.05, 'E: la maza tiene una rama de segundo nivel y mide más de 5 cm');
  ok(maza.endMassRatio >= 0.5 && maza.mass > 0.0025, 'E: la maza concentra la masa en el extremo');
  const reasons = Object.fromEntries(dE.decorative.map((d) => [d.pieceId, d.reason]));
  const reasonList = Object.values(reasons).sort().join(',');
  ok(reasonList === 'plate,second-level,stroke,too-short,weak-anchor,weak-anchor', `E: decorativas con su razón (${reasonList})`);
  const rodsE = E.snapshot.pieces.filter((p) => p.kind === 'rod');
  ok(rodsE.filter((p) => reasons[p.id] === 'weak-anchor').length === 2, 'E: dos varas flojas (la de la papita y la de 3 mm)');
  ok(dE.decorative.filter((d) => d.reason !== 'stroke').every((d) => d.mass > 0), 'E: lo decorativo pesa (suma masa)');
  ok(dE.decorative.find((d) => d.reason === 'stroke').mass === 0, 'E: el ketchup no pesa');
  const covered = new Set([...dE.limbs.flatMap((l) => l.pieceIds), ...dE.decorative.map((d) => d.pieceId), 'root']);
  ok(E.snapshot.pieces.every((p) => covered.has(p.id)), 'E: toda pieza es núcleo, está en una extremidad o es decorativa (no se pierde ninguna)');

  section('tanda 4: casos sintéticos');
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const withLink = (snap, childId, f) => { const c = clone(snap); f(c.links.find((l) => l.childId === childId), c); return c; };
  const aSnap = A.snapshot;
  const rod0 = rodsOf(A)[0].id;
  const steep = withLink(aSnap, rod0, (l) => { l.tiltFromNormal = (80 * Math.PI) / 180; });
  const dt = detectLimbs(steep);
  ok(dt.limbs.length === 3 && dt.decorative.find((d) => d.pieceId === rod0)?.reason === 'weak-anchor', 'inclinado 80° (> 70°): base floja, decorativo');
  const shallow = withLink(aSnap, rod0, (l) => { l.embedded = 0.004; });
  ok(detectLimbs(shallow).decorative.find((d) => d.pieceId === rod0)?.reason === 'weak-anchor', 'solo 4 mm adentro (< 6 mm): base floja');
  const stubby = withLink(aSnap, rod0, (l) => { l.freeTail = 0.008; });
  ok(detectLimbs(stubby).decorative.find((d) => d.pieceId === rod0)?.reason === 'too-short', 'sobresale 8 mm (< 1 cm): demasiado corta');
  const nothing = withLink(aSnap, rod0, (l) => { l.freeTail = 0; });
  ok(detectLimbs(nothing).decorative.find((d) => d.pieceId === rod0)?.reason === 'no-free-tip', 'sin nada que sobresalga: sin punta libre');
  const justEnough = withLink(aSnap, rod0, (l) => { l.freeTail = 0.0105; l.embedded = 0.0075; });
  ok(detectLimbs(justEnough).limbs.length === 4, 'justo en el límite (10,5 mm libres, 7,5 mm adentro): sí es extremidad');
  const broken = withLink(aSnap, rod0, (l) => { l.integrity = 'broken'; });
  const db = detectLimbs(broken);
  ok(db.limbs.length === 3 && db.decorative.find((d) => d.pieceId === rod0)?.reason === 'broken', 'unión rota: decorativa');
  const unknown = clone(aSnap);
  unknown.pieces.find((p) => p.id === rod0).type = 'mandarina';
  const du = detectLimbs(unknown);
  ok(du.limbs.length === 3 && du.decorative.find((d) => d.pieceId === rod0)?.reason === 'unknown-type', 'tipo desconocido: decorativo, no error');
  // Una vara clavada solo en una papita es floja; si además atraviesa el núcleo, la sostiene el núcleo.
  const plateRod = rodsE.find((p) => reasons[p.id] === 'weak-anchor' && E.snapshot.pieces.find((q) => q.id === linkOf(E, p.id).parentId)?.kind === 'plate');
  const anchored = withLink(E.snapshot, plateRod.id, (l) => { l.crossings = [{ pieceId: 'root', entry: l.anchor, normal: l.axis, exit: null, chord: 0.011 }]; });
  const dan = detectLimbs(anchored);
  const saved = dan.limbs.find((l) => l.rootPieceId === plateRod.id);
  ok(!!saved && saved.anchoredBy === 'root' && saved.tag === 'placa-con-vara', 'vara de papita que además cruza el núcleo: la sostiene el núcleo (placa-con-vara)');
  ok(dan.limbs.length === dE.limbs.length + 1, 'y suma una extremidad más');
  // Una cadena floja arrastra a lo que cuelga de ella: ketchup y maza.
  const weakMount = withLink(E.snapshot, maza.rootPieceId, (l) => { l.embedded = 0.003; });
  const dw = detectLimbs(weakMount);
  ok(!dw.limbs.some((l) => l.tag === 'maza') && dw.decorative.some((d) => d.pieceId === mace.id && d.reason === 'weak-anchor'), 'si la vara de la maza es floja, la maza es decorativa (misma razón)');
  // Dos extremidades paralelas muy juntas siguen siendo dos (la detección no mira vecinos).
  ok(detectLimbs({ ...A.snapshot, pieces: [A.snapshot.pieces[0]], links: [] }).limbs.length === 0, 'sin palitos no hay extremidades');

  section('tanda 4: los umbrales están solo en config.ts');
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const f of ['anchors', 'limbs', 'groups', 'decorative']) {
    const text = strip(fs.readFileSync(`src/creature/detect/${f}.ts`, 'utf8'));
    const bad = (text.match(/\b\d+\.\d+\b|\b\d{3,}\b/g) ?? []).filter((n) => n !== '180');
    ok(bad.length === 0, `detect/${f}.ts: ningún número suelto${bad.length ? ' (' + bad.join(', ') + ')' : ''}`);
  }


  // ───────────── Tanda 5: masa, capacidades, apoyos y locomoción ─────────────
  section('tanda 5: masa');
  const { analyzeBody } = idx;
  const body = Object.fromEntries(built.map((c) => [c.id, analyzeBody(c.snapshot).body]));
  for (const c of built) {
    const m = body[c.id].mass;
    near(Object.values(m.byPiece).reduce((a, b) => a + b, 0), m.total, 1e-12, `${c.id}: la masa total es la suma de las piezas`);
    ok(m.total > 0 && Object.values(m.byPiece).every((x) => x >= 0), `${c.id}: masas positivas`);
    near(m.core, m.byPiece.root, 1e-15, `${c.id}: masa del núcleo`);
  }
  near(body.A.mass.comProfile[0], 0, 0.0015, 'A: simétrica, el centro de masa cae a menos de 1,5 mm del centro');
  ok(body.D.mass.total > 2 * body.A.mass.total, 'D (erizo de 30 palitos) pesa más del doble que A');
  ok(body.E.mass.total > body.E.mass.core + 0.003, 'E: lo decorativo y la maza suman masa');
  near(body.E.mass.byPiece[stroke.id], 0, 0, 'E: el ketchup no pesa');
  const decoMass = dE.decorative.reduce((a, d) => a + d.mass, 0);
  ok(decoMass > 0 && body.E.mass.total >= body.E.mass.core + decoMass, 'E: la masa decorativa está dentro del total');

  section('tanda 5: criaturas (criterios de aceptación)');
  const bA = body.A;
  ok(bA.locomotion.mode === 'walk', 'A camina');
  ok(bA.support.feet.length === 2 && bA.support.margin > 0 && bA.support.loadRatio < 1, 'A: 2 apoyos, centro de masa entre ellos, aguantan su peso');
  const legsLimbs = bA.limbs.filter((l) => bA.support.feet.includes(l.id));
  ok(legsLimbs.length === 2 && legsLimbs.every((l) => l.dominant === 'support' && l.profile.angleDeg < -60), 'A: las dos piernas apoyan');
  const armsLimbs = bA.limbs.filter((l) => !bA.support.feet.includes(l.id));
  ok(armsLimbs.length === 2 && armsLimbs.some((l) => l.dominant === 'strike' && l.caps.strike >= 0.6), 'A: el brazo de adelante golpea');
  ok(armsLimbs.every((l) => l.caps.support === 0), 'A: los brazos no apoyan');
  ok(body.B.locomotion.mode === 'drag' && body.B.support.feet.length === 0, 'B se arrastra (ningún brazo apoya)');
  ok(body.B.limbs.every((l) => l.caps.support === 0) && body.B.limbs.filter((l) => l.caps.strike >= 0.3).length >= 1, 'B: 4 brazos, ninguno apoya y al menos uno golpea (los de atrás y los apretados de a dos pesan menos)');
  ok(body.C.locomotion.mode === 'drag' && body.C.limbs.length === 1, 'C se arrastra con su único brazo');
  const cl = body.C.limbs[0];
  ok(cl.profile.inDepth && cl.profile.foreshortening < Math.SQRT1_2 && cl.profile.length2D < cl.length, 'C: su brazo sale marcado "en profundidad" (se ve corto en reposo)');
  ok(cl.caps.strike >= 0.3 && cl.dominant === 'strike', 'C: aun en profundidad, ataca (con su largo real al girar al plano)');
  ok(body.C.warnings.some((w) => w.includes('en profundidad') && w.includes('se ve corta en reposo') && w.includes('largo real al girar al plano')), 'C: el aviso del panel dice lo acordado');
  const bD = body.D;
  const cov = idx.angularCoverageDeg(bD.limbs, idx.CREATURE_CONFIG.profile.minShapeThickness);
  ok(bD.locomotion.mode === 'roll', 'D RUEDA');
  ok(bD.limbs.length >= idx.CREATURE_CONFIG.locomotion.rollMinLimbs && cov >= idx.CREATURE_CONFIG.locomotion.rollMinCoverageDeg, `D: muchas extremidades en todas direcciones (${bD.limbs.length}, cobertura ${cov.toFixed(0)}°)`);
  ok(bD.limbs.every((l) => l.caps.strike < idx.CREATURE_CONFIG.capabilities.minRole), 'D casi no golpea: ninguna extremidad llega al mínimo de golpe');
  ok(bD.locomotion.brake <= 0.2 && bD.locomotion.turn <= 0.25, 'D casi no frena ni gira');
  const swingMean = bD.limbs.reduce((a, l) => a + (l.mobility.maxDeg - l.mobility.minDeg), 0) / bD.limbs.length;
  ok(swingMean < 0.25 * idx.CREATURE_CONFIG.mobility.swingDeg, `D: sus púas casi no se mueven (giro medio ${swingMean.toFixed(0)}°)`);
  ok(bD.warnings.some((w) => w.includes('rueda') && w.includes('casi no golpea')), 'D: el aviso lo dice');
  ok(body.veg.locomotion.mode === 'walk' && body.veg.support.feet.length === 2, 'el vegetal camina (2 apoyos)');
  ok(body.veg.limbs.length === 4 && body.veg.decorative.length === 0, 'vegetal: 4 extremidades, nada decorativo');
  ok(body.E.locomotion.mode === 'drag', 'E se arrastra (nada que apoye hacia abajo)');
  const mz = body.E.limbs.find((l) => l.tag === 'maza');
  ok(mz.mobility.droops && mz.mobility.maxDeg <= mz.mobility.restDeg + 1e-9, 'E: la maza cuelga, solo puede bajar');
  ok(mz.mobility.maxDeg - mz.mobility.minDeg < 0.25 * idx.CREATURE_CONFIG.mobility.swingDeg, 'E: la maza casi no se mueve (pesa mucho)');
  ok(body.E.limbs.filter((l) => l.pairedWith).every((l) => l.profile.inDepth), 'E: las dos mitades de la vara pasante están en profundidad (apuntan a ±Z)');
  ok(body.E.warnings.some((w) => w.includes('MVP 0') && w.includes('extremidad propia')), 'E: avisa que el palito del chizito ensartado no cuenta como extremidad propia (deuda del MVP 1)');
  ok(body.E.warnings.some((w) => w.includes('decorativa')), 'E: avisa de las piezas decorativas');

  section('tanda 5: invariantes');
  const allFin = (x) => (typeof x === 'number' ? Number.isFinite(x) : Array.isArray(x) ? x.every(allFin) : x && typeof x === 'object' ? Object.values(x).every(allFin) : true);
  ok(Object.values(body).every(allFin), 'ningún NaN ni infinito en ninguna criatura');
  const lc = idx.CREATURE_CONFIG.locomotion;
  ok(Object.values(body).every((b) => b.locomotion.mode === 'immobile' || (b.locomotion.speed >= lc.minSpeed - 1e-12 && b.locomotion.speed <= lc.maxSpeed + 1e-12)), 'velocidades dentro de [mínima, máxima]');
  ok(Object.values(body).every((b) => b.limbs.every((l) => Object.values(l.caps).every((v) => v >= 0 && v <= 1))), 'capacidades entre 0 y 1');
  ok(Object.values(body).every((b) => b.limbs.every((l) => l.mobility.minDeg <= l.mobility.restDeg + 1e-9 && l.mobility.restDeg <= l.mobility.maxDeg + 1e-9)), 'el reposo está dentro del rango de giro');
  ok(Object.values(body).every((b) => b.limbs.every((l) => l.strength >= 0 && l.strength <= 1 && l.durability > 0)), 'fuerza entre 0 y 1, resistencia positiva');
  ok(JSON.stringify(analyzeBody(built[4].snapshot).body) === JSON.stringify(body.E), 'el análisis es determinista');
  ok(Object.values(body).every((b) => b.limbs.every((l) => l.mass > 0)), 'toda extremidad pesa');

  section('tanda 5: el frente cambia el resultado como corresponde');
  const mirrored = Object.fromEntries(flipped.map((c) => [c.id, analyzeBody(c.snapshot).body]));
  for (const id of ['A', 'B', 'veg']) {
    ok(mirrored[id].locomotion.mode === body[id].locomotion.mode && mirrored[id].limbs.length === body[id].limbs.length, `${id}: con el giro de 180° camina/arrastra igual y con las mismas extremidades`);
  }
  const strikes = (b) => b.limbs.map((l) => l.caps.strike).sort((a, c) => a - c);
  ok(['A', 'B', 'veg'].every((id) => strikes(mirrored[id]).every((v, i) => Math.abs(v - strikes(body[id])[i]) < 0.08)), 'A, B y vegetal son casi simétricas (cada palito tiene su propio largo): el giro de 180° da las mismas capacidades (±0,08)');
  ok([body.A, mirrored.A].every((b2) => { const arm = b2.limbs.find((l) => l.caps.strike >= 0.6); return arm.profile.pivot[0] > 0 && arm.profile.tip[0] > arm.profile.pivot[0]; }), 'A: golpea con el brazo del lado que mira adelante, con frente a la derecha o a la izquierda')
  const zA = analyzeBody(zfront[0].snapshot).body;
  ok(zA.limbs.filter((l) => l.profile.inDepth).length === 2, 'A con frente +Z (descartado): sus dos brazos (±Y) quedan en profundidad');
  ok(body.A.limbs.filter((l) => l.profile.inDepth).length === 0, 'A con el frente por defecto: ninguna en profundidad');

  section('tanda 5: casos sintéticos de locomoción');
  const heavy = { ...idx.CREATURE_CONFIG, locomotion: { ...idx.CREATURE_CONFIG.locomotion, massRef: 0.0005 } };
  const hv = analyzeBody(A.snapshot, heavy).body;
  ok(hv.locomotion.mode === 'immobile' && hv.locomotion.speed <= lc.immobileSpeed + 1e-12, 'con masa de referencia chica, A queda casi inmóvil');
  const legId = bA.support.feet[0].split(':')[1];
  const oneLeg = { ...A.snapshot, pieces: A.snapshot.pieces.filter((p) => p.id !== legId), links: A.snapshot.links.filter((l) => l.childId !== legId) };
  const hop = analyzeBody(oneLeg).body;
  ok(hop.locomotion.mode === 'hop' && hop.support.feet.length === 1 && hop.locomotion.jump > 0, 'A con una sola pierna salta');
  ok(hop.support.margin < 0, 'con un solo apoyo el centro de masa queda fuera del intervalo');
  const stubbyCfg = { ...idx.CREATURE_CONFIG, limb: { ...idx.CREATURE_CONFIG.limb, minFreeAbs: 0.05 } };
  ok(analyzeBody(A.snapshot, stubbyCfg).body.limbs.length === 0, 'subir minFreeAbs en config.ts (a 5 cm) deja a A sin extremidades: el umbral vive ahí');
  const noLimbs = analyzeBody({ ...A.snapshot, pieces: [A.snapshot.pieces[0]], links: [] }).body;
  ok(noLimbs.limbs.length === 0 && noLimbs.locomotion.mode === 'drag' && noLimbs.locomotion.speed >= lc.minSpeed, 'sin extremidades: el cuerpo se arrastra (mínimo garantizado)');
  ok(noLimbs.warnings.some((w) => w.includes('arrastra')), 'y avisa');

  section('tanda 5: los umbrales están solo en config.ts');
  for (const f of ['context', 'mass', 'limbs', 'support', 'locomotion', 'warnings', 'index']) {
    const text = strip(fs.readFileSync(`src/creature/analyze/${f}.ts`, 'utf8'));
    const bad = (text.match(/\b\d+\.\d+\b|\b\d{3,}\b/g) ?? []).filter((n) => n !== '180');
    ok(bad.length === 0, `analyze/${f}.ts: ningún número suelto${bad.length ? ' (' + bad.join(', ') + ')' : ''}`);
  }


  // ───────────── Tanda 6: acciones, perfil 2D, fachada ─────────────
  section('tanda 6: acciones ofensivas');
  const { interpret, describeCreature, buildProfile2D, hitboxPath, attackHitbox, swingArc, poseGroup, mapPoint, hurtGroupOf } = idx;
  const full = Object.fromEntries(built.map((c) => [c.id, interpret(c.snapshot)]));
  const kinds = (a) => a.actions.map((x) => x.kind).sort().join(',');
  ok(kinds(full.A) === 'embestida,estocada', `A: estocada con el brazo de adelante y embestida (${kinds(full.A)})`);
  ok(kinds(full.B) === 'embestida,estocada', `B: estocada y embestida (${kinds(full.B)})`);
  ok(kinds(full.C) === 'embestida,golpe-alto', `C: golpe alto (su brazo en profundidad) y embestida (${kinds(full.C)})`);
  ok(kinds(full.D) === 'rodada', `D: solo la rodada (${kinds(full.D)})`);
  ok(kinds(full.E) === 'embestida,mazazo', `E: mazazo y embestida (${kinds(full.E)})`);
  ok(kinds(full.veg) === 'embestida,estocada', `vegetal: igual que A (${kinds(full.veg)})`);
  const STRIKES = ['jab', 'estocada', 'golpe-alto', 'barrida', 'mazazo'];
  ok(full.D.actions.every((x) => !STRIKES.includes(x.kind)), 'D casi no golpea: ninguna acción de golpe');
  ok(full.D.locomotion.mode === 'roll' && full.D.locomotion.brake <= 0.2, 'D rueda y casi no frena (criterio de aceptación)');
  ok(full.D.actions[0].input === 'attack' && full.D.actions[0].kind === 'rodada', 'D: la rodada es su ataque');
  for (const c of built) {
    const a = full[c.id];
    const inputs = a.actions.map((x) => x.input);
    ok(new Set(inputs).size === inputs.length, `${c.id}: una acción por entrada (sin duplicados)`);
    ok(new Set(a.actions.map((x) => x.id)).size === a.actions.length, `${c.id}: ids de acción únicos`);
    ok(a.actions.length >= 1 && a.actions.some((x) => x.input === 'attack'), `${c.id}: siempre tiene un ataque`);
    ok(a.actions.every((x) => Number.isInteger(x.startup) && x.startup > 0 && x.active > 0 && x.recovery > 0 && x.damage > 0 && x.reach > 0 && x.hitRadius > 0), `${c.id}: tiempos, daño, alcance y radio positivos`);
    ok(a.actions.every((x) => !x.limbId || a.limbs.some((l) => l.id === x.limbId)), `${c.id}: cada acción apunta a una extremidad que existe`);
    ok(a.actions.every((x) => !x.limbId || a.limbs.find((l) => l.id === x.limbId).caps.strike >= idx.CREATURE_CONFIG.capabilities.minRole), `${c.id}: solo golpean las extremidades con capacidad de golpe`);
  }
  const em = (a) => a.actions.find((x) => x.kind === 'embestida');
  ok(['A', 'B', 'C', 'E', 'veg'].every((id) => !!em(full[id])) && !em(full.D), 'la embestida cubre el ataque neutral salvo en el que rueda');
  const mazazo = full.E.actions.find((x) => x.kind === 'mazazo');
  const estocada = full.A.actions.find((x) => x.kind === 'estocada');
  ok(mazazo.damage > 2 * estocada.damage && mazazo.startup > estocada.startup && mazazo.input === 'hold+attack', 'el mazazo pega mucho más que la estocada pero arranca más lento');
  ok(full.C.actions.find((x) => x.kind === 'golpe-alto').reach > full.C.limbs[0].profile.length2D, 'C: su golpe tiene el largo real de la extremidad, mayor que lo que se ve en reposo');
  ok(full.A.defense.kind === 'guard' && full.A.limbs.some((l) => l.id === full.A.defense.limbId), 'A: defiende con guardia usando una extremidad');
  ok(full.C.defense.kind === 'curl' && full.C.defense.reduction > 0, 'C: sin extremidad que defienda, se encoge');
  ok(Object.values(full).every((a) => a.defense.reduction > 0 && a.defense.reduction < 1), 'la defensa reduce daño sin anularlo');
  const heavyEnd = (x) => x.kind === 'mazazo' ? x.startup : 0;
  ok(heavyEnd(mazazo) <= 6 + 14 * idx.CREATURE_CONFIG.actions.maxMassNorm, 'el arranque está acotado por el tope de masa');

  section('tanda 6: perfil 2D y cajas de golpe');
  for (const c of built) {
    const a = full[c.id];
    const pf = a.profile2D;
    ok(pf.groups.length === 1 + a.limbs.length && pf.groups[0].owner === 'core', `${c.id}: un grupo de cajas por extremidad más el del cuerpo`);
    ok(pf.groups[0].shapes.length >= 1, `${c.id}: el cuerpo tiene caja`);
    const all = pf.groups.flatMap((g) => g.shapes);
    const bb = S.bounds2D(all);
    nearV(bb.min, pf.bounds.min, 1e-9, `${c.id}: bounds mínimos`);
    nearV(bb.max, pf.bounds.max, 1e-9, `${c.id}: bounds máximos`);
    near(pf.bounds.min[1], 0, 1e-6, `${c.id}: el piso está en y = 0`);
    ok(a.limbs.every((l) => !!hurtGroupOf(pf, l.id)?.pivot), `${c.id}: cada extremidad tiene su pivote`);
    ok(pf.groups.every((g) => g.shapes.every((sh) => allFin(sh))), `${c.id}: formas finitas`);
  }
  ok(!full.E.profile2D.groups.some((g) => g.shapes.length === 0), 'E: ningún grupo vacío (el ketchup no entra)');
  // Cambio de lado: espejo exacto en x, los datos no cambian.
  const mirrorFull = Object.fromEntries(built.map((c) => [c.id, interpret(c.snapshot, { facing: -1 })]));
  for (const c of built) {
    const a = full[c.id];
    const b = mirrorFull[c.id];
    const { profile2D: pa, ...restA } = a;
    const { profile2D: pb, ...restB } = b;
    ok(JSON.stringify(restA) === JSON.stringify(restB), `${c.id}: girar 180° no cambia nada del análisis (solo el perfil)`);
    nearV([pb.bounds.min[0], pb.bounds.max[0]], [-pa.bounds.max[0], -pa.bounds.min[0]], 1e-9, `${c.id}: los límites del perfil se espejan en x`);
    near(pb.bounds.max[1], pa.bounds.max[1], 1e-12, `${c.id}: la altura no cambia`);
    pa.groups.forEach((g, i) => {
      const h = pb.groups[i];
      if (g.pivot) nearV(h.pivot, [-g.pivot[0], g.pivot[1]], 1e-9, `${c.id}: el pivote se espeja`);
      const ca = g.shapes.find((x) => x.kind === 'capsule');
      const cb = h.shapes.find((x) => x.kind === 'capsule');
      if (ca) { nearV(cb.a, [-ca.a[0], ca.a[1]], 1e-9, `${c.id}: capsula.a espejada`); near(cb.r, ca.r, 1e-15, `${c.id}: mismo radio`); }
    });
  }
  // Colisiones: dos A enfrentadas, la estocada de una llega al cuerpo de la otra.
  const aPlus = full.A.profile2D;
  const reachAct = full.A.actions.find((x) => x.kind === 'estocada');
  const strikeEnd = attackHitbox(aPlus, full.A.limbs, reachAct, 1);
  const strikeBox = { kind: 'capsule', a: strikeEnd.center, b: strikeEnd.center, r: strikeEnd.r };
  const rival = (dx) => aPlus.groups[0].shapes.map((sh) => S.transform2D(sh, { facing: -1, translate: [dx, 0] })); // solo el cuerpo del rival
  const rivalMin = S.bounds2D(rival(0)).min[0];
  const dxNear = strikeEnd.center[0] - rivalMin - 0.003; // el borde más cercano del cuerpo del rival queda 3 mm adentro de la caja de golpe
  const touches = (dx) => rival(dx).some((sh) => S.overlap2D(strikeBox, sh));
  ok(touches(dxNear) && !touches(dxNear + 0.2), 'la caja de la estocada toca el cuerpo del rival cuando está cerca y no cuando está 20 cm más lejos');

  section('tanda 6: barrido de los golpes');
  for (const c of built) {
    const a = full[c.id];
    for (const act of a.actions.filter((x) => x.limbId)) {
      const limb = a.limbs.find((l) => l.id === act.limbId);
      const pivot = mapPoint(a.profile2D, limb.profile.pivot);
      const path = hitboxPath(a.profile2D, a.limbs, act, 9);
      ok(path.length === 9 && path.every((h) => Math.abs(Math.hypot(h.center[0] - pivot[0], h.center[1] - pivot[1]) - limb.length) < 1e-9 && h.r === act.hitRadius), `${c.id}/${act.kind}: el barrido conserva el largo real de la extremidad`);
      const arc = swingArc(limb);
      ok(arc.from >= limb.mobility.minDeg - 1e-9 && arc.from <= limb.mobility.maxDeg + 1e-9 && arc.to >= limb.mobility.minDeg - 1e-9 && arc.to <= limb.mobility.maxDeg + 1e-9, `${c.id}/${act.kind}: el arco queda dentro del rango de giro`);
    }
  }
  const frontArm = full.A.limbs.find((l) => l.caps.strike >= 0.6);
  const t0 = attackHitbox(aPlus, full.A.limbs, reachAct, 0);
  nearV(t0.center, mapPoint(aPlus, frontArm.profile.tip), 1e-9, 'A: el golpe arranca en la punta de la extremidad en reposo');
  const cLimb = full.C.limbs[0];
  const cAct = full.C.actions.find((x) => x.limbId);
  const cEnd = attackHitbox(full.C.profile2D, full.C.limbs, cAct, 1);
  const cPivot = mapPoint(full.C.profile2D, cLimb.profile.pivot);
  ok(Math.hypot(cEnd.center[0] - cPivot[0], cEnd.center[1] - cPivot[1]) > 1.5 * cLimb.profile.length2D, 'C: al girar al plano, su golpe llega 1,5× más lejos que lo que se ve en reposo');
  const mirroredHit = attackHitbox(mirrorFull.A.profile2D, full.A.limbs, reachAct, 1);
  nearV(mirroredHit.center, [-strikeEnd.center[0], strikeEnd.center[1]], 1e-9, 'el golpe girado 180° es el espejo exacto');
  const grp = hurtGroupOf(aPlus, frontArm.id);
  const unrot = poseGroup(aPlus, grp, 0);
  ok(JSON.stringify(unrot) === JSON.stringify(grp.shapes), 'girar 0° no mueve nada');
  const rot90 = poseGroup(aPlus, grp, 90);
  const capR = rot90.find((x) => x.kind === 'capsule');
  const capG = grp.shapes.find((x) => x.kind === 'capsule');
  near(Math.hypot(capR.b[0] - grp.pivot[0], capR.b[1] - grp.pivot[1]), Math.hypot(capG.b[0] - grp.pivot[0], capG.b[1] - grp.pivot[1]), 1e-9, 'girar una extremidad conserva su distancia al pivote');
  ok(Math.abs(capR.b[0] - capG.b[0]) > 0.01, 'y la mueve de lugar');

  section('tanda 6: fachada interpret() y texto del panel');
  ok(JSON.stringify(interpret(built[4].snapshot)) === JSON.stringify(full.E), 'interpret es determinista');
  ok(Object.values(full).every(allFin), 'ningún NaN ni infinito en ningún resultado');
  for (const c of built) {
    const lines = describeCreature(full[c.id]);
    ok(lines.length >= 5 && lines.every((l) => l.length > 0 && !/undefined|NaN|\[object/.test(l)), `${c.id}: el texto del panel está completo y limpio`);
  }
  ok(describeCreature(full.D).some((l) => l.includes('rueda')) && describeCreature(full.D).some((l) => l.includes('rodada')), 'D: el texto dice que rueda y que su ataque es la rodada');
  ok(describeCreature(full.C).some((l) => l.includes('en profundidad')), 'C: el panel marca el brazo en profundidad');
  ok(describeCreature(full.E).some((l) => l.includes('MVP 0') && l.includes('extremidad propia')), 'E: el panel avisa lo de los palitos en el chizito ensartado');
  ok(interpret(zfront[0].snapshot).warnings.some((m) => m.includes('±Y')), 'un frente +Z se acepta con aviso de que no es ±Y');
  const weird = { ...A.snapshot, orientation: { front: [0, 0, 0], up: [0, 0, 0] } };
  let threw = false;
  let weirdOut = null;
  try { weirdOut = interpret(weird); } catch { threw = true; }
  ok(!threw && allFin(weirdOut), 'un frente nulo no tira y no da NaN (se avisa)');
  ok(!interpret({ ...A.snapshot, pieces: [A.snapshot.pieces[0]], links: [] }).actions.some((x) => x.limbId), 'sin extremidades: solo acciones del cuerpo');

  section('tanda 6: rendimiento con 40 piezas');
  const { CreatureBuilder } = await load('/src/creature/fixtures/build.ts');
  const big = new CreatureBuilder('X', 'X · 40 palitos', 3);
  for (let i = 0; i < 40; i++) {
    const sd = big.side(-0.018 + (i % 8) * 0.0051, (Math.floor(i / 8) * 72 + (i % 2) * 36) % 360);
    big.rod(big.root, sd.point, sd.n, 0.009, { seed: 900 + i });
  }
  const bigSnap = big.build().snapshot;
  ok(bigSnap.budget.pieceCount === 40, 'criatura de prueba de rendimiento: 40 piezas');
  interpret(bigSnap);
  const t1 = performance.now();
  for (let i = 0; i < 30; i++) interpret(bigSnap);
  const ms = (performance.now() - t1) / 30;
  ok(ms < 5, `interpretar 40 piezas tarda ${ms.toFixed(2)} ms (< 5 ms)`);

  section('tanda 6: hojas visuales y umbrales en config');
  const hit = fs.readFileSync('docs/creature/hitboxes.svg', 'utf8');
  ok(hit.startsWith('<svg') && hit.length > 5000 && hit.includes('giro de 180°'), 'hitboxes.svg existe');
  const hs = await load('/src/creature/fixtures/hitboxSheet.ts');
  ok(hs.renderHitboxSheet(built) === hit, 'hitboxes.svg coincide con lo que genera el código');
  for (const f of ['analyze/actions', 'interpret', 'project/profile2d', 'project/hitboxes']) {
    const text = strip(fs.readFileSync(`src/creature/${f}.ts`, 'utf8'));
    const bad = (text.match(/\b\d+\.\d+\b|\b\d{3,}\b/g) ?? []).filter((n) => n !== '180');
    ok(bad.length === 0, `${f}.ts: ningún número suelto${bad.length ? ' (' + bad.join(', ') + ')' : ''}`);
  }

  // @@TESTS@@
} finally {
  await server.close();
}

console.log(`\n${passed} comprobaciones OK, ${failures.length} fallas`);
process.exit(failures.length ? 1 : 0);
