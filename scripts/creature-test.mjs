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
  // @@TESTS@@
} finally {
  await server.close();
}

console.log(`\n${passed} comprobaciones OK, ${failures.length} fallas`);
process.exit(failures.length ? 1 : 0);
