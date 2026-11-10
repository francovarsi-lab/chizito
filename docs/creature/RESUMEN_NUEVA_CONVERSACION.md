# Resumen para un chat nuevo — CUMPLEAÑITO / Chizito Fight

Al 2026-11-10. Repo privado `francovarsi-lab/chizito`, rama de trabajo `claude/compassionate-carson-41ubkc` (último commit de
código `d49feec`). La fuente de verdad detallada es `CLAUDE.md` (secciones "Forma de trabajo", constructor y "Pelea").

## Reglas permanentes del usuario (Franco)
- Español rioplatense. Usa Claude de escritorio (Windows); las sesiones corren en la nube. Informes cortos, con hash del commit
  y qué mirar. Él no siempre puede probar: avanzar igual y dejar todo subido.
- NO pushear a `main` (no comparte historia con esta rama). No tocar `claude/friendly-faraday-2lyzl2`. Trabajar y pushear sólo
  en esta rama. Sin PRs salvo que los pida. Commits con autor Franco Varsi (`-c user.name/-c user.email`).
- "Apuntar al 100 para llegar al 10": nivel de juego top; analizar cada detalle y DECIDIR cuál vale; bello, único, arte +
  función, fluidez primero. La pelea es un show; tiene que tener la MISMA estética que el constructor (mismo mundo).
- Higgsfield: Nano Banana 2.1 en 1K (~1,5 créditos) para explorar, 2K (~2) sólo lo final; 3D con SAM 3 (1 crédito, con
  `prompt`). Gasto bajo y avisar si se dispara. Sonidos: los graba él; dejar ids listos.

## Cómo probar
- En su PC: `git clone https://github.com/francovarsi-lab/chizito.git` → `cd chizito` →
  `git checkout claude/compassionate-carson-41ubkc` → `npm install` → `npm run dev` → http://localhost:5173 (Chrome).
- Vercel (se actualiza con cada push): https://chizito-git-claude-compassionate-carson-41ubkc-el-mejor-lugar.vercel.app/ —
  tiene "Vercel Authentication" activada: sólo con sesión de Vercel del equipo el-mejor-lugar (se desactiva en Settings →
  Deployment Protection; no lo cambiamos sin que lo pida).

## Qué es
Dos partes en la misma mesa 3D (Vite + TypeScript + Three.js): el CONSTRUCTOR (clavar palitos, escarbadientes, palitos de la
selva, chupetín, papitas, nachos, aceitunas y ketchup en un chizito) y la PELEA (botón PELEAR): TU CHIZITO, con sus mallas
reales, contra EL BROCOLOCO (niveles 1–3). Pelea en `src/creature/fight/`: `fighter.ts` (snapshot → modelo), `engine.ts`
(motor puro y determinista a 60 Hz), `ai.ts`, `tuning.ts` (TODOS los números), `render.ts`, `brocoli.ts`, `stage.ts`,
`hud.ts`, `mount.ts`. Secciones compartidas en `src/creature/zones.ts`.

## Estado de la pelea (hecho)
- Regla base: cada vara clavada es un brazo o pierna rígida articulada en su punto de clavado. SECCIONES del chizito (las
  mismas que muestra el constructor): PIERNAS = el pedazo de abajo (25 % del largo), CABEZA = arriba (no es brazo: pesa y
  protege), BRAZOS = el medio; izquierda/derecha como se arma (izquierda = +Y del chizito).
- CONTROLES por cuadrante: Q brazos izq, W brazos der, A piernas izq, S piernas der (cada toque usa la siguiente extremidad de
  ese cuadrante, de a una), D guardia, flechas mover/saltar/agacharse, Esc pausa. Z/X/C quedan como atajos. HUD con el chizito
  dividido y la cantidad por cuadrante.
- Física: motores PD con torque según la inercia, contrapeso, piernas que se paran sobre el piso y ponen el pie bajo el centro
  de masa (más al patear), torso que gira con el golpe, anticipación (peso atrás al cargar, adelante al soltar), envión al
  soltar. Acertar frena y rebota; pifiar sigue de largo y cuesta tiempo (y estabilizarse). Daño = masa^0,4 · velocidad^1,3.
- Lo pesado se carga (un golpe recibido la corta). Chupetín: pega con el cuerpo entero (carga corta y visible); abajo es pierna
  fija que patea con contrapeso. Varas que atraviesan = fijas. Escudos (papita 2 golpes, nacho 6) que se astillan; la guardia
  los presenta (cabeza, espalda, abajo). Guardia física con los brazos.
- Piernas con fuerza y rapidez por pieza (selva lento y fuerte, escarbadientes rápido y débil); salto según fuerza/peso con
  agachada previa; sin piernas no salta.
- Combinaciones tras acertar: UNO-DOS, RÁFAGA (3+ brazos), PIÑA Y PATADA, CONTRA (tras bloquear). Lo apretado durante el
  congelamiento del impacto se guarda. El brócoli encadena desde nivel 2.
- Efectos: congelamiento, destello blanco y vibración, migas variadas, astillas, ¡JAPISH! en golpes fuertes/combos, ¡PIFIÓ! y
  ¡PIF! alternados, nombres TU CHIZITO / EL BROCOLOCO. Sonidos grabables (`public/assets/sounds/<id>.ogg|mp3|wav`): golpe,
  golpe-pesado, bloqueo, zumbido, pifio, escudo, ko, round, pelea, combo, japish, risa (+ los del constructor).
- PRESENTACIÓN antes del round 1 con los modelos reales: la cámara rodea a TU CHIZITO, que se estira y le tira piñas a la
  cámara; primer plano de EL BROCOLOCO que levanta las zanahorias y se ríe. Se saltea con cualquier tecla.
- Escenario de noche según el arte clave (`docs/arte/arte-clave-pelea.jpg`): cuarto oscuro con bokeh, foco cenital con haz y
  polvo, focos de cara que siguen a cada luchador, tabla de picar grande con textura, restos de fiesta en capas (caramelos sin
  marca, carozos, servilletas), lucecitas. Giro hacia la cámara: criatura 40°, brócoli 60° (su cara se tiene que leer: es
  prioridad del usuario). Brócoli 3D de Higgsfield (GLB) con la cara del boceto pegada sobre el tallo (ojos de remolacha con
  brillo, cejas de morrón, dientes de sésamo blanco).
- Carga: ensayo invisible en ratos libres mientras se arma (modelos, arena, shaders compilados con la luz de la pelea): abrir
  la pelea pasó de ~1 s a ~0,1 s y no compila shaders nuevos (antes 28). Cargador animado al abrir la web.

## Constructor (cambios recientes)
- Línea punteada sobre el chizito (cabeza / brazos / piernas, izquierda / derecha) con carteles de las teclas, visible con una
  pieza en la mano o con el cartel abierto. Cartel "ELEGÍ LOS INGREDIENTES" (incluye que el ketchup es para dibujarle la
  cara); se cierra al agarrar una pieza; I lo abre y cierra.
- Mismo mundo que la pelea: lucecitas (suaves de día), restos de fiesta al fondo, un poco más de contraste y color.

## Pruebas (última corrida)
- `npx tsc --noEmit -p .` limpio. `node scripts/creature-fight-test.mjs` → 151 OK. `node scripts/creature-test.mjs` → 1697 OK.
- Con `npm run dev`: `node scripts/fight-ui-test.mjs <dir>` (navegador, teclado real) → 16 OK en la última corrida completa.
- Capturas con Playwright y `?capture` (WebGL por software: lento y el primer cuadro exagera la compilación; no representa una
  GPU real). `?capture&presentacion` muestra la presentación. Chromium en `/opt/pw-browsers/chromium`.

## Pendientes / propuestas (decidir con el usuario)
1. Que el usuario pruebe en su PC: giro de 40° (`FIGHT.stanceYaw`), botones Q W A S D, combinaciones, chupetín, presentación,
   tiempos de carga.
2. Arranque: compilar los shaders del constructor en paralelo antes del primer cuadro (`compileAsync`, como el ensayo de la
   pelea). Opcional: hornear o cachear las texturas procedurales (madera, mantel, chizito) — se evaluó y se dejó.
3. Estética del constructor más cerca de la pelea (decisión de arte: luz de atardecer, la tabla bajo el chizito).
4. Letras de impacto estilo arcade, grabaciones de sonido, texturas del chizito en Higgsfield (2K final), cadenas de varias
   articulaciones. La madera de la tabla todavía tira a rojo en los bordes.
5. Integrar con `main` (historias distintas): decidir antes cómo.
- Higgsfield gastado: ~9,5 créditos en total (5 imágenes 1K + 2 modelos SAM 3); nada en las últimas tandas.
