# Estado del intérprete de criaturas

Se actualiza en cada tanda. Última actualización: perfiles de golosinas, estocada en profundidad y apiñamiento del golpe por tipo. Rama `claude/creature-interpreter`.

## Decisiones vigentes
- Contrato estable: `CreatureSnapshot` (JSON puro). El intérprete (`src/creature/`) no importa three.js ni el juego; solo `resolve/` toca three.js.
- Núcleo = siempre el chizito raíz. Extremidad = extremo libre de una vara con base clara (libre, embebida, inclinación y calidad de ancla, todo en `config.ts`).
- Vara pasante = dos extremidades hermanas (`pairedWith`). Chizito ensartado en una cola = soldadura rígida (maza si pesa).
- Orientación de combate: arriba = +X del chizito parado; frente por defecto −Y (derecha del constructor); giro de 180° = +Y. Profundidad = Z.
- Un solo archivo de umbrales: `src/creature/config.ts`. Un solo archivo de topes: `limits.ts` (40 piezas, 30 trazos).
- Masa: densidad × volumen medido (kg de juego, no físicos). Ketchup y trazos pesan 0.
- Palitos clavados en un chizito ensartado = decorativos "de 2.º nivel" (deuda del MVP 1); se mueven con su extremidad.
- Velocidad por momento (masa × distancia): NO se implementa (MVP 2).

## Masa sin doble conteo
- `mass.total` suma cada pieza una vez.
- `Limb.mass` = parte de la vara (reparto `massShare`) + lo que cuelga de ese lado. Cada pieza colgada cuenta en UNA extremidad (la de punta más cercana).
- `DecorativePiece.heldBy` = extremidad de la que cuelga: su masa ya está en `Limb.mass`.
- Identidad (test, tolerancia 1e-12): `mass.core + Σ Limb.mass + Σ decorativas sin heldBy = mass.total`.

## Campos y unidades (SI: m, kg de juego, grados, cuadros a 60 fps)
- `mass`: `total`, `core`, `byPiece`, `com` (V3 marco raíz), `comProfile` (V2 perfil).
- `Limb`: `pivot`, `tip` (V3, m) · `length` (m) · `mass` (kg) · `endMassRatio` (0..1, último 40 %) · `comDistance` (m, pivote→centro de masa)
  · `freeLength` y `embedded` (m) · `embeddedFraction` (0..1 = embebida / largo de la vara) · `atraviesa` (bool) · `tiltDeg` · `rodLength` (m)
  · `anchorQuality` (0..1) · `anchoredBy` · `caps` (support, push, strike, reach, defend; 0..1) · `strength`, `durability` · `mobility` (grados: reposo, mín., máx., `droops`) · `profile` 2D.
- `DecorativePiece`: `reason`, `mass`, `heldBy?`, `detail?` (medidas de la vara: `freeTail`, `freeTip`, `embedded`, mínimos exigidos).
- `support`: apoyos, intervalo X, margen, `loadRatio`. `locomotion`: `mode`, `speed` (m/s), `jump` (m), `turn`, `brake` (0..1).
- `actions[]`: `startup`, `active`, `recovery` (cuadros), `damage` (adimensional), `reach` y `hitRadius` (m).
- Movilidad (rango angular) y velocidad/cadencia son conceptos separados: `analyze/limbs.ts` (giro) y `analyze/locomotion.ts` + `analyze/actions.ts` (velocidad y cuadros).

## Las dos masas de referencia (no se unifican: comparan cosas distintas)
- `mobility.limbMassRef` = 0,0004 kg: masa de UNA extremidad (≈ un palito con algo colgando). A esa masa el giro se reduce a la mitad; también normaliza arranque y daño de cada golpe (`actions.ts`).
- `locomotion.massRef` = 0,006 kg: masa del CUERPO entero (chizito + accesorios típicos). Amortigua la velocidad y normaliza arranque/daño de rodada y embestida. Con 3× queda casi inmóvil.
- Ambas son valores de juego a calibrar, no medidas físicas. Cambiar una no debe tocar la otra.

## Densidades (kg/m³, `config.ts`)
chizito 250 (× 0,85 por grumoso) · palito 550 · palito-selva 550 · chupetín (palito) 550 · caramelo del chupetín 1300 · escarbadientes 600 · papita 350 · nacho 500 · aceituna 1000 · ketchup 0 · desconocido 400.
Palito de la selva: vara, medida de la malla real (Ø ≈ 7,6 mm × 4,35 cm, ≈ 1,1 g a 550 kg/m³). El chat 3D declara 2,3 g (1,25 g/cm³): NO coinciden; queda 1,1 g y está PENDIENTE de definir con el chat de mecánicas.
Chupetín: el resolver lo entrega como DOS piezas, el palito (Ø 3,4 mm × ≈ 5,3 cm) y `<id>~caramelo` (bola Ø ≈ 21 mm, soldada a la cola como un chizito ensartado): da una MAZA (≈ 6,6 g). `ROD_STRUCTURE` en `profiles.ts`.

## Golpes en profundidad
- Una vara en profundidad con largo ≥ `longRodMin` y poca inclinación vertical es ESTOCADA (antes jab): mismo criterio que las normales (`classifyStrike`).
- Criatura de demostración `P` (7 palitos clavados desde la cara, todos en profundidad; `scripts/make-fixtures.mjs`, no entra en las hojas ni en las pruebas de las seis): capacidad de golpe 0,09–0,17 (< `minRole` 0,3) → solo embestida.
- El apiñamiento del GOLPE solo cuenta a las vecinas que darían el mismo tipo de golpe (`strikeKindOf`, `analyze/limbs.ts`); el de la movilidad (bloqueo físico) sigue contando a todas. Efecto medido: D sigue rodando (freno 0,1, sin golpes; capacidad máxima 0,171 → 0,243, tope de prueba 0,27, mínimo 0,3), A, C, E y el vegetal no cambian, B suma un golpe alto y su estocada pasa de daño 4,6 a 9,1 (efecto buscado), P pasa a barrida + golpe alto + embestida.

## Batería de golpes S1–S7
- `public/assets/creatures/S1…S7.json` (aparte de A–E; `buildBattery`), informe en `docs/creature/informe-golpes.md` (`node scripts/creature-battery.mjs`): por extremidad, qué acción usa o por qué ninguna (capacidad, apiñamiento, en profundidad, arco, "una por tipo").
- Regla "una acción por tipo": si dos extremidades dan el mismo tipo de golpe y las dos superan el mínimo, solo ejecuta la de mayor capacidad (S4: estocada ← p44 y p43 no actúa; S5: barrida ← una pierna y la otra no). El panel ya muestra qué extremidad ejecuta cada acción; NO muestra qué hace cada extremidad (acción o motivo). Opciones propuestas en el informe de la batería; sin decidir.

## Pendientes por chat
- HECHO por el chat 3D (merge 14e1663): frente por defecto −Y / arriba +X en el cargador, `MAX_STROKES` aplicado en el juego, `src/config.ts` importa `MAX_PIECES` de `limits.ts` (una sola fuente del 40).
- Un test falla si `src/config.ts` deja de importar `MAX_PIECES` o pone un número distinto.
- Chat de mecánicas: definir la masa del palito de la selva (1,1 g con la densidad del palito vs 2,3 g declarados por el chat 3D).
- Este chat: tanda 9 cerrada, espera OK. Las fixtures se regeneraron tras el merge (el chizito de la rama 3D cambió su porosidad: los puntos de entrada se movieron < 0,1 mm).
