# Estado del intérprete de criaturas

Se actualiza en cada tanda. Última actualización: MVP 1, tandas 3 y 5 (combate y probador en el panel); la 4 queda para después. Rama `claude/creature-interpreter`.

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
- Regla "una acción por tipo": si dos extremidades dan el mismo tipo de golpe y las dos superan el mínimo, solo ejecuta la de mayor capacidad (S4: estocada ← p44 y p43 no actúa; S5: barrida ← una pierna y la otra no). El panel muestra, en cada extremidad, su rol de golpe final (opción A, aprobada): "ejecuta: estocada", "pierde contra palito 4 (0,37 vs 0,40)", "fuera del arco (160°)", "capacidad bajo el mínimo (0,17 de 0,30)" o "apiñada: comparte con 3 vecinas" (`analyze/explain.ts`, mismas reglas que `computeActions`; test en `creature-test.mjs`, capturas `panel-S2/S4/S5/S6.png`).

## Extremidades fuera del arco — DECISIÓN VIGENTE
- Las extremidades que apuntan fuera del arco de golpe (|ángulo| > `strikeArcDeg`, 140°) quedan SIN golpe. Razón: girar el frente 180° (selector del panel) pone ese brazo al frente, así que la criatura ya puede elegir con qué lado pelea; el panel dice "fuera del arco (160°)" en cada una.
- Idea para probar DESPUÉS de las pruebas de combate: "giro corto" (usar la movilidad ya calculada para que el brazo trasero entre al arco). Entraría S2, A y el vegetal (rango hasta 131°–135°); no entran S4, S5, B ni las 5 de D.
- Datos: hoy son 1 de 2 en S2, 2 de 4 en S4, 1 de 4 en S5, A, B y vegetal; 5 de 30 en D. Su capacidad de golpe ya trae el factor hacia atrás (0,2): como máximo 0,15, bajo el mínimo de 0,3. Defensa, apoyo y empuje valen 0 hacia atrás. Descartadas por ahora: golpe hacia atrás (haría falta tocar un factor o el umbral; en D la mayor subiría a ≈ 0,35) y defensa trasera (cambia la fórmula y no sirve con el rival al frente).

## Cómo probar (comandos)
- Módulos puros, sin navegador: `node scripts/creature-test.mjs` (≈1390 comprobaciones). `node scripts/creature-summary.mjs [salida.json]` (resumen numérico A–E, vegetal y P, para comparar antes/después) y `node scripts/creature-battery.mjs` (informe de golpes S1–S7).
- Con `npm run dev` corriendo (juego real, Chromium con WebGL por software; lento, cada script tarda minutos): `node scripts/creature-resolve-test.mjs` (resolver contra la referencia, 918 comprobaciones), `creature-fixtures-test.mjs` (carga las criaturas), `creature-ui-test.mjs` (panel, flag apagado, frente, deshacer, rol de golpe; saca las capturas `panel-*.png`), `creature-ui-keys-test.mjs` (resaltado 3D y Ctrl+Z / Ctrl+Y con el teclado) y `creature-golosinas-test.mjs` (palito de la selva y chupetín reales).
- Regenerar fixtures: `node scripts/make-fixtures.mjs` (A–E, vegetal, P y S1–S7; si cambia la geometría del chizito en el chat 3D hay que correrlo y el test "al día" falla hasta entonces). Informe de criaturas: `node scripts/creature-report.mjs`.
- Si el servidor de desarrollo no está: `npm run dev` y esperar a `localhost:5173`.

## Decisiones vigentes (masa y ramas)
- La masa del palito de la selva la manda el intérprete: 1,1 g (densidad 550 × volumen medido del modelo). El chat 3D declara 2,3 g: queda pendiente de definir con el chat de mecánicas; no bloquea.
- `main` no comparte historia con estas ramas (se reconstruyó desde el zip del usuario): el merge está pendiente de decisión con el chat 3D (reemplazar `main` o `--allow-unrelated-histories`). No bloquea el trabajo del intérprete.

## MVP 1 — locomoción adaptativa (tandas 1 y 2: hechas, esperando OK)
- `src/creature/sim/` (solo archivos nuevos; sin dependencias ni Matter.js; todos los números nuevos en `config.sim`):
  `plan.ts` (`makeSimPlan`: toma modo, velocidad, salto, freno y giro del análisis), `step.ts` (`stepSim`, `runSim`: núcleo cinemático puro a 60 Hz), `pose.ts` (`poseCreature`: animación por rangos de movilidad), `types.ts`.
- Reglas: camina/arrastra/rueda/inmóvil aceleran a la velocidad del análisis (`accelTime`), frenan con su freno (`stopTime / freno`) y al invertir el sentido se quedan paradas `turnTime / giro`; saltito = pausa en el piso + parábola de `hopAirTime` (la velocidad MEDIA es la del análisis; g = 8h/T²); rodar = ángulo = distancia / radio (sin deslizar). `h` = altura del punto más bajo (salto o caída); el piso no se atraviesa.
- Animación: cada extremidad gira como mucho `swingFraction` de su rango, hacia el límite que corresponda (nunca lo supera). Con apoyos, el cuerpo se apoya en el punto más bajo de los pies (alternan al caminar) y las demás se recortan para quedar en el aire; sin apoyos se apoya en lo que ya toca el piso en reposo (cuerpo y/o una extremidad, que no gira) y ninguna otra llega al piso al andar. Mi criatura (palito de la selva) y P quedan apoyadas en esa extremidad: está por debajo del umbral de apoyo del MVP 0 (`supportMinDown`), no la convierto en pie.
- Pruebas (en `creature-test.mjs`, sección MVP 1; fixtures A–E, vegetal, P, mi criatura y dos sintéticas: un pie = salta, pesada = inmóvil): determinista (estados y poses idénticos), velocidad máxima = la del análisis (saltito: media de ocho ciclos), piso no atravesado y lo más bajo lo toca, ninguna extremidad fuera de rango, solo tocan el piso los apoyos (A, vegetal, saltito), D rueda sin deslizar y casi no frena, mi criatura se arrastra. Sin números sueltos en `sim/`.
- Imagen: `docs/creature/animacion.png` (`node scripts/creature-sim-strip.mjs`): un ciclo de A, vegetal, A con un pie, B, mi criatura y D. Fixture de mi criatura: `src/creature/fixtures/criatura-20261011-1623.snapshot.json` (`node scripts/creature-snapshot.mjs <archivo> <salida>`).
- Límites conocidos: la animación es 2D sobre el perfil (una extremidad "en profundidad" gira su proyección corta); no hay combate ni colisión con un rival (tanda 3).

## MVP 1 — tanda 3 (estados y combate, sin rival)
- `sim/combat.ts`: una acción a la vez con las tres fases del análisis (arranque, activo, recuperación; cuadros EXACTOS de `AttackAction`), guardia que sube en `guardFrames`, golpe mantenido (`holdFrames`) y sin pelea en el aire. Mientras pelea, guarda o carga no camina (frena con su freno: D sigue rodando un rato). Entradas: ataque solo → jab / embestida / rodada; → + ataque → estocada; ↑ + ataque → golpe alto; ↓ + ataque → barrida; ataque mantenido → mazazo (la misma asignación del análisis).
- Caja de golpe activa = `attackHitbox` del análisis en cada cuadro activo, llevada al mundo (lado, posición, altura): `pose.hitbox`. La extremidad recorre su arco (reposo → arranque → arco → reposo) sin salir de su rango; si el piso la frena, el dibujo se recorta y la caja sigue siendo la del análisis. La que guarda sube hacia el frente (`swingArc.to`); sin extremidad que guarde, el cuerpo se encoge (`curlScale`). El cuerpo se apoya como en reposo: pegar o guardar no lo hace saltar.
- Pruebas: cuadros y cajas iguales a los del análisis en A–E, vegetal, P, mi criatura y la pesada; una acción a la vez; cada entrada da su acción; guardia; sin pelea en el aire.

## MVP 1 — tanda 5 (probador en el panel)
- Abrir: `?creature&probador` (arranca abierto) o `?creature` y el botón "▶ Probador" abajo a la izquierda. Código: `ui/prober.ts` (ventana, teclado, selector, bucle fijo a 60 Hz), `ui/proberDraw.ts` (piso con perspectiva lateral, criatura posada, contactos, caja de golpe, aro de guardia), `ui/proberHud.ts` (cartel, testeable en Node). Medidas en `config.prober`. `window.__prober` expone `select`, `advance`, `benchmark`, `fps`.
- Teclas (figuran en pantalla): ← → moverse; Z ataque (↑ + Z golpe alto, ↓ + Z barrida, → + Z estocada, mantener Z mazazo); X defensa. También hay dos botones con el mouse. Mientras está abierto, sus teclas no llegan al juego (Ctrl/Alt/Meta sí pasan: Ctrl+Z sigue deshaciendo).
- Selector: A–E, vegetal, P, S8 (un solo pie: salta), F40 (40 extremidades), `criatura-20261011-1623` y "La del juego" (la que cargues con Ctrl+O: sigue lo que el panel interpreta). Elegir una la carga en el juego.
- Cartel: modo de movimiento, velocidad del análisis y la de ahora, golpe en curso con su fase y cuadros (`estocada ← extremidad 3 · ACTIVO 1/6 · 13+6+17 cuadros · daño 7,9`), defensa.
- fps (Chromium sin GPU, WebGL por software): simular + posar + dibujar 40 extremidades cuesta ≈ 0,15–0,3 ms por cuadro (más de 3.000 fps posibles); el bucle real con el panel y el juego presentes da ≈ 40 fps de promedio (mín. ≈ 31) en esa prueba y hasta 60 en pruebas aisladas: la composición por software de este entorno es el límite, no el código. Panel y probador usan `contain` + `will-change` (el `backdrop-filter` del panel se sacó: costaba ≈ 1 fps en software). Verificar los 60 en una máquina con GPU con el contador de fps de la ventana.
- Con el flag apagado la app es idéntica (el módulo ni se descarga: test en `creature-ui-test.mjs`).

## Pendientes por chat
- HECHO por el chat 3D (merge 14e1663): frente por defecto −Y / arriba +X en el cargador, `MAX_STROKES` aplicado en el juego, `src/config.ts` importa `MAX_PIECES` de `limits.ts` (una sola fuente del 40).
- Un test falla si `src/config.ts` deja de importar `MAX_PIECES` o pone un número distinto.
- Chat de mecánicas: definir la masa del palito de la selva (1,1 g con la densidad del palito vs 2,3 g declarados por el chat 3D).
- Este chat: tanda 9 cerrada, espera OK. Las fixtures se regeneraron tras el merge (el chizito de la rama 3D cambió su porosidad: los puntos de entrada se movieron < 0,1 mm).
