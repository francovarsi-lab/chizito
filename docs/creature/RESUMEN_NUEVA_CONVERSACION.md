# Resumen para un chat nuevo — CUMPLEAÑITO / Chizito Fight (al 2026-11-16)

Repo privado `francovarsi-lab/chizito`. **Rama vigente: `claude/wonderful-galileo-8j38yn`** (sale de `claude/charming-cray-7n5v8f`) (último commit de esta etapa: ver
`git log -1`). Contiene todo lo anterior (`claude/sharp-einstein-iuyqgn` ← `claude/wonderful-noether-lvp9gc`).
Leer primero `CLAUDE.md` (decisiones) y `docs/PLAN_PREMIUM.md` (plan con el estado de cada tarea).

## Reglas permanentes (Franco)
- Español rioplatense. Usa Claude de ESCRITORIO; las sesiones corren en la nube. Informes CORTOS: sin explicaciones de más,
  hash, qué mirar, qué quedó sin probar. "Avanzá con todo": hacer toda la lista antes de reportar.
- SIEMPRE dejarle un LINK para probar: levantar `npx vite --host 0.0.0.0 --port 5173` en segundo plano y avisar el puerto con
  `report_preview_port` (5173, nombre "juego"): lo abre como vista previa en la app de escritorio.
- NO pushear a `main`. Pushear sólo a la rama de la sesión. Sin PRs salvo pedido. Commits con autor Franco Varsi, en español.
- "Apuntar al 100 para llegar al 10": premium, bello, color de verdad (NADA de pasteles), fluidez primero (60 fps).
- Higgsfield: Nano Banana 2.1 en 1K para explorar, 2K sólo lo final, 3D con SAM 3. Gastado ~15,5 créditos.
- Sonidos: los graba él; ids listos en `public/assets/sounds/<id>`; sin archivo suenan sintetizados o con alias.
- DESCARTADO (no volver a poner): barra de AIRE/estamina, plato dorado, "NIVEL N" junto al rival, "¡MAREADO!", etiquetas en los
  golpes, "SE ESTÁ ESTABILIZANDO", sugus y bowl de chizitos en el constructor.

## Cómo probar / medir
- `npm install` → `npx vite --host 0.0.0.0 --port 5173` (+ `report_preview_port`). `?nivel=2|3`, `?sinintro`, `?capture`.
- Pruebas: `npx tsc --noEmit` y `node scripts/creature-fight-test.mjs` → **230 OK**.
- Balance: `node scripts/make-archetypes.mjs` y `node scripts/fight-matrix.mjs 20` (~2 min, 4 núcleos) → `docs/creature/BALANCE.md`.
  `MDEBUG=1 MATRIX_CHILD=1 node scripts/fight-matrix.mjs 2 boxeador` da el detalle de eventos por pelea.
- Sondas: `node scripts/fight-probe.mjs arq/boxeador` (tiempos y daño por brazo; `GAPS=0.07,0.1`), `node scripts/fight-reach.mjs`.
- Captura de la pelea: `node scripts/fight-shot.mjs <png> [nivel] [cuadros]` con el server andando (~4 min; 90–200 cuadros;
  usa `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`). NO tocar `src/config.ts` mientras corre (Vite recarga y se corta).
- Laboratorio de rivales (rápido, sin pelea): `lab/brocoli.html?rival=huevo|quinoa`.

## Hecho en esta etapa (plan premium)
- T1 arquetipos con el frente real + matriz de balance; el chupetín gira alrededor de la cara de frente (simétrico).
- T2 golpes que se leen (13–16 cuadros botón→impacto), daño por recorrido, alcance parejo de los dos hombros; aporrear perdía.
- T3 rápido/cargado (mantener Q/W), gancho ↓+Q, barrida ↓+A, pasito →→, atajada (D justa), guardia rota, cadenas 100/90/80/70.
- T4 poder: remate / escape con media barra, súper con barra llena según lo armado (nube, trompo, carozazo, acupuntura, muralla).
- T5 `moves.ts`: ataques de rivales como datos + IA por estados (`rivalDecide`). Brócoli: zanahoriazo, doble, cabezazo, pisotón.
- T6 huevo: brazos de látigo (shader de 3 tramos), pinchazo largo, látigo bajo (saltar), rebote, fase 2 (grieta y yema).
- T7 la cara del rival reacciona (aviso / recibe / gana).
- T8 quinoa de granos: absorbe lo rápido, revienta con lo cargado, montoncitos que vuelven, se achica; cañón, mazazo, derrumbe.
- G1 pelea: cuarto que se adivina, foco blanco, tabla de madera, zanahorias naranjas. Arreglado: `Hurt` perdía los shaders.
- G3–G6 efectos 3D (`fx.ts`), luz de impacto, cámara de espectáculo, público que salta, confeti, barra de poder partida.
- G7 constructor: saturación 0,32 → 0,24 (revertir si a Franco no le gusta).

## Hecho después (misma fecha, sesión siguiente)
- Balance en objetivo: jugando bien 66 / 57 / 17 %, aporreando 9 / 0 / 0 % (detalle y qué se cambió: `BALANCE.md`).
- O1 primera versión: pelea contra un amigo por link (ver "PELEA CONTRA UN AMIGO" en `CLAUDE.md`). Pruebas: 233 puras +
  `scripts/versus-test.mjs`.

## Pendiente (en orden)
1. Que Franco JUEGUE: los 3 niveles con el balance nuevo, y la pelea contra un amigo ENTRE DOS COMPUTADORAS (sólo se probó
   entre dos pestañas; el camino por internet con PeerJS no se pudo probar desde la nube).
2. Armados fuera de rango: `pinchudo` fuerte (90 / 90 / 40), `chupetin2` no le gana al brócoli jugando "bien", `tanque`
   aporreando 60 % al nivel 1; `mazo` y `tanque` 0 % contra la quinoa.
3. O1, lo que falta: reenvío de estado si se desincroniza, aviso de "esperando a tu amigo" si se cuelga, servidor propio.
4. Restos visuales: velitas que se apagan en el KO, focos que barren, capas de música por combo, retratos y reloj en el HUD,
   fundido por profundidad y aberración en efectos, halos del DoF en el constructor, HDRI real, normal map de la tabla.
5. Integración con `main`: historias distintas; decidir con Franco antes.
