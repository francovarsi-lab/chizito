# Traspaso a conversación nueva — Chizito Fight (actualizado 2026-11-06)

## Repo, ramas y publicación
- Repo privado `francovarsi-lab/chizito`. NO pushear a `main` (dispara Pages y no comparte historia). No tocar `claude/friendly-faraday-2lyzl2` (constructor 3D).
- Rama de trabajo: `claude/creature-interpreter` (último commit `bb9a782`). Todo el código de pelea vive en `src/creature/`.
- Vercel (privado, con login): proyecto `chizito` del equipo `el-mejor-lugar` (cuenta lugarelmejor@gmail.com), Vercel Auth en TODAS las URLs. Se recompila solo con cada push a la rama. Link que se actualiza solo: `https://chizito-git-claude-creature-interpreter-el-mejor-lugar.vercel.app/?creature` (el alias `chizito-el-mejor-lugar.vercel.app` quedó fijo en la 1.ª versión). `vite.config.ts`: en Vercel (`VERCEL=1`) la base es `/`; en Pages sigue `/chizito/`.
- `JUGAR.bat` quedó obsoleto (el usuario no quiere bajar nada).

## Qué existe (verificado)
- Constructor 3D (sin tocar) + panel técnico "ESTRUCTURA DETECTADA" + probador 2D (herramientas internas; el panel se ve con paleta "dibujito con borde": tinta #1a0d08, crema #fff6df, colores plenos).
- Intérprete (`analyze/`, `sim/`): extremidades, masa, apoyo, locomoción, acciones (cuadros arranque/activo/recuperación), perfil 2D, cajas de golpe.
- Pelea en la MISMA mesa 3D (botón ⚔ PELEAR, abajo al centro), `src/creature/fight/`:
  `rules.ts` (daño, guardia, empuje, aturdimiento, KO, giro automático al rival), `ai.ts` (rival IA), `tuning.ts` (números), `brocoli.ts` (modelo del usuario, procedural), `broccoliAnalysis.ts` (geometría del brócoli sobre el análisis de `veg`), `broccoliRig.ts` (brócoli 3D articulado), `rig3d.ts` (criatura REAL del constructor movida/girada por la pose 2D), `mount.ts` (bucle, cámara lateral, HUD, modo liviano, entrada).
- Controles: ← → mover, Z golpear (mejor golpe disponible; ↑/↓ + Z golpe alto/barrida), X guardia, R revancha, Esc salir. Avisos mínimos: "Sin piernas…", "Sin brazos que peguen…".
- Modo liviano en pelea: sin AO, sin sombra del sol, props de la mesa ocultos, pixel ratio ≤ 1, baja el desenfoque y la resolución si el cuadro tarda; pose mezclada entre pasos de 60 Hz; suelta lo que haya en la mano (Esc ×2) al abrir.
- Pruebas: `node scripts/creature-fight-test.mjs` (18 OK, puras) y `scripts/creature-fight-ui-test.mjs` (navegador: cuerpo 3D = posición simulada; flecha mueve; Z recorre arranque→activo→recuperación). `tsc` y build OK.

## NO verificado
- Cuadros por segundo en la PC del usuario (acá no hay GPU). El usuario reportó trabas.
- Las 1697 pruebas viejas del intérprete tras estos cambios; el KO completo; varias peleas largas.
- Barras de vida/HUD en pantalla real (las capturas del canvas no incluyen el HUD).

## Problemas que reportó el usuario (última prueba)
1. Se ve muy feo.
2. Las articulaciones NO se mueven en sus criaturas (en la fixture A sí se movía un brazo).
3. Se traba.
4. (ya tratado) escenario despejado, ketchup seleccionado, un solo golpe, avisos mínimos.

## DECISIÓN NUEVA (agendada): "palito clavado = brazo"
Dejar de lado la lógica de física del análisis (masa, calidad de ancla, rangos de movilidad, arco de 140°, "una acción por tipo", etc.) para la pelea. Regla del usuario: **una vez que el palito entró en el chizito pasa a ser un brazo y golpea como brazo, usando la conexión chizito–palito** (la articulación está en el punto de clavado). Necesita al menos 1 pierna para trasladarse y al menos 1 brazo para golpear (solo avisar, sin recuadros).
Propuesta de diseño (a confirmar):
- Cada palito clavado = un brazo/pierna rígido con articulación en su `entryPoint` (sobre la superficie del chizito), eje de giro = profundidad de la vista lateral.
- Animación de golpe fija y legible (anticipación → golpe → recuperación) girando el palito entero alrededor de esa articulación; la parte adentro del chizito la oculta el depth buffer.
- Clasificación sencilla pierna/brazo (p. ej. punta libre hacia abajo = pierna; resto = brazo) — falta definirla con el usuario. Varas pasantes = dos brazos o uno; palitos "en profundidad" (hacia la cámara); papitas, chupetín (maza), aceituna.
- Daño/velocidad por reglas simples (largo, peso aproximado), no por el análisis físico.
- Por qué hoy no se mueven: la articulación depende de `limb.rootPieceId`/pivote/rango del análisis; las varas pasantes comparten pieza (se gira una sola vez) y los rangos de movilidad pueden ser casi cero. Hay que verificarlo con la criatura real del usuario (no solo con la fixture A).

## Pendiente (en orden sugerido)
1. Implementar "palito clavado = brazo" y verificar con criaturas armadas a mano (no solo fixtures).
2. Medir/arreglar fluidez en la PC del usuario (pedirle modelo de GPU o fps).
3. Estética: ver captura real con HUD; mejorar iluminación/cámara de la pelea; brócoli con referencias reales.
4. Correr las 1697 pruebas y las de panel/teclado/probador antes de cerrar.
5. Decisiones abiertas del backlog: Ctrl+Z del giro (se hizo, `531606c`), autoguardado del frente, tanda 4, tiempo de espera/escudo, desafío por link.
