// Probador del panel en el juego real (?creature&probador): teclas reales, animación, golpes, capturas y fps.
// Uso: node scripts/creature-prober-test.mjs [outDir]   (con `npm run dev` corriendo)
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] ?? 'docs/creature/capturas';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/?capture&creature&probador');
await page.waitForFunction(() => !!window.__prober, null, { timeout: 300000 });
let bad = 0;
const ok = (c, msg) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'FALLA'} ${msg}`); };
const P = (fn, ...args) => page.evaluate(fn, ...args);
const hud = () => P(() => document.getElementById('cs-prober').innerText);
const snap = async (name) => { await P(() => window.__prober.render()); await page.screenshot({ path: `${out}/probador-${name}.png` }); };

ok(await P(() => !document.getElementById('cs-prober').hidden), 'con ?creature&probador la ventana arranca abierta');
await P(() => window.__prober.setManual(true));
const hold = async (code, frames) => { await page.keyboard.down(code); await P((n) => window.__prober.advance(n), frames); await page.keyboard.up(code); };

const ids = ['A', 'B', 'C', 'D', 'E', 'veg', 'P', 'S8', 'F40', 'criatura-20261011-1623'];
const modes = {};
for (const id of ids) {
  await P((id) => window.__prober.select(id), id);
  const st0 = await P(() => { const s = window.__prober.state(); return { mode: s.plan.mode, speed: s.plan.speed, facing: s.plan.facing, limbs: s.analysis.limbs.length }; });
  modes[id] = st0.mode;
  // Derecha con la flecha: avanza (o sigue su camino) y la animación se ve.
  const dir = st0.facing === 1 ? 'ArrowRight' : 'ArrowLeft';
  await hold(dir, 75);
  const mv = await P(() => { const s = window.__prober.state(); return { x: s.sim.x, vx: s.sim.vx, minLow: s.pose.lowest }; });
  ok(Math.abs(mv.x) > 0 && mv.minLow >= -1e-9, `${id}: con la flecha se mueve (${st0.mode}, ${(Math.abs(mv.x) * 1000).toFixed(1)} mm en 1,25 s) y no atraviesa el piso`);
  await snap(id);
  const text = await hud();
  ok(text.includes('Movimiento:') && text.includes('mm/s') && text.includes('Z') && text.includes('X'), `${id}: el cartel muestra el modo, la velocidad y las teclas`);
}
ok(modes.A === 'walk' && modes.D === 'roll' && modes.S8 === 'hop' && modes['criatura-20261011-1623'] === 'drag', `modos: A camina, D rueda, S8 salta, la mía se arrastra (${JSON.stringify(modes)})`);

// Golpes con la tecla Z (y flechas): cuadros del análisis y caja de golpe.
await P(() => window.__prober.select('A'));
await P(() => window.__prober.advance(30, { move: 0 })); // quieta
await page.keyboard.down('KeyZ');
await P(() => window.__prober.advance(1));
await page.keyboard.up('KeyZ');
const strike = await P(() => {
  const p = window.__prober; const a = p.state().analysis; const act = a.actions.find((x) => x.input === 'attack');
  const frames = [];
  let guardCount = 0;
  for (let i = 0; i < act.startup + act.active + act.recovery + 2; i++) { p.advance(1, { move: 0 }); const s = p.state(); frames.push([s.sim.combat.phase, !!s.pose.hitbox]); }
  return { act: [act.kind, act.startup, act.active, act.recovery], frames, guardCount };
});
console.log('   ataque Z:', strike.act.join(' '), '→', strike.frames.map((f) => f[0][0]).join(''));
ok(strike.frames.filter((f) => f[1]).length === strike.act[2], `Z: la caja de golpe está activa exactamente ${strike.act[2]} cuadros (los del análisis)`);
// Captura en pleno golpe: estocada con → + Z.
await P(() => window.__prober.select('A'));
await page.keyboard.down('ArrowRight');
await page.keyboard.down('KeyZ');
await P((n) => window.__prober.advance(n), 1);
await page.keyboard.up('KeyZ');
await P(() => { const p = window.__prober; for (let i = 0; i < 40; i++) { p.advance(1); if (p.state().sim.combat.phase === 'active') break; } });
await page.keyboard.up('ArrowRight');
ok((await P(() => window.__prober.state().sim.combat.phase)) === 'active' && (await hud()).includes('estocada'), '→ + Z da la estocada y el cartel marca ACTIVO');
await snap('A-estocada');
// Guardia con X.
await P(() => window.__prober.advance(30, { move: 0 }));
await page.keyboard.down('KeyX');
await P(() => window.__prober.advance(12));
ok((await P(() => window.__prober.state().sim.combat.guard)) === (await P(() => 6)) && (await hud()).includes('arriba'), 'X levanta la guardia (cartel: arriba)');
await snap('A-guardia');
await page.keyboard.up('KeyX');
// Saltito, rodada y arrastre en el aire / suelo.
await P(() => window.__prober.select('S8'));
await page.keyboard.down('ArrowRight');
await P(() => { const p = window.__prober; for (let i = 0; i < 80; i++) { p.advance(1); if (p.state().sim.air && p.state().sim.hopFrame === 9) break; } });
await page.keyboard.up('ArrowRight');
ok(await P(() => window.__prober.state().sim.h > 0), 'S8: salta (queda en el aire con altura > 0)');
await snap('S8-salto');
await P(() => window.__prober.select('D'));
await hold('ArrowRight', 200);
await snap('D-rueda');
ok(await P(() => window.__prober.state().sim.angle !== 0), 'D: rueda (el ángulo cambia)');

// Ctrl+Z sigue llegando al juego con el probador abierto (sus teclas no se la roban).
await P(() => window.__prober.select('A'));
const n0 = await P(() => window.__creature.state().snapshot.pieces.length);
await P(() => window.__prober.select('C'));
await page.keyboard.press('Control+z');
await page.waitForTimeout(700);
const n1 = await P(() => window.__creature.state().snapshot.pieces.length);
ok(n1 === n0, `Ctrl+Z llega al juego con el probador abierto (deshizo la carga de C: ${n0} piezas otra vez)`);

// Ctrl+O / criatura del juego: "La del juego" sigue lo que el panel interpreta.
await P(() => window.__prober.select('__live'));
ok(await P(() => window.__prober.state().id === '__live'), 'la opción "La del juego" existe y funciona');

// fps: bucle real (rAF) con 40 extremidades caminando y pegando, y costo por cuadro.
await P(() => window.__prober.select('F40'));
await P(() => window.__prober.setManual(false));
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(500);
const fpsSamples = [];
for (let i = 0; i < 6; i++) { await page.keyboard.down('KeyZ'); await page.waitForTimeout(200); await page.keyboard.up('KeyZ'); await page.waitForTimeout(300); fpsSamples.push(await P(() => window.__prober.fps())); }
await page.keyboard.up('ArrowRight');
const fps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
const bench = await P(() => window.__prober.benchmark(600));
console.log(`   fps medidos (F40, 40 extremidades, bucle real): ${fps.toFixed(1)} (mín. ${Math.min(...fpsSamples).toFixed(1)}); costo simular + posar + dibujar: ${bench.msPerFrame.toFixed(2)} ms por cuadro → ${bench.fpsPotential.toFixed(0)} fps posibles`);
ok(bench.limbs === 40 && bench.msPerFrame < 1000 / 60, `F40: ${bench.limbs} extremidades; ${bench.msPerFrame.toFixed(2)} ms por cuadro < 16,7 ms`);
// Este Chromium no tiene GPU (composición por software): el piso de la prueba es 30 fps; en una máquina con GPU se espera el tope de 60.
ok(fps >= 30, `F40: el bucle real mantiene ${fps.toFixed(1)} fps (piso 30 en este entorno sin GPU; objetivo 60)`);
await P(() => window.__prober.setManual(true));
await P(() => window.__prober.advance(20, { move: 1 }));
await snap('F40');
console.log(errors.length ? 'errores de página: ' + [...new Set(errors)].slice(0, 5).join(' | ') : 'sin errores de página');
await browser.close();
process.exit(bad ? 1 : 0);
