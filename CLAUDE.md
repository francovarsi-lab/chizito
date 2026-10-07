# Hombrecito de chizito — decisiones del proyecto

MVP para validar UNA cosa: que clavar palitos salados (y papitas) en un chizito, eligiendo punto y ángulo,
sea divertido, satisfactorio y se vea fotográficamente real. Nada de combate, stats, progresión, economía,
rarezas, puntuación ni desafíos (ni UI preparada para eso).

## Stack
- Vite + TypeScript + Three.js (sin React). `postprocessing` (pmndrs) + `n8ao` para el AO.
- Sin motor de física ni CSG: el clavado es geométrico (raycast + transformaciones); la parte del palito
  que queda adentro la oculta el depth buffer porque el chizito es opaco.
- Solo escritorio (Chrome, mouse + teclado). Objetivo: 60 fps.
- Comandos: `npm run dev`, `npm run typecheck`, `npm run build`, `node scripts/screenshots.mjs [url] [dir]`
  (capturas con Playwright; la página con `?capture` renderiza bajo demanda porque el WebGL por software es lento).
  `node scripts/one.mjs "<query>" out.png` saca una sola captura. Query de depuración: `noao`, `tm=agx`, `seed=N`.

## Dirección visual (actualizada con referencias del usuario)
- Prioridad: que se vea DIVERTIDO y apetitoso, no hiperrealismo a toda costa. Look de foto de producto alegre:
  luz blanca y suave, colores vivos pero fieles, mantel celeste con confeti (el amarillo y el naranja resaltan).
- Chizito: inflado tipo "maní", amarillo pálido manteca (#f2cf68), gordito, puntas romas, grumos suaves y poros.
- Palito: palito de queso NARANJA (#f2a240), grueso e irregular, grosor despareño, puntas redondeadas, leve curva.
- Tone mapping Neutral (Khronos PBR Neutral) por defecto + `LookEffect` (saturación/brillo/contraste acotados).
  `?tm=aces` / `?tm=agx` para comparar. No usar HueSaturationEffect de postprocessing: genera negativos → negros.
- Colores por vértice: `new THREE.Color('#hex')` YA está en lineal; no volver a convertir (antes se linealizaba
  dos veces y todo salía rojizo y saturado).

## Escala (1 unidad = 1 metro)
- Chizito: 4,6–5,6 cm de largo, 1,85–2,2 cm de grosor, apenas curvado, con "cintura" de maní.
- Palito: ~8,5 cm, Ø ~6 mm (más grueso que el original de 3 mm, según la referencia). Papita: Ø ~5 cm, 1,5 mm.
- Mesa en y = 0. Chizito flotando con centro en y = 7,2 cm (`CONFIG.chizitoCenter`).
- Cámara fija en (0, 12,2 cm, 20 cm) mirando al chizito con leve inclinación; 50 mm sobre film de 36 mm.

## Estética
- Base fotográfica (sigue valiendo, pero al servicio de lo divertido). Fuentes del realismo: IBL + luz direccional cálida de ventana con sombras suaves
  (PCF, radio 7, mapa de 4096), PBR con roughness alto + normal/roughness maps generados por código,
  AO (N8AO, radio 1 cm), profundidad de campo propia (`render/BokehDofPass.ts`), tone mapping Neutral, viñeta y grano leves.
- DoF: el `DepthOfFieldEffect` de postprocessing dejaba fantasmas en el primer plano y su desenfoque dependía de la
  resolución; se reemplazó por un gather en espiral (Gustafsson) a media resolución. El CoC se mide en dioptrías con una
  banda nítida garantizada (±1 dpt alrededor del foco) para que el chizito y la pieza en la mano siempre estén nítidos.
- Luz de ventana adelante a la izquierda (detrás del espectador), para que la sombra del chizito caiga sobre la mesa
  visible detrás de él.
- HDRI: si existe `public/assets/hdri/interior.hdr` se usa automáticamente (entorno + fondo). Si no, se genera
  un living cálido procedural (ventana de tarde adelante a la izquierda, lámpara, aparador, banderines, globos) con PMREM.
  `CONFIG.environment.hdriRotationY` alinea la ventana del HDRI con la luz direccional.
- Telón fotográfico opcional: `public/assets/backdrop.jpg` (foto real ya desenfocada). Plano perpendicular a la
  cámara fija a `CONFIG.photoBackdrop.distance`, en modo cover; el shader aplica la inversa exacta del ACES de three
  para que la foto salga tal cual (con Neutral se aproxima como identidad). Si existe: se ocultan los objetos de fondo modelados y la mesa 3D se funde con la
  foto (mezcla de color por z en pantalla, sin transparencia). `offsetY` alinea la mesa de la foto con la 3D.
- Sombra del chizito: `ContactShadow` (silueta de las piezas héroe vista desde la luz, desenfocada y proyectada sobre
  la mesa). El chizito y lo clavado están en `HERO_LAYER` y NO proyectan la sombra dura del sol.
- Fondo: mesa de madera con mantel de cumpleaños de plástico celeste con confeti, apenas girado (se ve madera al fondo a la
  derecha). Bowls de cerámica blanca en primer plano: palitos abajo a la derecha, papitas abajo a la izquierda.
  Al fondo: bowl de chizitos, bowl de papitas, vasos descartables, gaseosa genérica (sin marca), servilletas, gorrito.

## Assets
- Todo modelo pasa por `AssetRegistry`: si existe `public/assets/models/<tipo>.glb` se usa (normalizado a la
  medida y al marco de la definición); si no, el procedural. Los archivos opcionales se detectan por su firma
  (`glTF`, `#?`), porque Vite devuelve index.html con 200 para rutas inexistentes.
- Marcos locales: `centered` (chizito raíz: centrado, eje largo en X); `tip` (piezas que se clavan: punta/borde en
  el origen, cuerpo hacia +Y; la inserción avanza en −Y local).
- Ojo con el winding: las caras de `buildTube` deben quedar CCW vistas desde afuera (un error ahí hace que se
  renderice el interior y el chizito se vea oscuro con patrón de sombra).
- GLB externos pasan por `prepareGlb`: unlit → MeshStandardMaterial, metalness 0, roughness ≥ 0,8 si no hay
  mapa, normales si faltan; soporta Draco (`public/assets/draco/`) y meshopt.
- Procedurales: tubo con polos (`assets/procedural/tube.ts`) deformado con simplex/FBM/billow en 3 escalas;
  texturas finas por `HeightField` tileable (poros = cráteres, ampollas, granos).

## Controles
- Rotar el chizito (con todas sus piezas): clic izquierdo + arrastrar sobre el chizito o el vacío cuando no hay
  nada en la mano; **clic derecho + arrastrar o Espacio + arrastrar, siempre, en cualquier estado**.
  Trackball con cuaterniones, inercia y amortiguación. La cámara NUNCA rota.
- Clic en el bowl de palitos: palito en la mano (suministro infinito). Sobre el chizito: anillo sutil en el punto de
  entrada + palito fantasma perpendicular (normal suavizada con 4 rayos vecinos, el chizito es grumoso).
- Clic sobre el chizito fija el punto (AIMING): mover el mouse pivota la cola alrededor de la punta
  (0,32°/px, máx. 85° respecto de la normal); flechas 1° (Shift: 5°). Ángulo discreto "X 90° · Y 26°"
  (ángulo respecto de la superficie en cada eje; 90° = perpendicular).
- Mantener clic izquierdo = hundir (INSERTING): 2,6 cm/s con arranque suave y resistencia en los primeros 4 mm
  (la "costra"); al entrar la punta el ángulo queda trabado. Soltar = PLACED. Volver a mantener = más adentro.
  **Shift + mantener clic izquierdo = sacar** (único gesto para sacar); si sale del todo vuelve a la mano.
  Atraviesa el chizito (y lo que haya en el camino); máximo = largo − 1,5 cm.
- En PLACED: mantener actúa siempre sobre el palito recién clavado (el cursor suele quedar lejos tras apuntar);
  clic en el bowl = otro palito (el anterior queda clavado). Esc: devuelve
  (HOLDING), vuelve a la mano (AIMING) o suelta (PLACED).
- H oculta ayudas, R reinicia (con confirmación), Ctrl+S exporta, Ctrl+Z / Ctrl+Shift+Z deshacer/rehacer,
  Supr/Backspace quita la pieza seleccionada.

## Arquitectura (`src/`)
- `render/` escena, cámara, luces, entorno, postprocesado, set de fondo.
- `assets/` AssetRegistry + generadores procedurales.
- `pieces/` PieceDefinition (datos) + PieceRegistry. Agregar un snack = agregar una definición.
- `model/` Construction: árbol de piezas; la raíz es el chizito (una pieza más).
- `interaction/` máquina de estados (IDLE → HOLDING → AIMING → INSERTING → PLACED, SELECTED_PLACED_PIECE) y trackball.
- `input/` mouse/teclado normalizados. Próximas fases: `commands/` (undo/redo), `persistence/`, `audio/`.

## Fases
1. Escena realista + chizito procedural + rotación con inercia. ← hecha
2. Bowl, agarrar palito, punto de entrada, ángulo, clavar/sacar, atravesar. ← hecha
   Prueba automatizada: `node scripts/play-test.mjs <dir>` (con `npm run dev` corriendo).
3. Feedback (sacudida, migas, sonido), papitas, edición, undo/redo.
4. Guardado/carga JSON versionado, GLB, pulido.
Al terminar cada fase: capturas con Playwright, autocrítica de realismo, commit, y esperar aprobación.
