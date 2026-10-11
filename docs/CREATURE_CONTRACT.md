# Contrato del intérprete de criaturas

Qué le entrega el juego al intérprete, qué devuelve y qué NO se puede cambiar sin avisar. Estado y pendientes por chat: `docs/creature/ESTADO.md`.

## Capas
1. **Archivo** `CreatureFileV1` (`src/persistence/CreatureFile.ts`, del chat 3D): `hombrecito-de-chizito/criatura`, versión 1, metros. Por pieza: `type`, `parentId`, `seed`, `attach {mode, entryPoint, direction, depth, spin}`, `params`. Más `creature.front/up`. Es la ÚNICA fuente de verdad persistida.
2. **Resolver** (`src/creature/resolve/`): el único código del intérprete que usa three.js. Lee la `Construction` viva (o un archivo ya cargado) y mide mallas reales con un BVH propio. Entrega el snapshot.
3. **`CreatureSnapshot`** (`src/creature/types.ts`): JSON puro, sin three.js ni escena, marco local del chizito raíz (eje largo = X), metros. NO se persiste. `schema: 'chizito.creature-snapshot'`, `version: 1`.
4. **`interpret(snapshot, {facing})`** → `CreatureAnalysis`: extremidades, masa, apoyos, locomoción, acciones, defensa y perfil 2D con cajas de golpe. No importa three.js ni el juego (un test lo verifica).

## Qué se asume del juego
- Núcleo = el chizito raíz. Un chizito `mount: 'tail'` es una soldadura rígida con la vara que lo ensarta.
- Pieza: `kind` ∈ core | blob | rod | plate | stroke. Varas: `a` = punta, `b` = cola. Tipos desconocidos se tratan como decorativos y se avisa.
- Piezas SINTÉTICAS: el resolver parte el chupetín en dos piezas del snapshot: el palito (`chupetin`, vara) y su bola (`<id>~caramelo`, tipo `chupetin-caramelo`, bulto), unidas por una conexión `tail` (soldadura rígida). La bola no existe como pieza del juego: su id no está en la `Construction`, y `budget.pieceCount` sigue contando el chupetín como UNA pieza. Pasa por `ROD_STRUCTURE` (`src/creature/profiles.ts`): las varas allí listadas (`palito-selva`, `chupetin`) toman su radio de la malla real.
- Tipos conocidos y densidades (kg/m³, `config.ts`): chizito 250, palito 550, palito-selva 550, chupetín (palito) 550, caramelo del chupetín 1300, escarbadientes 600, papita 350, nacho 500, aceituna 1000, ketchup 0.
- Topes (`src/creature/limits.ts`, sin imports): `MAX_PIECES` = 40 y `MAX_STROKES` = 30. El juego importa este archivo; un test compara el 40 con `CONFIG.creature.maxPieces`.
- Orientación de combate (`creature.front/up` del archivo): arriba = +X del chizito parado; frente por defecto −Y; el giro de 180° = +Y. Profundidad = Z. El perfil usa (frente, arriba) y `facing` ±1 es un espejo en la salida.

## Qué devuelve (unidades: m, kg de juego, grados, cuadros a 60 fps)
Ver la lista completa de campos en `docs/creature/ESTADO.md`. Lo esencial:
- `mass`: total, núcleo, por pieza, centro de masa. Sin doble conteo: núcleo + Σ `Limb.mass` + Σ decorativas sin `heldBy` = total (un test lo exige, tolerancia 1e-12).
- `limbs[]`: `pivot`, `tip`, `length` (m), `mass` (kg: la vara y TODO lo que cuelga de ese lado; una vara pasante reparte su masa y cada pieza colgada cuenta en una sola extremidad), `comDistance` (m, pivote → centro de masa), `freeLength` y `embedded` (m), `embeddedFraction` (0..1 = embebida / largo de la vara), `atraviesa` (bool: la vara sale por el otro lado), `rodLength`, `anchorQuality`, `caps` (support/push/strike/reach/defend, 0..1), `mobility` (grados), `profile`.
- Rol de golpe de cada extremidad (`analyze/explain.ts`, `explainStrikes`): ejecuta una acción, o no y por qué: `executes`, `loses` (otra del mismo tipo es mejor: una acción por tipo), `arc` (apunta fuera del arco de golpe, 140°; vale también para una maza), `crowded` (el apiñamiento con vecinas del mismo golpe la baja del mínimo) o `below` (la capacidad no llega al mínimo). Son las mismas reglas que `computeActions`; el panel lo muestra en cada extremidad.
- `decorative[]` (cada una con `heldBy` si cuelga de una extremidad: esa masa ya está en la de la extremidad): lo que suma masa pero no es extremidad, con su razón (`no-free-tip`, `weak-anchor`, `too-short`, `plate`, `stroke`, `broken`, `unknown-type`, `second-level`).
- `locomotion` (`walk`, `hop`, `drag`, `roll`, `immobile`), `support`, `actions[]` (jab, estocada, golpe-alto, barrida, mazazo, rodada, embestida), `defense`, `profile2D` (cajas de daño y de golpe).

## Simulación (MVP 1)
`import { makeSimPlan, createSimState, stepSim, runSim, poseCreature } from './creature'`: el plan sale del `CreatureAnalysis` (modo, velocidad, salto, freno y giro); `stepSim` es un paso puro de 1/60 s; `poseCreature` da las formas del perfil en el mundo (x a lo largo del piso, y hacia arriba, piso en 0) con cada extremidad dentro de su rango de movilidad. No modifica el análisis ni el juego.

## Reglas que no se rompen
- Un solo archivo de umbrales (`config.ts`) y uno de topes (`limits.ts`); un test falla si aparecen números sueltos en detect/analyze/project.
- El intérprete no escribe en el juego. El panel sólo lee la construcción y encadena `interaction.onChange`.
- Cambiar un campo de `CreatureSnapshot` o de `CreatureAnalysis` = subir la versión y avisar al otro chat.

## Cómo activarlo
- En el navegador: `?creature` (panel "ESTRUCTURA DETECTADA"). Sin el flag no se carga nada del intérprete. `window.__creature` expone el panel.
- Por código: `import { resolveSnapshot, interpret } from './creature'` y `resolveSnapshot({construction, pieces})`.
- Pruebas: `node scripts/creature-test.mjs` (módulos puros), `creature-resolve-test.mjs` (resolver contra la referencia), `creature-fixtures-test.mjs`, `creature-ui-test.mjs` y `creature-ui-keys-test.mjs` (juego real, con `npm run dev`).
