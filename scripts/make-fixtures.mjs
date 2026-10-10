// Genera las criaturas de prueba (A–E y rival vegetal):
//   public/assets/creatures/<id>.json            archivo real de criatura (Ctrl+O / arrastrar a la ventana)
//   src/creature/fixtures/<id>.snapshot.json     snapshot de referencia (analítico)
//   docs/creature/perfiles-a-vs-b.svg            perfiles laterales con frente +X (por defecto), −X y +Z
//   docs/creature/hitboxes.svg                   cajas de golpe (perfil 2D) con frente +X y −X
// El frente de COMBATE del snapshot es un PARÁMETRO (por defecto +X, arriba +Y):
//   node scripts/make-fixtures.mjs --front=-1,0,0 --up=0,1,0
// Uso: node scripts/make-fixtures.mjs
import { createServer } from 'vite';
import fs from 'node:fs';

const arg = (name, def) => {
  const a = process.argv.find((s) => s.startsWith(`--${name}=`));
  return a ? a.split('=')[1].split(',').map(Number) : def;
};
const front = arg('front', undefined); // sin parámetro: el frente de combate por defecto (+X) y arriba +Y
const up = arg('up', undefined);

globalThis.location ??= { search: '' }; // src/config.ts lee location al cargarse
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildAllCreatures } = await server.ssrLoadModule('/src/creature/fixtures/creatures.ts');
  const { renderProfileSheet } = await server.ssrLoadModule('/src/creature/fixtures/profileSheet.ts');
  const { renderHitboxSheet } = await server.ssrLoadModule('/src/creature/fixtures/hitboxSheet.ts');
  const creatures = buildAllCreatures(front, up);
  fs.mkdirSync('public/assets/creatures', { recursive: true });
  fs.mkdirSync('src/creature/fixtures', { recursive: true });
  fs.mkdirSync('docs/creature', { recursive: true });
  for (const c of creatures) {
    fs.writeFileSync(`public/assets/creatures/${c.id}.json`, JSON.stringify(c.file, null, 2) + '\n');
    fs.writeFileSync(`src/creature/fixtures/${c.id}.snapshot.json`, JSON.stringify(c.snapshot, null, 2) + '\n');
    console.log(`${c.id.padEnd(4)} ${String(c.snapshot.budget.pieceCount).padStart(2)} piezas, ${c.snapshot.budget.strokeCount} trazos — ${c.name}`);
  }
  // Los perfiles siempre se dibujan con las tres orientaciones, sea cual sea el frente del snapshot.
  fs.writeFileSync('docs/creature/perfiles-a-vs-b.svg', renderProfileSheet(creatures));
  console.log('docs/creature/perfiles-a-vs-b.svg');
  fs.writeFileSync('docs/creature/hitboxes.svg', renderHitboxSheet(creatures));
  console.log('docs/creature/hitboxes.svg');
} finally {
  await server.close();
}
