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
- Topes (`src/creature/limits.ts`, sin imports): `MAX_PIECES` = 40 y `MAX_STROKES` = 30. El juego importa este archivo; un test compara el 40 con `CONFIG.creature.maxPieces`.
- Orientación de combate (`creature.front/up` del archivo): arriba = +X del chizito parado; frente por defecto −Y; el giro de 180° = +Y. Profundidad = Z. El perfil usa (frente, arriba) y `facing` ±1 es un espejo en la salida.

## Qué devuelve (unidades: m, kg de juego, grados, cuadros a 60 fps)
Ver la lista completa de campos en `docs/creature/ESTADO.md`. Lo esencial:
- `mass`: total, núcleo, por pieza, centro de masa. Sin doble conteo: núcleo + Σ `Limb.mass` + Σ decorativas sin `heldBy` = total.
- `limbs[]`: `pivot`, `tip`, `length`, `mass`, `comDistance`, `freeLength`, `embedded`, `embeddedFraction`, `atraviesa`, `caps` (support/push/strike/reach/defend, 0..1), `mobility`, `profile`.
- `decorative[]`: lo que suma masa pero no es extremidad, con su razón (`no-free-tip`, `weak-anchor`, `too-short`, `plate`, `stroke`, `broken`, `unknown-type`, `second-level`).
- `locomotion` (`walk`, `hop`, `drag`, `roll`, `immobile`), `support`, `actions[]` (jab, estocada, golpe-alto, barrida, mazazo, rodada, embestida), `defense`, `profile2D` (cajas de daño y de golpe).

## Reglas que no se rompen
- Un solo archivo de umbrales (`config.ts`) y uno de topes (`limits.ts`); un test falla si aparecen números sueltos en detect/analyze/project.
- El intérprete no escribe en el juego. El panel sólo lee la construcción y encadena `interaction.onChange`.
- Cambiar un campo de `CreatureSnapshot` o de `CreatureAnalysis` = subir la versión y avisar al otro chat.

## Cómo activarlo
- En el navegador: `?creature` (panel "ESTRUCTURA DETECTADA"). Sin el flag no se carga nada del intérprete. `window.__creature` expone el panel.
- Por código: `import { resolveSnapshot, interpret } from './creature'` y `resolveSnapshot({construction, pieces})`.
- Pruebas: `node scripts/creature-test.mjs` (módulos puros), `creature-resolve-test.mjs` (resolver contra la referencia), `creature-fixtures-test.mjs`, `creature-ui-test.mjs` y `creature-ui-keys-test.mjs` (juego real, con `npm run dev`).
