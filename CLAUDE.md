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
- Prioridad: que se vea LINDO, SUAVE y divertido, no hiperrealismo a toda costa. Paleta pastel: mantel rosado
  pastel con confeti pastel, paredes rubor, madera clara, recipientes menta/lavanda/celeste, limonada en vez de cola.
- Luz envolvente y suave (sol 2,7 + entorno 1,15), sombra de contacto amplia, bloom leve (umbral alto), contraste
  apenas bajo y sombras levantadas con tono cálido (`look.lift`), viñeta y grano mínimos. Ojo: si el lift o el
  bloom suben mucho la imagen queda lechosa/neblinosa.
- Animación: el chizito entra cayendo con rebote y después "respira" (flota ±1,5 mm; se calma mientras se juega),
  squash elástico al recibir una pieza (`fx/Shake.ts`); la pieza sale del vaso con un "pop" (easeOutBack) y se
  encoge al devolverla; el anillo de entrada late; las ayudas son píldoras translúcidas con fundido (Nunito);
  la escena aparece desde un velo crema.
- Chizito: CÁPSULA según el modelo 3D de referencia del usuario: casi recto, sección redonda, largo/grosor ≈ 2,2,
  puntas semiesféricas con el "ombligo" del corte, arrugas suaves longitudinales. Amarillo (#f6cb43).
  Las arrugas dependen del ángulo alrededor del eje: se desvanecen en los polos (si no, forman una "estrella"), y el
  normal map también (atributo `nmFade`).
- Palito: según el modelo 3D de referencia (3 palitos interpretados como uno): cilindro de grosor parejo con curva
  leve distinta en cada uno, puntas CORTADAS planas con borde redondeado, superficie lisa con hoyitos y rayitas.
  Dorado de horneado / marrón claro (#d4a15e), claramente distinto del chizito; puntas y hoyitos más tostados;
  granos de sal gruesa (malla aparte, hija del palito). 3,5 cm × Ø 3,4 mm (el usuario pidió la mitad de 7 cm).
- Tone mapping Neutral (Khronos PBR Neutral) por defecto + `LookEffect` (saturación/brillo/contraste acotados).
  `?tm=aces` / `?tm=agx` para comparar. No usar HueSaturationEffect de postprocessing: genera negativos → negros.
- Colores por vértice: `new THREE.Color('#hex')` YA está en lineal; no volver a convertir (antes se linealizaba
  dos veces y todo salía rojizo y saturado).

## Escala (1 unidad = 1 metro)
- Chizito: 4,4–5,2 cm de largo, 1,9–2,2 cm de grosor, casi recto.
- Palito: 3,5 cm, Ø 3,4 mm. Papita: Ø ~5 cm, 1,5 mm. Nacho: triángulo de ~4,5 cm de lado, 1,8 mm.
  Aceituna: 2 × 1,5 cm (rellena de morrón). Escarbadientes: 3 cm × Ø 2 mm (variante espadita de cotillón, 3 cm).
- Mesa en y = 0. Chizito flotando con centro en y = 10 cm (`CONFIG.chizitoCenter`): la mesa queda más lejos y despejada.
- Cámara casi fija (`render/CameraRig.ts`): dirección de mirada constante, a 30 cm del chizito, con zoom por
  dolly (rueda del mouse) entre 16 y 50 cm, suave. 50 mm sobre film de 36 mm. Nunca orbita.
- Composición despejada: bowl de papitas (izq.) y vasito de palitos (der.) simétricos a los costados, a media
  distancia; pocos objetos al fondo y lejos.

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
- Fondo: mesa de madera con mantel de cumpleaños de plástico rosado pastel con confeti; la mesa es grande para que su borde lejano
  no entre en cuadro. Palitos parados en un vasito descartable blanco a la derecha (detrás del chizito, levemente desenfocado; clic en
  el vaso = un palito). Bowl de cerámica blanca con papitas abajo a la izquierda.
  Tira de recipientes chicos al frente (mismo lenguaje: cerámica blanca y vasito descartable): nachos, aceitunas,
  [centro libre para el bowl de chizitos] y vasito de escarbadientes/espaditas [punta derecha libre para el ketchup].
  `fillBowl` centra cada pieza por su bbox y la acuesta (eje más fino hacia arriba).
  Al fondo: bowl de chizitos, bowl de papitas, vasos descartables, gaseosa genérica (sin marca), servilletas, gorrito.

## Assets
- Todo modelo pasa por `AssetRegistry`: si existe `public/assets/models/<tipo>.glb` se usa (normalizado a la
  medida y al marco de la definición); si no, el procedural. Los archivos opcionales se detectan por su firma
  (`glTF`, `#?`), porque Vite devuelve index.html con 200 para rutas inexistentes.
- Marcos locales: `centered` (chizito raíz: centrado, eje largo en X); `tip` (piezas que se clavan: punta/borde en
  el origen, cuerpo hacia +Y; la inserción avanza en −Y local).
- Ojo con el winding: las caras de `buildTube` deben quedar CCW vistas desde afuera (un error ahí hace que se
  renderice el interior y el chizito se vea oscuro con patrón de sombra).
- Variantes (`PieceDefinition.variants`, p. ej. escarbadientes liso / espadita): se guardan en
  `params.variant`; GLB opcional por variante `public/assets/models/<tipo>-<variante>.glb` (si no, el del tipo).
- GLB externos pasan por `prepareGlb`: unlit → MeshStandardMaterial, metalness 0, roughness ≥ 0,8 si no hay
  mapa, normales si faltan; soporta Draco (`public/assets/draco/`) y meshopt.
- Procedurales: tubo con polos (`assets/procedural/tube.ts`) deformado con simplex/FBM/billow en 3 escalas;
  texturas finas por `HeightField` tileable (poros = cráteres, ampollas, granos).

## Controles
- Rotar el chizito (con todas sus piezas): clic izquierdo + arrastrar sobre el chizito o el vacío cuando no hay
  nada en la mano; **clic derecho + arrastrar o Espacio + arrastrar, siempre, en cualquier estado**.
  Trackball con cuaterniones, inercia y amortiguación. La cámara NUNCA rota.
- Clic en el vaso de palitos: palito en la mano (suministro infinito). Sobre el chizito: anillo sutil en el punto de
  entrada + palito fantasma perpendicular (normal suavizada con 4 rayos vecinos, el chizito es grumoso).
- Clic sobre el chizito fija el punto (AIMING): mover el mouse pivota la cola alrededor de la punta
  (0,32°/px, máx. 85° respecto de la normal); flechas 1° (Shift: 5°). Ángulo discreto "X 90° · Y 26°"
  (ángulo respecto de la superficie en cada eje; 90° = perpendicular).
- Mantener clic izquierdo = hundir (INSERTING): 2 cm/s (proporcional al largo) con arranque suave y resistencia en los primeros 4 mm
  (la "costra"); al entrar la punta el ángulo queda trabado. Soltar = PLACED. Volver a mantener = más adentro.
  **Shift + mantener clic izquierdo = sacar** (único gesto para sacar); si sale del todo vuelve a la mano.
  Atraviesa el chizito (y lo que haya en el camino); siempre queda afuera el 20 % del largo (≈ 7 mm).
- Rueda = zoom de la cámara. **Ctrl + rueda = profundidad** (alejarla clava, acercarla saca: "ir hacia atrás"), suave; sirve al
  apuntar y con piezas clavadas o seleccionadas. Si sale del todo, vuelve a la mano. Cada gesto se puede deshacer.
- En PLACED: mantener actúa siempre sobre el palito recién clavado (el cursor suele quedar lejos tras apuntar);
  clic en el bowl = otro palito (el anterior queda clavado). Esc: devuelve
  (HOLDING), vuelve a la mano (AIMING) o suelta (PLACED).
- Papitas (bowl abajo a la izquierda): se clavan de canto con la misma mecánica (profundidad máx. 8 mm);
  Q / E giran la pieza sobre su eje en cualquier momento (en la mano, apuntando, mientras entra o ya clavada).
  B (en la mano) parte la papita: cada mordisco es una semilla guardada en `PieceData.params.bites`, así
  deshacer/guardar reproducen la forma exacta (hasta 7; desactivado si la papita viene de un .glb). Las semillas
  arrancan al azar en cada sesión: no hay dos papitas iguales ni entre partidas. Una papita colocada puede ser
  atravesada: el palito que entra en ella queda como hijo de la papita en el árbol.
- Nacho: igual que la papita (de canto, máx. 6 mm, Q/E, B lo parte; mismo generador `buildChipGeometry` con otro
  `ChipStyle`). Aceituna: entra apenas (máx. 4 mm) y se puede atravesar. Escarbadientes: como el palito (80 % del
  largo); en la mano, V cambia entre escarbadientes y espadita (se recuerda la última elegida por tipo).
- La ayuda en la mano sale de `PieceDefinition.holdHint`.
- Editar: clic en una pieza colocada → SELECTED_PLACED_PIECE (resaltado cálido sutil): mantener = hundir,
  Shift + mantener = sacar (si sale del todo vuelve a la mano y lo que tenía clavado se va con ella),
  Supr/Backspace = quitar, Esc = soltar.
- Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y): deshacer / rehacer. R dos veces (en 2,5 s) reinicia; también se deshace.
  H oculta ayudas. Ctrl+S exporta (fase 4).

## Feedback (fase 3)
- Al primer contacto: micro-sacudida del chizito (resorte amortiguado, ~3 mm, `fx/Shake.ts`) + "crack" + 2 migas.
- Mientras entra: temblor mínimo, crujido muy leve (granos de ruido esporádicos) y hasta 2 migas más.
- Migas (`fx/Crumbs.ts`): caen con gravedad, rebotan apenas y quedan sobre el mantel (máx. 70; R las limpia).
- Audio (`audio/AudioManager.ts`): busca public/assets/sounds/<id>.(ogg|mp3|wav) con id = pick, drop, crack,
  crunch, out; si no existe, sintetiza un placeholder con Web Audio. Arranca tras el primer gesto del usuario.

## Deshacer / rehacer
- `commands/CommandStack.ts`: cada acción (clavar/hundir, sacar, quitar, reiniciar) guarda la construcción antes y
  después; deshacer = `Construction.restore(snapshot)`, que reutiliza objetos por id (los quitados quedan en un
  "cementerio" para no regenerar mallas). Antes de deshacer se suelta o devuelve lo que haya en la mano.

## Arquitectura (`src/`)
- `render/` escena, cámara, luces, entorno, postprocesado, set de fondo.
- `assets/` AssetRegistry + generadores procedurales.
- `pieces/` PieceDefinition (datos) + PieceRegistry. Agregar un snack = agregar una definición.
- `model/` Construction: árbol de piezas; la raíz es el chizito (una pieza más).
- `interaction/` máquina de estados (IDLE → HOLDING → AIMING → INSERTING → PLACED, SELECTED_PLACED_PIECE) y trackball.
- `input/` mouse/teclado normalizados. `commands/` deshacer/rehacer. `audio/` sonidos. `fx/` sacudida y migas.
  `ui/` ayudas y ángulo. Próxima fase: `persistence/`.

## Fases
1. Escena realista + chizito procedural + rotación con inercia. ← hecha
2. Bowl, agarrar palito, punto de entrada, ángulo, clavar/sacar, atravesar. ← hecha
   Prueba automatizada: `node scripts/play-test.mjs <dir>` (con `npm run dev` corriendo).
3. Feedback (sacudida, migas, sonido), papitas, edición, undo/redo. ← hecha
   Prueba automatizada: `node scripts/phase3-test.mjs <dir>`. Piezas nuevas: `node scripts/pieces-test.mjs <dir>`.
4. Guardado/carga JSON versionado, GLB, pulido.
Al terminar cada fase: capturas con Playwright, autocrítica de realismo, commit, y esperar aprobación.
