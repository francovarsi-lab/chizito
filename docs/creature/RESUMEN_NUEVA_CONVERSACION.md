# Resumen unificado para UNA sola sesión de Claude Code (Chizito Fight)

Junta dos líneas de trabajo sobre la misma rama `claude/creature-interpreter`: (A) la sesión del intérprete, hasta `531606c`, y (B) la sesión de la pelea 3D, hasta `a9acdaf` (su `docs/creature/TRASPASO.md` es la fuente operativa más nueva de B). Estado medido al armar este resumen, el 2026-11-06.

## Reglas permanentes del usuario
- Responder en español (usa Claude versión escritorio, sesión en la nube). Informes cortos (20–30 líneas), sin código, con hash del commit y qué mirar. Al cerrar una tanda, frenar y esperar el OK.
- NO pushear a `main` (dispara Pages y no comparte historia con estas ramas). No tocar `claude/friendly-faraday-2lyzl2` (constructor 3D). No avanzar a la tanda 4 sin que lo pida.
- Números nuevos en `src/creature/config.ts`; topes desde `src/creature/limits.ts` (40 piezas, 30 trazos). Sin red externa, sin Supabase, sin stats del MVP 2, sin colores de aceituna ni palito, solo herramientas gratis, sin tareas programadas, sin dependencias nuevas. Pruebas puras (sin render) siempre que se pueda. Un commit por cambio; push solo a esta rama; nunca forzar.

## Qué es
Juego de lucha lateral 1v1 arcade: la criatura se arma clavando snacks (chizito, palitos, papitas, nachos, aceitunas, escarbadientes, ketchup, palito de la selva, chupetín) en un chizito 3D. Repo privado `francovarsi-lab/chizito`. Todo el código de pelea e intérprete vive en `src/creature/`.

## Línea A — intérprete (hecho y probado)
- Capas: archivo `CreatureFileV1` → resolver (`resolve/`) → `CreatureSnapshot` (JSON puro) → `interpret()` → `CreatureAnalysis` → simulación (`sim/`) y panel/probador (`ui/`). Frente de combate = dato `Construction.front` (`creature.front`): por defecto −Y; el giro de 180° (+Y) cambia el dato y entra al historial (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z).
- MVP 0 (tandas 0–9): extremidades por capacidades, masa, apoyos, locomoción (camina, salta, se arrastra, rueda, inmóvil), 7 acciones ofensivas, defensa, perfil 2D con cajas de golpe, panel "ESTRUCTURA DETECTADA" (`?creature`, un único bloque al final de `main.ts`).
- Reglas del análisis aprobadas: >140° del frente no golpea; una acción por tipo (gana la de más capacidad, a igual la más liviana); el panel dice el rol de cada extremidad; apiñamiento solo entre vecinas del mismo golpe; varas en profundidad largas = estocada; palito de la selva (≈1,1 g, densidad 550) y chupetín (maza).
- MVP 1: tandas 1 y 2 (simulación cinemática a 60 Hz + animación por rangos), 3 (estados de combate), 5 (probador `?creature&probador`). La tanda 4 (adaptación en vivo) NO está hecha.
- Documentos: `docs/creature/ESTADO.md`, `docs/CREATURE_CONTRACT.md`, sección final de `CLAUDE.md`, `docs/creature/TRASPASO.md`.

## Línea B — pelea jugable en la mesa 3D (según TRASPASO.md; no la verifiqué entera)
- `src/creature/fight/`: reglas (daño, guardia, empuje, aturdimiento, KO), rival IA, rival brócoli 3D articulado (modelo del usuario), la criatura REAL del constructor movida por la pose 2D, bucle, cámara lateral, HUD, modo liviano. Botón ⚔ PELEAR; ← → mover, Z mejor golpe, X guardia, R revancha, Esc salir. Paleta de panel "dibujito con borde".
- Publicación privada en Vercel (con login), se recompila con cada push a la rama: `https://chizito-git-claude-creature-interpreter-el-mejor-lugar.vercel.app/?creature` (detalles en TRASPASO.md). `vite.config.ts`: en Vercel la base es `/`; en Pages `/chizito/`.
- Lo que el usuario reportó en su última prueba: se ve muy feo; las articulaciones NO se mueven en sus criaturas (en la fixture A sí); se traba.

## DECISIÓN NUEVA (agendada, falta implementar): "palito clavado = brazo"
Para la pelea se deja de lado la física del análisis: un palito clavado pasa a ser un brazo (o pierna) rígido que gira alrededor de su punto de clavado, con animación de golpe fija y legible; hace falta al menos 1 pierna para trasladarse y 1 brazo para golpear (solo avisar). Clasificación pierna/brazo sin definir (propuesta: punta libre hacia abajo = pierna). Tensión a resolver: esto contradice, para la pelea, reglas de la línea A (arco de 140°, una acción por tipo, calidad de ancla, rangos de movilidad). El panel y el probador seguirían con el análisis; hay que decidir si conviven o se unifican.

## Estado de las pruebas (medido hoy, sin tocar código)
- `tsc` limpio. Pelea (`creature-fight-test.mjs`): 18 OK, 0 fallas.
- Pruebas puras del intérprete (`creature-test.mjs`): **1695 OK y 2 fallas**, ambas por cambios de la línea B:
  1. "hitboxes.svg coincide con lo que genera el código": la paleta nueva cambió los colores; hay que regenerar con `node scripts/make-fixtures.mjs`.
  2. "el intérprete y el modelo del panel no importan three.js": ahora lo rompen 4 archivos de `fight/` (`broccoliRig.ts`, `brocoli.ts`, `mount.ts`, `rig3d.ts`). Decisión: sacar `fight/` del alcance de esa prueba y dejarlo escrito (hoy el contrato dice que solo `resolve/` usa three.js).
- Sin re-correr tras los cambios de B: las pruebas de navegador del panel, teclado y probador, el resolver y el KO completo de la pelea.
- fps: nunca medidos en una PC con GPU (acá solo Chromium sin GPU, ≈40–50 fps en el probador con 40 extremidades). El usuario reportó trabas: pedirle modelo de GPU o fps.

## Pendientes en orden sugerido
1. Arreglar las 2 fallas (regenerar fixtures/hojas; acotar la prueba de independencia de three.js a `fight/`).
2. Decidir y escribir cómo conviven el análisis físico (panel/probador) y "palito clavado = brazo" (pelea); implementarlo y verificarlo con criaturas armadas a mano, no solo fixtures.
3. Arreglar fluidez y estética en la PC del usuario (captura real con HUD; iluminación y cámara).
4. Correr todo antes de cerrar: puras (`node scripts/creature-test.mjs`), pelea, y de navegador con `npm run dev` (`creature-ui-test`, `creature-ui-keys-test`, `creature-prober-test`, `creature-resolve-test`, `creature-fixtures-test`, `creature-fight-ui-test`).
5. Backlog abierto: tanda 4, autoguardado del frente, merge a `main` (historias sin relación; decidir con el chat 3D), masa del palito de la selva (1,1 g vs 2,3 g declarados por el chat 3D), "giro corto" (idea), tiempo de espera/escudo, desafío por link.

## Prompt sugerido para la sesión única
"Continuá en el repo francovarsi-lab/chizito, rama `claude/creature-interpreter`. Leé `docs/creature/RESUMEN_NUEVA_CONVERSACION.md`, `docs/creature/TRASPASO.md` y `docs/creature/ESTADO.md`. Respetá las reglas permanentes (español, informes cortos con hash, no pushear a main, no tocar friendly-faraday, no avanzar a la tanda 4). Primero arreglá las 2 fallas de las pruebas puras y mostrame el plan de 10 líneas para 'palito clavado = brazo' antes de escribir código. Mi pedido: [una sola tarea]."
