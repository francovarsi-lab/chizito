// Prueba del resolver (tanda 7) en el juego real: carga cada criatura de prueba como Ctrl+O, la resuelve con las mallas
// reales (`resolveSnapshot`) y la compara con el snapshot analítico de referencia (src/creature/fixtures/*.snapshot.json).
// Después interpreta las dos y compara el resultado. Uso: node scripts/creature-resolve-test.mjs   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';

// Tolerancias. Lo que depende de la POSE (formas, anclas, ejes) debe coincidir al milímetro y a 2°. Lo que depende de la
// SUPERFICIE (cuerda, salida, normales) no: la referencia usa una cápsula ideal y el chizito real es grumoso y apenas curvo
// (±2–3 mm de cuerda, ±10–20° de normal). Ahí el resolver es el que dice la verdad; se acota a la rugosidad esperable.
const TOL = { pose: 0.001, angle: 2, chord: 0.0035, radius: 0.0005, normal: 25 };
const ids = ['A', 'B', 'C', 'D', 'E', 'veg'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/?capture');
await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 300000 });

let passed = 0;
const failures = [];
const worst = {};
const track = (name, v) => { worst[name] = Math.max(worst[name] ?? 0, v); };
const ok = (c, msg) => { if (c) passed++; else { failures.push(msg); console.log('  FALLA:', msg); } };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const ang = (a, b) => { const la = Math.hypot(...a), lb = Math.hypot(...b); if (la < 1e-9 || lb < 1e-9) return 0; return (Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)))) * 180) / Math.PI; };
const within = (name, v, tol, msg) => { track(name, v); ok(v <= tol, `${msg} (${name}: ${v.toFixed(4)} > ${tol})`); };

for (const id of ids) {
  const out = await page.evaluate(async (id) => {
    const c = window.__chizito;
    const text = await (await fetch(`/assets/creatures/${id}.json`)).text();
    c.persistence.loadText(text, false);
    c.renderFrames(2);
    const { resolveSnapshot } = await import('/src/creature/resolve/index.ts');
    const { interpret } = await import('/src/creature/index.ts');
    const { PieceRegistry } = await import('/src/pieces/PieceRegistry.ts');
    const { ALL_DEFINITIONS } = await import('/src/pieces/definitions.ts');
    const reg = new PieceRegistry();
    ALL_DEFINITIONS.forEach((d) => reg.register(d));
    const t0 = performance.now();
    const snap = resolveSnapshot({ construction: c.construction, pieces: reg, name: JSON.parse(text).creature.name });
    const ms = performance.now() - t0;
    const a = interpret(snap);
    const limbIds = a.limbs.map((l) => l.id).sort();
    const strip = (x) => JSON.parse(JSON.stringify(x));
    return { snap: strip(snap), ms, summary: { mode: a.locomotion.mode, limbs: a.limbs.length, limbIds, deco: a.decorative.map((d) => d.reason).sort(), actions: a.actions.map((x) => x.kind).sort(), inDepth: a.limbs.filter((l) => l.profile.inDepth).length, brake: a.locomotion.brake, mass: a.mass.total, warnings: a.warnings } };
  }, id);
  const ref = JSON.parse(fs.readFileSync(`src/creature/fixtures/${id}.snapshot.json`, 'utf8'));
  const got = out.snap;
  console.log(`\n# ${id}: resuelta en ${out.ms.toFixed(0)} ms`);

  // ── piezas ──
  ok(got.pieces.map((p) => p.id).join() === ref.pieces.map((p) => p.id).join(), `${id}: mismas piezas y mismo orden`);
  ok(got.coreId === 'root' && got.pieces[0].kind === 'core', `${id}: el núcleo es el chizito raíz`);
  ok(got.links.length === got.pieces.length - 1, `${id}: una conexión por pieza no raíz`);
  ok(JSON.stringify(got.orientation) === JSON.stringify(ref.orientation), `${id}: orientación de combate (la de fábrica)`);
  ok(JSON.stringify(got.budget) === JSON.stringify(ref.budget), `${id}: presupuesto de piezas y trazos`);
  for (const rp of ref.pieces) {
    const gp = got.pieces.find((p) => p.id === rp.id);
    if (!gp) continue;
    ok(gp.type === rp.type && gp.kind === rp.kind && gp.cosmetic === rp.cosmetic && gp.stability === rp.stability && gp.proxyDe === rp.proxyDe, `${id}/${rp.id}: tipo, clase, cosmético, estabilidad y proxyDe`);
    ok(gp.shape.kind === rp.shape.kind, `${id}/${rp.id}: misma clase de forma`);
    if (gp.shape.kind !== rp.shape.kind) continue;
    if (rp.shape.kind === 'capsule') {
      within('forma.extremo', Math.max(dist(gp.shape.a, rp.shape.a), dist(gp.shape.b, rp.shape.b)), TOL.pose, `${id}/${rp.id}: extremos de la cápsula`);
      within('forma.radio', Math.abs(gp.shape.radius - rp.shape.radius), TOL.radius, `${id}/${rp.id}: radio`);
    } else if (rp.shape.kind === 'disc') {
      within('disco.centro', dist(gp.shape.center, rp.shape.center), TOL.pose, `${id}/${rp.id}: centro del disco`);
      within('disco.normal°', ang(gp.shape.normal, rp.shape.normal), TOL.angle, `${id}/${rp.id}: normal del disco`);
      within('disco.radio', Math.abs(gp.shape.radius - rp.shape.radius), TOL.pose, `${id}/${rp.id}: radio del disco`);
      ok(gp.shape.solidFraction > 0.4 && gp.shape.solidFraction <= 1, `${id}/${rp.id}: fracción sólida plausible (${gp.shape.solidFraction.toFixed(2)})`);
    } else {
      ok(gp.shape.points.length === rp.shape.points.length, `${id}/${rp.id}: mismos puntos de ketchup`);
      within('ketchup.punto', Math.max(0, ...gp.shape.points.map((p, i) => dist(p, rp.shape.points[i]))), TOL.pose, `${id}/${rp.id}: puntos del trazo`);
    }
  }

  // ── conexiones ──
  for (const rl of ref.links) {
    const gl = got.links.find((l) => l.childId === rl.childId);
    ok(!!gl, `${id}/${rl.childId}: tiene conexión`);
    if (!gl) continue;
    ok(gl.parentId === rl.parentId && gl.mode === rl.mode && gl.attach.frame === rl.attach.frame && gl.integrity === 'ok', `${id}/${rl.childId}: padre, modo y marco`);
    within('attach', Math.max(dist(gl.attach.entryPoint, rl.attach.entryPoint), dist(gl.attach.direction, rl.attach.direction), Math.abs(gl.attach.depth - rl.attach.depth), Math.abs(gl.attach.spin - rl.attach.spin)), 2e-6, `${id}/${rl.childId}: los datos de conexión son los del archivo`);
    if (rl.mode === 'paint') continue;
    within('ancla', dist(gl.anchor, rl.anchor), TOL.pose, `${id}/${rl.childId}: ancla`);
    within('eje°', ang(gl.axis, rl.axis), TOL.angle, `${id}/${rl.childId}: eje`);
    if (rl.mode === 'tail') { within('cola.embebido', Math.abs(gl.embedded - rl.embedded), TOL.chord, `${id}/${rl.childId}: embebido de la cola`); continue; }
    within('normal°', ang(gl.normal, rl.normal), TOL.normal, `${id}/${rl.childId}: normal de entrada (superficie grumosa)`);
    within('inclinación°', Math.abs(gl.tiltFromNormal - rl.tiltFromNormal) * 180 / Math.PI, TOL.normal, `${id}/${rl.childId}: inclinación`);
    within('cuerda', Math.abs((gl.chord ?? 0) - (rl.chord ?? 0)), TOL.chord, `${id}/${rl.childId}: cuerda`);
    within('embebido', Math.abs(gl.embedded - rl.embedded), TOL.chord, `${id}/${rl.childId}: embebido`);
    within('libre.cola', Math.abs(gl.freeTail - rl.freeTail), TOL.chord, `${id}/${rl.childId}: largo libre de la cola`);
    ok(!!gl.exit === !!rl.exit, `${id}/${rl.childId}: ${rl.exit ? 'atraviesa y sale' : 'no sale'}`);
    if (gl.exit && rl.exit) {
      within('salida.punto', dist(gl.exit.point, rl.exit.point), TOL.chord, `${id}/${rl.childId}: punto de salida`);
      within('salida.libre', Math.abs(gl.exit.freeTip - rl.exit.freeTip), TOL.chord, `${id}/${rl.childId}: punta libre`);
      within('salida.normal°', ang(gl.exit.normal, rl.exit.normal), TOL.normal, `${id}/${rl.childId}: normal de salida (malla grumosa)`);
    }
    ok(JSON.stringify(gl.crossings.map((x) => x.pieceId).sort()) === JSON.stringify(rl.crossings.map((x) => x.pieceId).sort()), `${id}/${rl.childId}: cruza las mismas piezas`);
  }

  // ── lo que interpreta el intérprete: igual con la criatura real que con la de referencia ──
  const refSummary = await page.evaluate(async (refSnap) => {
    const { interpret } = await import('/src/creature/index.ts');
    const a = interpret(refSnap);
    return { mode: a.locomotion.mode, limbs: a.limbs.length, limbIds: a.limbs.map((l) => l.id).sort(), deco: a.decorative.map((d) => d.reason).sort(), actions: a.actions.map((x) => x.kind).sort(), inDepth: a.limbs.filter((l) => l.profile.inDepth).length, brake: a.locomotion.brake, mass: a.mass.total };
  }, ref);
  const s = out.summary;
  ok(s.mode === refSummary.mode, `${id}: mismo modo de locomoción (${s.mode})`);
  ok(s.limbs === refSummary.limbs && JSON.stringify(s.limbIds) === JSON.stringify(refSummary.limbIds), `${id}: mismas extremidades, y son las mismas (${s.limbs})`);
  ok(JSON.stringify(s.deco) === JSON.stringify(refSummary.deco), `${id}: mismas decorativas y razones (${s.deco.join(',') || 'ninguna'})`);
  ok(JSON.stringify(s.actions) === JSON.stringify(refSummary.actions), `${id}: mismas acciones (${s.actions.join(',')})`);
  // Una púa puede estar justo en el límite de "en profundidad" (0,7071 de cociente) y un desvío de décimas de mm la cambia de lado.
  ok(Math.abs(s.inDepth - refSummary.inDepth) <= (id === 'D' ? 1 : 0) && s.brake === refSummary.brake, `${id}: mismas extremidades en profundidad (${s.inDepth} contra ${refSummary.inDepth}; en D se tolera ±1 por púas en el límite) y mismo freno`);
  within('masa(%)', (Math.abs(s.mass - refSummary.mass) / refSummary.mass) * 100, 12, `${id}: masa total (la real mide la fracción sólida de las papitas)`);
  console.log(`  ${s.mode} · ${s.limbs} extremidades · acciones ${s.actions.join(',')} · en profundidad ${s.inDepth}`);
}

console.log('\nError máximo medido:', Object.entries(worst).map(([k, v]) => `${k}=${v < 0.1 ? (v * 1000).toFixed(2) + (k.includes('°') || k.includes('%') ? '' : ' mm') : v.toFixed(2)}`).join(' · '));
if (errors.length) console.log('errores de página:', [...new Set(errors)].slice(0, 5));
console.log(`\n${passed} comprobaciones OK, ${failures.length} fallas`);
await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
