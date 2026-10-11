# Para seguir en un chat nuevo — Hombrecito de chizito / "CUMPLEAÑITO"

Pegá esto al empezar el chat nuevo (o decile: "leé docs/CONTINUAR.md y CLAUDE.md y seguí").

## Dónde está todo
- Repo: `francovarsi-lab/chizito` · rama de trabajo: **`claude/friendly-faraday-2lyzl2`** (último commit: ver `git log`).
- **CLAUDE.md** (raíz) tiene TODAS las decisiones de diseño, medidas, controles y arquitectura: leerlo primero.
- Capturas de cada cambio en `docs/capturas/<tema>/`. Pruebas automáticas en `scripts/*-test.mjs` (Playwright).
- Otras ramas: `claude/creature-interpreter` (intérprete de combate, otro chat; sale de esta rama),
  `main` (versión vieja, SIN historia en común con esta rama).

## Qué es
Juego 3D de escritorio (Vite + TypeScript + Three.js, sin React) para armar CRIATURAS clavando snacks en un chizito
flotante sobre una mesa de cumpleaños: elegís punto y ángulo y mantenés apretado para hundir. Todo procedural (cada
modelo se puede reemplazar por un `.glb`). Se guarda como JSON por conexiones (no posiciones sueltas). El combate
lo hace el intérprete (otra rama), que lee ese JSON.

## Estado actual (hecho y probado)
- Fases 1–4 completas: escena, clavado/sacado/atravesar, feedback (sacudida, migas, sonido), papitas, edición,
  deshacer/rehacer, guardado/carga JSON (Ctrl+S / Ctrl+O / arrastrar), tope 40 piezas.
- Piezas: palito, papita (B la parte), nacho triangular (por la punta), aceituna (sólo se ensarta en la punta de un
  palito/escarbadientes), escarbadientes y espadita (vasitos separados; la guarda es el tope), ketchup para dibujar
  (Supr o Shift = goma; tope 30 trazos), palito de la selva (se desenvuelve al agarrarlo), chupetín tipo Mister Pop
  (se desenvuelve desde el nudo; colores verde, rojo, naranja, cola).
- Chizito: arranca PARADO y de frente; F lo devuelve a esa pose. Porosidad según foto del usuario.
- Intro: plano general de una habitación simple (mesa con mantel celeste, piso, 3 paredes lisas, guirnaldas
  clavadas, globos), título **CUMPLEAÑITO** (estilos `?titulo=arcade|globo|neon`), viaje de cámara al chizito.
- Contrato con el intérprete: frente de combate por criatura (por defecto −Y, arriba +X; acepta ±X/±Y),
  `src/creature/limits.ts` compartido (MAX_PIECES 40, MAX_STROKES 30), `PieceDefinition.structure` (vara/bulto/placa +
  masa). **Avisar antes** de cambiar el formato del archivo de criatura o la orientación inicial del chizito.
- Deploy: `.github/workflows/deploy.yml` + `vite.config.ts` (base `/chizito/` sólo en el build).

## Pendiente / decisiones abiertas
1. **Merge a `main`**: esta rama no comparte historia con `main` → elegir: reemplazar `main` por esta rama, o merge
   con `--allow-unrelated-histories` resolviendo conflictos. El usuario todavía no decidió.
2. **Dato curioso de un animal** en cada palito de la selva (el envoltorio ya tiene la "ficha"): pedido para más adelante.
3. Estética del título en exploración ("arcade pero no 8 bits"): el usuario elige entre los 3 estilos o pide otro.
4. Chizito extra para ensartar: EN PAUSA (el mecanismo existe; el bowl no está en la mesa).
5. Envoltorios sin logos ni nombres de marca (decisión tomada); se afinan con fotos del usuario si las manda.

## Cómo trabajar (reglas del usuario)
- Responder en español rioplatense, claro y directo. El usuario usa **Claude de escritorio**; para correr el juego
  usa Windows + PowerShell: `git pull` y `npm run dev` en la carpeta `chizito`, y abre http://localhost:5173 en Chrome.
  Instrucciones siempre rapiditas y sencillas.
- **Cada cambio: commit + push** a `claude/friendly-faraday-2lyzl2` (no crear PR salvo que lo pida).
- Mostrar **capturas** (Playwright, `?capture`) de lo que cambia y hacer autocrítica visual.
- No romper lo que funciona; si algo no entra limpio en la arquitectura (PieceRegistry / AssetRegistry /
  Construction / máquina de estados), avisar antes de forzarlo.
- Si se necesitan referencias visuales, pedirle fotos al usuario.

## Comandos útiles (entorno del chat)
- `npm run dev` (Vite en :5173) · `npx tsc --noEmit` · `npm run build`
- Capturas: `node scripts/one.mjs "<query>" out.png [frames]` (query: `intro`, `seed=N`, `sinintro`…);
  intro: `node scripts/intro-shots.mjs <dir>`.
- Pruebas: `play-test`, `phase3-test`, `pieces-test`, `ketchup-test`, `fixes-test`, `phase4-test`, `golosinas-test`,
  `combat-front-test`, `mount-test`, `espadita-test`, `nacho-test`, `home-test` (todas en `scripts/`, con Vite corriendo).
  El render por software es lento: correr las largas en segundo plano.
