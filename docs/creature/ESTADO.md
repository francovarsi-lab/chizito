# Estado del intérprete de criaturas

Se actualiza en cada tanda. Última actualización: tanda 9 (activación `?creature`, merge de la rama 3D). Rama `claude/creature-interpreter`.

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
chizito 250 (× 0,85 por grumoso) · palito 550 · escarbadientes 600 · papita 350 · nacho 500 · aceituna 1000 · ketchup 0 · desconocido 400.
`palito-selva` y `chupetin` caen en 400 y no tienen perfil: son decorativos por tipo desconocido.

## Pendientes por chat
- HECHO por el chat 3D (merge 14e1663): frente por defecto −Y / arriba +X en el cargador, `MAX_STROKES` aplicado en el juego, `src/config.ts` importa `MAX_PIECES` de `limits.ts` (una sola fuente del 40).
- Chat 3D: informar forma y masa de `palito-selva` y `chupetin`.
- Un test falla si `src/config.ts` deja de importar `MAX_PIECES` o pone un número distinto.
- Este chat: tanda 9 cerrada, espera OK. Las fixtures se regeneraron tras el merge (el chizito de la rama 3D cambió su porosidad: los puntos de entrada se movieron < 0,1 mm).
