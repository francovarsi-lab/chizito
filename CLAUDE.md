# Hombrecito de chizito — decisiones del proyecto

Dos partes en la misma mesa 3D: el CONSTRUCTOR (clavar palitos y snacks en un chizito, eligiendo punto y ángulo;
divertido, satisfactorio y fotográficamente real; sin stats ni economía) y la PELEA (botón PELEAR: la criatura armada
pelea contra el brócoli con física propia; ver "Pelea"). Ramas: esta (`claude/compassionate-carson-41ubkc`) junta el
constructor (`claude/friendly-faraday-2lyzl2`) y el intérprete/pelea (`claude/creature-interpreter`). NO pushear a `main`.

## Forma de trabajo del usuario (Franco) — vale para TODO el proyecto, siempre
- "Hay que apuntar al 100 para llegar al 10": nivel de juego top, con todos los detalles analizados para destacar según su
  nivel y atención. Siempre hay más detalles para agregar; lo que separa es la DECISIÓN: no todo se hace, pero cada detalle
  posible se analiza y se ejecuta cuando vale la pena por la especificidad que consigue. Mejorar siempre, ser únicos,
  combinar arte, estilo, concepto y creatividad, sin dejar de lado la funcionalidad de una web (fluidez primero).
- Bello, diferente, único, que atraiga desde el arte (no sólo funcional); no hace falta hiperrealismo al milímetro.
- Cada cambio de arte en la pelea tiene que ser coherente con la escena del constructor (mismo mundo: 3D, texturas,
  profundidad, luz). La pelea es un "show": reflectores, golpes, barras, movimientos.
- Generación de imágenes en Higgsfield: Nano Banana 2.1 en 1K (~1,5 créditos) para explorar; 2K (~2) sólo para lo final.
  Mantener el gasto bajo y avisar si algo se dispara. 3D: SAM 3 (1 crédito, con `prompt` del objeto) antes que Tripo (9) o
  Meshy (30).
- Sonidos: los va a grabar él; dejar ids de sonido listos para reemplazar por archivos.
- SIEMPRE, al terminar cada tanda, pasarle el LINK PARA JUGAR (y para pasarle a sus amigos). El link fijo de la rama es
  `https://chizito-git-<rama-con-guiones>-el-mejor-lugar.vercel.app` (esta: `chizito-git-claude-stoic-newton-87biy2-el-mejor-lugar`):
  siempre muestra el último deploy de la rama. Vercel: proyecto `chizito`, equipo `team_JOLVbkkbKQEXlwexy9OhUAzu`; la protección
  "Vercel Authentication" está APAGADA (2026-11-21, pedido del usuario) para que cualquiera abra el link sin pedir permiso.

## Stack
- Vite + TypeScript + Three.js (sin React). `postprocessing` (pmndrs) + `n8ao` para el AO.
- Sin motor de física ni CSG: el clavado es geométrico (raycast + transformaciones); la parte del palito
  que queda adentro la oculta el depth buffer porque el chizito es opaco.
- Solo escritorio (Chrome, mouse + teclado). Objetivo: 60 fps.
- Comandos: `npm run dev`, `npm run typecheck`, `npm run build`, `node scripts/screenshots.mjs [url] [dir]`
  (capturas con Playwright; la página con `?capture` renderiza bajo demanda porque el WebGL por software es lento).
  `node scripts/one.mjs "<query>" out.png` saca una sola captura. Query de depuración: `noao`, `tm=agx`, `seed=N`.

## Dirección visual (actualizada con referencias del usuario)
- Prioridad: que se vea LINDO, con COLOR DE VERDAD y premium (el usuario descartó los PASTELES: "feo y no coincide con la
  pelea"). Mantel AZUL PISCINA intenso (#2f9fd4) con confeti chico y espaciado de colores vivos; recipientes de CERÁMICA
  ESMALTADA de colores (coral, turquesa, violeta; el del ketchup blanco) y VASITOS DE CUMPLEAÑOS RAYADOS (rojo palitos, verde
  escarbadientes, violeta espaditas, azul chupetines). `look`: saturación 0,24 (G7 del plan; antes 0,32), contraste +0,16, lift casi nulo; VIÑETA
  marcada (offset 0,3, oscuridad 0,42; en la pelea 0,55).
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
  granos de sal gruesa MATES (malla aparte, hija del palito; con brillo titilaban y distraían). 3,5 cm × Ø 3,4 mm (el usuario pidió la mitad de 7 cm).
- Tone mapping Neutral (Khronos PBR Neutral) por defecto + `LookEffect` (saturación/brillo/contraste acotados).
  `?tm=aces` / `?tm=agx` para comparar. No usar HueSaturationEffect de postprocessing: genera negativos → negros.
- Colores por vértice: `new THREE.Color('#hex')` YA está en lineal; no volver a convertir (antes se linealizaba
  dos veces y todo salía rojizo y saturado).

## Escala (1 unidad = 1 metro)
- Chizito: 4,4–5,2 cm de largo, 1,9–2,2 cm de grosor, casi recto.
- Palito: 3,5 cm, Ø 3,4 mm. Papita: Ø ~5 cm, 1,5 mm. Nacho: triángulo de ~4,5 cm de lado, 1,8 mm.
  Aceituna: 2 × 1,5 cm (rellena de morrón). Escarbadientes: 3 cm × Ø 2 mm (variante espadita de cotillón, 3 cm).
  Palito de la selva: 4,5 cm × Ø 7,2 mm. Chupetín: palito 5,5 cm × Ø 3,4 mm + bola Ø 2,1 cm.
- Mesa en y = 0. Chizito flotando con centro en y = 10 cm (`CONFIG.chizitoCenter`): la mesa queda más lejos y despejada.
- Cámara casi fija (`render/CameraRig.ts`): dirección de mirada constante, ALTA (24°), 45 mm, a 38 cm del objetivo
  (0; 8,8 cm; −4 cm), zoom por dolly (rueda) entre 22 y 60 cm. Banda de foco AMPLIA (±1,5 dpt): todo lo que está sobre la mesa
  queda nítido (pedido del usuario: "las opciones para agregarle no pueden estar lejos ni fuera de foco"; el ángulo bajo de
  65 mm "se veía feo"). La intro (la casa con la fiestita) no cambia. Nunca orbita.
- Composición (`BOWL_LAYOUT`, CALCULADA sobre la cámara real: nada cortado por el borde, nada encimado, todo en foco, libres el
  centro y el lugar donde cae la sombra del chizito, ≈ (3,4; −6,1) cm): a la DERECHA las varas y las aceitunas (se ensartan en
  ellas), a la IZQUIERDA escudos (papitas, nachos), palito de la selva y ketchup; adelante lo bajo, atrás lo alto. Si se mueve la
  cámara hay que recalcularla (proyectar cada recipiente con la cámara y chequear cortes, encimados y dioptrías).

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
- Habitación real y simple (`render/Room.ts`, medidas lógicas): mesa de cumpleaños 1,9 × 1,5 m (x ±0,95, z −1,2…+0,3)
  con patas y el mantel cayendo 30 cm por los cuatro lados, piso a −0,75 m, pared del fondo a z −1,23 (PEGADA a la mesa: el borde de atrás queda contra la pared), paredes
  laterales a x ±1,7, techo a 1,6 m, zócalo blanco. Paredes LISAS; las guirnaldas cuelgan de chinches clavadas en la
  pared del fondo (catenaria a 2 cm de la pared, los banderines se mecen sólo hacia adelante). Globos: dos racimos
  de tres atados a las esquinas del fondo de la mesa, separados (distancia entre centros > suma de radios). La
  tapa y el mantel de arriba siguen visibles con foto de fondo; el resto está en `farProps`. Palitos parados en un vasito descartable blanco a la derecha (detrás del chizito, levemente desenfocado; clic en
  el vaso = un palito). Bowl de cerámica blanca con papitas abajo a la izquierda.
  SOMBRAS DE LOS RECIPIENTES: no proyectan la sombra dura del sol (`markBowl`, capa `BOWL_LAYER`); comparten UNA sombra
  suave de grupo (`ContactShadow` estática, misma dirección de luz y misma intensidad para todos), aparte de la del chizito.
  Tira de recipientes chicos al frente (mismo lenguaje: cerámica blanca y vasito descartable): nachos, aceitunas,
  vasito de escarbadientes, vasito de espaditas y platito con sobrecitos de ketchup (genéricos, sin marca).
  Las claves de `bowls`/`BOWL_LAYOUT` son `tipo` o `tipo:variante` (el recipiente decide la variante).
  `fillBowl(assets, tipo, radioBowl, altoBowl, …)` centra cada pieza por su bbox, la acuesta (eje más fino hacia
  arriba) y la APOYA: `restOnBowl` la sube hasta que ningún vértice atraviese fondo, pared o borde (`bowlFloor`
  usa el mismo perfil interior que `makeBowl`).
  Al fondo: bowl de papitas, vasos descartables, gaseosa genérica (sin marca), gorrito. SÓLO EN LA PELEA (grupo 'solo-pelea' de
  `farProps`, oculto en el constructor; `enterFightSet` lo muestra): el bowl de chizitos y los restos de fiesta (sugus, carozos,
  servilletas): en el constructor parecían cosas para elegir. Sobrecitos de ketchup en abanico PARALELO (no se cortan). Sin plato
  dorado (el usuario no lo entendió). Recipientes más chicos que antes (menos piezas; las piezas, tamaño real).

## Assets
- Todo modelo pasa por `AssetRegistry`: si existe `public/assets/models/<tipo>.glb` se usa (normalizado a la
  medida y al marco de la definición); si no, el procedural. Los archivos opcionales se detectan por su firma
  (`glTF`, `#?`), porque Vite devuelve index.html con 200 para rutas inexistentes.
- Marcos locales: `centered` (chizito raíz: centrado, eje largo en X); `tip` (piezas que se clavan: punta/borde en
  el origen, cuerpo hacia +Y; la inserción avanza en −Y local). En 'tip' el origen es el punto REAL más bajo
  (promedio de los vértices a < 0,4 mm del mínimo), no el centro de la caja: con el centro de la caja el nacho se
  "clavaba" por un punto vacío y quedaba flotando, como si tuviera un disco transparente.
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
  `ChipStyle`): TRIÁNGULO de lados rectos con puntas apenas redondeadas (smin con tope 0,96). Se clava POR UNA PUNTA,
  derecho (`keepOrientation`: el procedural ya viene con la punta en −Y; contorno con giro fijo).
  Aceituna: NO se clava en el chizito; se ensarta en la punta libre de un palito o escarbadientes (`mountsOnTail`,
  mismo flujo que el chizito extra: clic en el palito → se presenta → clic en la aceituna = por dónde entra →
  ángulo → mantener). Se puede atravesar. Escarbadientes: como el palito (80 % del
  largo); escarbadientes y espadita salen de vasitos distintos (`escarbadientes` / `escarbadientes:espadita`).
  La espadita se clava AL REVÉS (pedido del usuario): entra por el pomo, el MANGO queda adentro y la HOJA afuera (corta). La
  guarda en cruz es el TOPE: sólo entra el mango (`variants[].maxDepth`, ver `maxDepthOf`; vale también para Ctrl + rueda y al
  cargar archivos; los archivos viejos con espadita se reconstruyen dados vuelta).
- Palito de la selva (`palito-selva`, platito a la izquierda del chizito), según las fotos del usuario: caramelo
  CILÍNDRICO, MITAD ROSA / MITAD BLANCO con la división RECTA a lo largo (sin hélice; acostado: rosa abajo, blanco
  arriba), puntas cortadas con borde redondeado. En el platito vienen envueltos y ordenados (`params.wrapped` sólo
  para los del platito): papel ajustado en tubito, rosado claro con una franja amarilla de borde rojo (en lugar del
  logo) y una libélula, y las PUNTAS verde selva: cuello retorcido pasado el caramelo y de ahí un abanico chato y
  triangular con el borde arrugado. Al agarrarlo (`PieceDefinition.wrapper`,
  `SelvaWrapper.setProgress`): primero se destuercen las puntas (0 → 0,4), después el papel se desenrolla desde el
  borde suelto (0,4 → 1), y se cae planeando y desvaneciéndose. Se clava SIN papel por una punta, hasta la mitad.
  DATO CURIOSO (`PieceDefinition.curiosity`, `ui/datosCuriosos.ts`, `Overlay.fact`): al terminar de desenrollarse, el
  papel se "da vuelta" hacia la pantalla: un cartel HTML (papel rosado con franja amarilla y puntas verdes) sale
  volando desde donde quedó el papel 3D, queda de frente 3,2 s + 0,05 s por letra (≈ 6–7 s) y se va; no bloquea
  el mouse. 18 datos de animales en bolsa barajada (no se repite ninguno hasta salir los 18). Prueba:
  `node scripts/datos-test.mjs <dir>`.
- Chupetín (`chupetin`, vasito a la derecha), según la foto: bola brillante TRANSLÚCIDA de color al azar (frutilla,
  naranja, limón, uva, manzana, chicle y COLA: casi negro, a contraluz marrón translúcido; `attenuationColor`) en palito
  blanco. En el vasito viene envuelto (`ChupetinWrapper`): film transparente con LÍNEAS BLANCAS CURVAS PARALELAS (no
  se cruzan) sobre la bola, ceñido al palito abajo y ARRIBA un cuello retorcido (el nudo) que se abre en un abanico
  blanco con rayas rojas, azules y verdes. Al agarrarlo se abre DESDE ARRIBA: se desata el nudo y el film se abre
  como una flor de la cima hacia abajo, y se cae; en la mano y clavado va pelado, sin líneas. Se clava por la punta del palito. El palito ATRAVIESA, la bola NO (es sólida, con masa: no se superpone con
  el chizito): el tope es cuando la bola toca la superficie (`chupetinStopDepth`: elipsoide de la bola contra el plano
  tangente, según semilla e inclinación; perpendicular ≈ 53 mm de 55; antes era el 70 % = 38,5 mm; `PieceDefinition.depthStop`
  se suma a `maxDepth`; el cargador recorta con la cota perpendicular). Sin marca.
  BOLA SÓLIDA PARA TODAS LAS PIEZAS (`interaction/solidBall.ts`): ninguna pieza puede entrar en el volumen de la bola
  de un chupetín colocado: al apuntar (mouse/flechas), hundir (mantener, Ctrl + rueda), girar (Q/E) o editar una pieza
  ya colocada, el cambio se bloquea (queda donde estaba) con un destello rojo en la bola y el aviso "el chupetín es
  sólido: por ahí no entra". Es simétrico: al clavar un chupetín, su bola tampoco puede entrar en otras piezas (salvo
  la pieza donde se clava, que la maneja `depthStop`). Excepción: el palito del propio chupetín (su bola no cuenta contra
  sí mismo). Sacar nunca se bloquea. Prueba exacta triángulo-esfera con 0,2 mm de tolerancia. Límites conocidos: el
  chizito/aceituna que se ensarta (`mount`) y el ketchup no se miden; el cargador no revisa choques de archivos viejos.
  Prueba: `node scripts/solidball-test.mjs`.
- La ayuda en la mano sale de `PieceDefinition.holdHint`.
- SECCIONES PARA PELEAR (`render/ZoneGuides.ts`): línea punteada sobre el chizito (cabeza / brazos / piernas, izquierda /
  derecha) con carteles de la tecla de cada sección (Q W brazos, A S piernas, cabeza sin botón); se ve con una pieza en la mano
  o con el cartel abierto. Va aparte de la construcción (copia el giro del pivote): no se agarra ni entra al archivo.
  CARTEL "ELEGÍ LOS INGREDIENTES" (`ui/InfoCard.ts`): sale al llegar a la mesa; explica las secciones, escudos, aceituna y que el
  KETCHUP ES PARA DIBUJARLE LA CARA, y la tabla "CUÁNTO SACA CADA GOLPE" (de `FIGHT.pieceDmg`). Se cierra con el botón o al
  agarrar la primera pieza; I lo abre y cierra. Al agarrar palito/escarbadientes, la ayuda dice que con una aceituna en la punta
  pega más fuerte pero más lento.
- Chizito extra (DESCARTADO por el usuario como pieza suelta: no hay bowl ni se va a agregar; el mecanismo `mountsOnTail` queda porque lo usa la aceituna): se ensarta en la cola libre de un palito/escarbadientes
  (`tailMount`). En la mano: clic en el palito → el chizito se presenta sobre la punta (HOLDING con `active.mount`);
  pasar el mouse muestra el anillo; clic en el chizito = punto de entrada → AIMING (mouse = ángulo, invertido porque se
  mueve el chizito), mantener / Ctrl + rueda = ensartar, Esc vuelve a la presentación. Matemática: la cola del palito es
  una "punta virtual" (`tailFrame`, calculada de la malla) clavada en el chizito con el mismo `Aim`, en el marco del
  chizito; pose del chizito = cola · inversa(punta). `PieceData.mount = 'tail'` (entryPoint/direction en coordenadas de
  la propia pieza). Profundidad máx. = lo que queda del palito afuera − 3 mm. El chizito nuevo se puede atravesar: la
  torre sigue (chizito + palito + chizito + palito…). Prueba: `node scripts/mount-test.mjs <dir>`.
- Ketchup (estado DRAWING): clic en el platito de sobrecitos (desde cualquier estado; lo que hubiera en la mano se
  suelta o se devuelve) → el sobrecito sigue al cursor con el pico hacia la pieza. Mantener apretado pinta un cordón
  rojo brillante SOLO sobre piezas (la mesa no). Cada trazo es un nodo `ketchup` hijo de la pieza pintada (frame
  'free': geometría en coordenadas del padre; puntos/normales en `params`), así deshacer/rehacer/guardar lo reproducen;
  si el cursor pasa a otra pieza, empieza otro trazo. Los trazos (`userData.stroke`) no se atraviesan ni se pinta
  encima, pero se BORRAN: clic en un trazo lo elige (no se hunde ni se mueve) y Supr lo borra; con el sobrecito,
  Shift + mantener es una goma (un solo deshacer por pasada). Esc o clic en el platito deja el sobrecito; clic en
  otro recipiente agarra esa pieza.
- Editar: clic en una pieza colocada → SELECTED_PLACED_PIECE (resaltado cálido sutil): mantener = hundir,
  Shift + mantener = sacar (si sale del todo vuelve a la mano y lo que tenía clavado se va con ella),
  Supr/Backspace = quitar, Esc = soltar.
- Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y): deshacer / rehacer. R dos veces (en 2,5 s) reinicia; también se deshace.
  H oculta ayudas. El chizito ARRANCA PARADO (eje largo X local hacia arriba) y DE FRENTE A LA CÁMARA (`CONFIG.creature.homeRotation`:
  como la cámara mira 24° hacia abajo, se echa atrás ese mismo ángulo, calculado de la cámara; sin eso se lo veía en picado).
  Lado de cara del CONSTRUCTOR (`BUILDER_FACE`, fijo): el costado +Z del chizito raíz, el que mira a la cámara parado.
  F devuelve el chizito suave (0,7 s, leve rebote, `TrackballRotator.goHome`) a esa posición inicial y marca ese lado
  (aro + punto que late 2,6 s). El constructor y su cámara NO dependen del frente de combate.
  FRENTE DE COMBATE (`Construction.front/up`): dato POR CRIATURA, ±X o ±Y del chizito raíz; por defecto frente −Y
  con "arriba" +X (`DEFAULT_COMBAT_FRONT/UP`, pedido del intérprete). Lo elige la "vista de combate" del intérprete
  (rama `claude/creature-interpreter`); el constructor no lo cambia: lo conserva (también en deshacer), lo guarda en
  `creature.front` y el cargador lo RESPETA sin reescribirlo (`readCombatFront`: ±X y ±Y se aceptan tal cual, el
  "arriba" del archivo si es un eje perpendicular, si no +X para ±Y y +Y para ±X; el +Z viejo o la falta de dato
  valen el de fábrica; otra cosa, el de fábrica con aviso).
  Prueba: `node scripts/combat-front-test.mjs`. Ctrl+S descarga la criatura (.json); Ctrl+O o arrastrar un .json la carga
  (se deshace con Ctrl+Z). Al abrir (o recargar) SIEMPRE arranca un chizito nuevo con forma al azar (`?seed=N` la fija;
  `?capture` usa la 3). La última criatura se autoguarda en el navegador y sólo vuelve con `?recuperar`.
  R R también da un chizito de otra forma.
  Topes (`src/creature/limits.ts`, archivo COMPARTIDO con el intérprete, idéntico en las dos ramas y sin imports):
  `MAX_PIECES = 40` piezas clavadas (el ketchup no cuenta; con 40 no deja agarrar más) y `MAX_STROKES = 30` trazos
  de ketchup (el 31 no arranca, con aviso; el cargador descarta los de más con aviso).

## Intro
- Al abrir: plano general de la habitación (`CameraRig.startIntro`, lente de 26 mm desde (−0,08; 0,64; 1,22), deriva
  lenta) con guirnaldas, globos, torta con velitas y serpentinas (`render/Party.ts`, animado; dentro de `farProps`) y
  el título "CUMPLEAÑITO" (sin S y sin subtítulo; `ui/Title.ts` + CSS `#title` en index.html) con confeti y "tocá
  para empezar". Clic o tecla → el título salta y se va, la cámara viaja en curva (3,2 s, ease in-out) hasta la pose de
  juego, recién ahí se habilita el juego (`interaction.enabled`), el chizito salta y se muestra el frente.
- Estética del título en exploración (el usuario está en proceso creativo: "arcade pero no 8 bits"): tres estilos
  comparables con `?titulo=arcade` (Bungee, caramelo con borde blanco y relieve; por defecto) | `globo` (Baloo 2
  inflado y brillante) | `neon` (neón pastel). `?sinintro` la saltea; en `?capture` sólo con `&intro`
  (`__chizito.startGame()` la dispara). Capturas: `node scripts/intro-shots.mjs <dir>`.

## Feedback (fase 3)
- Al primer contacto: micro-sacudida del chizito (resorte amortiguado, ~3 mm, `fx/Shake.ts`) + "crack" + 2 migas.
  Los resortes se integran en subpasos de 1/240 s: con el dt de un cuadro lento (< ~24 fps) divergían y el chizito
  "desaparecía" al clavar el primer palito.
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
  `ui/` ayudas y ángulo. `persistence/` archivo de criatura (`CreatureFile.ts`: formato, validación) y
  guardar/cargar/autoguardar (`Persistence.ts`).
- `interaction/attach.ts`: modos de conexión ('pierce', 'tail', 'paint') y `poseFromData`: la pose de cada pieza se
  deriva de punto de clavado + dirección + profundidad + giro (la misma cuenta que `Aim.pose`). `tailFrame` también vive acá.

## Deploy
- GitHub Pages desde `main` (`.github/workflows/deploy.yml`, igual al de `main`). `vite.config.ts`: `base` = `/chizito/`
  sólo en el build; en `npm run dev` queda `/`. Los archivos opcionales se piden con `import.meta.env.BASE_URL`.
- OJO al mergear: esta rama NO comparte historia con `main` (se reconstruyó desde el zip del usuario); un merge
  común falla por "unrelated histories". Hay que decidir cómo integrarla (p. ej. reemplazar `main` por esta rama, o
  `--allow-unrelated-histories` resolviendo conflictos) antes de hacerlo.

## Contrato con el intérprete de combate (rama `claude/creature-interpreter`)
- **AVISAR ANTES** de cambiar el formato `CreatureFileV1` (campos, semántica, versión) o la orientación inicial del
  chizito en el constructor (`CONFIG.creature.homeRotation`, `BUILDER_FACE`): los fixtures y los tests de carga del
  intérprete dependen de que se mantengan estables. Cambios de geometría de piezas (medidas, marco 'tip') también se
  avisan, porque mueven las poses reconstruidas.
- `PieceDefinition.structure` describe cada pieza para el intérprete (vara/bulto/placa, masa aprox. en gramos, masa
  en la punta). Hoy: palito de la selva = vara blanda 2,3 g; chupetín = vara rígida 7,6 g con maza de 7,3 g en la
  punta libre (bola).

## Archivo de criatura (Fase 4)
- `{ format: "hombrecito-de-chizito/criatura", version: 1, units: "m", creature: { name, savedAt, pieceCount,
  root: { type, seed }, front: { direction, up } }, pieces: [ { id, type, parentId, seed, attach: { mode, entryPoint,
  direction, depth, spin }, params? } ] }`, piezas en orden padre → hijo. NO guarda matrices ni posiciones sueltas.
- `creature.front` = frente de COMBATE (±X o ±Y del chizito raíz, por defecto `[0,-1,0]`, `up` `[1,0,0]`), parte
  del `Snapshot` (deshacer) junto con la semilla de la raíz. Se respeta al cargar. Versión del formato: sigue en 1
  (los archivos con el +Z anterior se leen como el de fábrica).
- Al cargar: se valida todo (formato, versión, tipos, padres, conexión posible según canPierce/canBePierced/tailMount,
  profundidad ≤ maxDepth, tope de 40); lo inválido se descarta con aviso. Versiones nuevas: migraciones en `fromCreatureFile`.

## Fases
1. Escena realista + chizito procedural + rotación con inercia. ← hecha
2. Bowl, agarrar palito, punto de entrada, ángulo, clavar/sacar, atravesar. ← hecha
   Prueba automatizada: `node scripts/play-test.mjs <dir>` (con `npm run dev` corriendo).
3. Feedback (sacudida, migas, sonido), papitas, edición, undo/redo. ← hecha
   Prueba automatizada: `node scripts/phase3-test.mjs <dir>`. Piezas nuevas: `node scripts/pieces-test.mjs <dir>`.
   Ketchup / vasitos / sacudida a 20 fps: `node scripts/ketchup-test.mjs <dir>`.
   Correcciones (borrar ketchup, nacho, bowls, recarga, aceituna en palito): `node scripts/fixes-test.mjs <dir>`.
   Golosinas (palito de la selva que se desenvuelve, chupetín): `node scripts/golosinas-test.mjs <dir>`.
4. Guardado/carga JSON versionado, frente, tope de 40. ← hecha (prueba: `node scripts/phase4-test.mjs <dir>`). Requisitos del usuario (las construcciones son CRIATURAS para jugar):
   - Cada criatura tiene un "frente" explícito: el FRENTE DE COMBATE, ±X (por defecto +X), elegido en la vista de
     combate del intérprete, guardado en el marco local del chizito raíz y respetado por el cargador.
   - El JSON guarda, por pieza, el punto de clavado, la dirección y la jerarquía (parentId): la pose se
     RECONSTRUYE desde esos datos (entryPoint, direction, depth, spin, mount, params). Nada de guardar sólo
     posiciones/matrices sueltas (`localMatrix` es un derivado, no la fuente de verdad).
   - Tope: 40 piezas por criatura.
Al terminar cada fase: capturas con Playwright, autocrítica de realismo, commit, y esperar aprobación.

## Intérprete de criaturas (herramienta de desarrollo, `?dev`)
- Lee la criatura viva y calcula extremidades, masa, apoyos, locomoción, acciones ofensivas y perfil 2D con cajas de golpe. Vive entero
  en `src/creature/` (no toca el constructor); contrato y campos: `docs/CREATURE_CONTRACT.md`; estado y pendientes: `docs/creature/ESTADO.md`.
- Activación: `?dev` en la URL (antes `?creature`; el jugador nunca ve el panel). Es UN bloque al final de `src/main.ts` que importa
  `src/creature/install.ts` bajo demanda; sin el flag no se carga. Monta el panel "ESTRUCTURA DETECTADA" (se actualiza al clavar, sacar, deshacer y rehacer;
  resalta las extremidades en 3D; selector de criaturas de prueba A–E y vegetal; selector de frente). `window.__creature` es el panel.
- Capas: archivo `CreatureFileV1` → resolver (`resolve/`, único código con three.js) → `CreatureSnapshot` (JSON puro) → `interpret()`.
- Un solo archivo de umbrales (`src/creature/config.ts`) y uno de topes (`src/creature/limits.ts`: `MAX_PIECES` 40, `MAX_STROKES` 30;
  `src/config.ts` importa `MAX_PIECES` de ahí). Orientación de combate: arriba +X, frente −Y por defecto, giro de 180° = +Y.
- Pruebas: `node scripts/creature-test.mjs` (módulos puros), `creature-resolve-test.mjs`, y con `npm run dev` corriendo:
  `creature-fixtures-test.mjs`, `creature-ui-test.mjs`, `creature-ui-keys-test.mjs`. Fixtures: `node scripts/make-fixtures.mjs`.

## Pelea (Chizito Fight) — `src/creature/fight/`
- PLAN DE MEJORA: `docs/PLAN_PREMIUM.md` (diagnóstico medido, sistema de combate v2 y tareas T1–T8, G1–G7, O1). Leerlo antes de
  tocar la pelea.
- MISMO RECORRIDO PARA LOS DOS BRAZOS (`FIGHT.sweep` / `sweepHeavy` / `windupCap`): con la guardia de 3/4 el hombro de adelante
  tiraba un jab corto y el de atrás un golpe largo, con el mismo daño; ahora el de adelante se carga más atrás hasta completar el
  mismo arco. Medir con `node scripts/fight-probe.mjs A B veg` (usa el frente real del juego; los fixtures viejos tienen el
  frente −Y y NO muestran el problema).
- CONTACTO BARRIDO: el golpe se mide sobre el camino de cada punto en el paso (`segSegD`), no sólo donde quedó; el paso que cruza
  el final del arco también cuenta. Antes un golpe rápido atravesaba al rival.
- PESO TOTAL: `heavyLoad` = todo lo clavado (menos las piernas que cargan) / cuerpo − 0,6; dos chupetines pesan el doble que uno.
  El tope de carga del chupetín sube con ese peso (`swing.loadCharge`).
- Botón PELEAR abajo a la derecha (siempre, sin flag). Misma mesa, misma criatura real (sus mallas): la cámara pasa a una
  vista lateral que sigue el medio de los dos y se aleja/acerca para encuadrarlos. La criatura del jugador es TU CHIZITO.
  RIVALES, uno por nivel (`rivalFighter` / `rivalView`; `?nivel=2|3` arranca contra ése): 1 EL BROCOLOCO; 2 HUEVO DURO
  (pelado y gelatinoso: rebota más al recibir, brazos LARGOS de espárrago con yema, patas de tallo, recibe ×1,25); 3 MONSTRUO
  DE QUINOA (miles de granos en InstancedMesh, brazos pesados, recibe ×0,7 y se REARMA: tras 1,5 s sin recibir recupera 1,6
  de vida por segundo; los granos sueltos de los puños ('aura') NO giran solos: son la munición de su poder, se juntan al
  cargar, desaparecen al tirarlos y vuelven a armarse). Al pasar de nivel (`restart`) se REARMA el modelo 3D del rival
  (`viewLevel`; antes seguía dibujado el brócoli) y se lo presenta con su intro. Espárragos (`asparagus`): tallo afinado con
  fibras y escamitas en espiral, yema = torno esculpido en escamas en ladrillo con borde en V (`shingle`); pata con el corte claro. Los dos nuevos están hechos POR PARTES en
  `rivals3d.ts` (cuerpo, cara con piezas limpias apoyadas con `onShell`, extremidades clavadas), según los bocetos elegidos
  (`docs/arte/bocetos/huevo-b.png`, `quinoa-a.png`); NO se pasó una foto a 3D (eso le desarmó la cara al brócoli).
  Cada rival tiene nombre, cartel y frases propias (`RIVALS` en mount.ts; sonidos `huevo-frase1/2/3`, `quinoa-frase1/2/3`).
  Laboratorio: `lab/brocoli.html?rival=huevo|quinoa`.
- PERFIL Y FRENTE: el frente de la pelea es la CARA que marca la F en el constructor (`BUILDER_FACE`, +Z del chizito; arriba =
  eje largo +X). Se enfrentan con la cara hacia el rival, girados `stanceYaw` (0,7 rad ≈ 40°) hacia la cámara: 3/4 claro, como el
  arte clave, para que se vean las caras (con 0,45 se veían casi de perfil). Al cambiar de lado se dan vuelta con un giro 3D
  real (no espejo): una cara dibujada de costado queda del otro lado. En el motor: `fwd`/`fwdAxis`/`gaitAxis` proyectan el 3D.
- REGLA DEL USUARIO: cada vara clavada en el chizito (palito, escarbadientes, palito de la selva) es un BRAZO o una PIERNA
  rígida con la articulación en su punto de clavado, SOBRE EL PERÍMETRO del chizito, esté donde esté ("un brazo fuera de lugar
  igual se mueve como brazo y golpea"). SECCIONES (`src/creature/zones.ts`, compartidas con el constructor): según DÓNDE se
  clava a lo largo del eje largo: PIERNAS = el pedazo de abajo (25 % del largo, `legBelow`), CABEZA = arriba (`headAbove`: no es
  brazo, lo que tenga pesa y protege, sin botón), BRAZOS = el medio. Izquierda/derecha como se arma (de frente): izquierda =
  +Y del chizito raíz. Todas las
  piernas apoyan: la postura de cada una sale de una IK que la estira hasta el piso común (`stance`, tope `stanceMax`), y con 2+
  piernas se acomodan contra la inclinación (`legPlant`): la criatura se para SOBRE sus piernas.
  FIJAS (sin articulación): toda vara que ATRAVIESA el chizito (girarla lo rompería) y el CHUPETÍN. El chupetín corre el centro
  de gravedad hacia su lado y pega con el CUERPO ENTERO (`FIGHT.swing`: se echa atrás visiblemente, carga con tope `maxCharge`
  para que llegue a salir —antes tardaba casi 1 s y cualquier golpe se la cortaba—, y se tira adelante con envión; pega mientras
  gira rápido; es lo que más pega; CARGA LARGA: hasta 14 + 30 cuadros); el balanceo gira a velocidad pareja (`swing.turnSpeed`)
  y si llega al final SIN TOCAR, EN EL MISMO CUADRO sigue de largo: VUELTA ENTERA de 360° HACIA EL LADO QUE GIRABA, con la
  velocidad que traía y frenando parejo (es el mismo movimiento, no otro; `f.whirl` × `f.whirlDir`, `whirlV/whirlA`; el render persigue el ángulo por el camino corto con `chase` para no desenrollarla) quedando expuesto. Una vara fija ABAJO (chupetín apuntando al piso)
  es una PIERNA FIJA (`pegs`): apoya y patea con el cuerpo entero, si tiene otra pierna para pararse (contrapeso). Lo que asoma
  < 1 cm no es extremidad: es peso.
  Papitas/nachos en el cuerpo = escudos (papita 2 golpes, nacho 6) que se astillan con cada golpe y al romperse se deshacen en
  migas (no caen enteros).
  No se usa la física del análisis (calidad de ancla, rangos, arco de 140°): el panel `?dev` sigue con su análisis, aparte.
- Capas: `fighter.ts` (snapshot → modelo: pivotes, puntos de masa por pieza, rol, tipo de golpe; brócoli), `engine.ts` (motor
  PURO y determinista a 60 Hz), `ai.ts`, `tuning.ts` (TODOS los números), `quat.ts`; con three.js: `render.ts` (criatura real y
  brócoli, destello y vibración al recibir), `brocoli.ts`, `stage.ts`, `hud.ts` (HUD HTML), `mount.ts` (bucle, cámara, luz,
  efectos, sonidos, teclado), `install.ts`.
- Física: cuerpo 2D (x, y, inclinación) + articulaciones 3D con motor PD de torque limitado por la inercia de cada extremidad
  (lo pesado arranca y vuelve más lento); frenar usa más torque que arrancar (el golpe se corta). Contrapeso: el cuerpo se inclina
  hacia donde está el peso y recibe la reacción de cada giro. Pesos: tabla de la realidad del chat de mecánicas (`FIGHT.massGrams`).
- CARGA: lo pesado se carga antes de pegar (`FIGHT.charge`: cuadros = k · (masa extremidad / masa chizito − free), con temblor);
  un golpe recibido durante la carga la corta. La aceituna pega más fuerte pero bastante más lenta.
- DAÑO POR PIEZA (`FIGHT.pieceDmg`, orden del usuario): chupetín > aceituna > palito de la selva > palito > espadita >
  escarbadientes; cada extremidad pega con su pieza más fuerte (palito + aceituna = aceituna); piernas × `legMul` (1,15).
  DAÑO POR RECORRIDO (`dmgTravel` 0,4–1): rad recorridos desde la carga / `dmgArc` (1,4); lo fijo, giro del torso desde que
  soltó / `dmgTwist` (0,6). Apoyar el brazo o pegar pegado al rival saca menos; el chupetín pega entero a ~10 cm, no encima.
  Con el mismo recorrido el orden de piezas se respeta. La masa efectiva (I/r²) queda para el empujón.
- GOLPE CON LÓGICA FÍSICA: al cargar el peso va atrás y al soltar adelante (`bodyWind`/`bodyThrow`; una patada al revés), y el
  envión (`lunge`) sale al SOLTAR, no al cargar. ACERTAR: el brazo frena contra el otro y rebota, y el que pega pierde el envión
  (`impactBack`). PIFIAR: el brazo sigue de largo más allá del objetivo (`follow`, más si pesa) y el cuerpo se va con él.
- Un golpe por vez. ERRAR cuesta: cartel "¡PIFIÓ!" en cada yerro; el freno queda flojo (sigue de largo), el giro que traía pasa
  al cuerpo (lo inclina y lo arrastra) y no puede golpear ni cubrirse por `base + k · masaExtremidad/masaChizito` cuadros; además
  no vuelve a pegar hasta ESTABILIZARSE (`stableW`). Si se inclina de más, se tambalea (sólo el sonido: las palabras
  "trastabilla" y "se está estabilizando" NO aparecen nunca en pantalla, pedido del usuario). Acertar cuesta poco (`hitLock`).
- Golpes que se leen (T2): carga mínima 9, `joint.strike` 30 y `strikeMinFrames` 6 (el golpe no avanza más de arco/6 por
  cuadro): del botón al impacto 13–16 cuadros con un palito. ALCANCE PAREJO: el hombro de atrás gira el torso `twist.armBack`
  (1,5) y el de adelante `twist.arm` (−0,2): los dos llegan a 3 mm uno del otro (`twist.min` −0,9). El chupetín gira alrededor
  de la cara de frente (no de la guardia de 3/4), sin el tope de la guardia. `strikeGap` 16. (Hubo una barra de AIRE/estamina: el usuario la
  descartó, "no se entiende y no sirve"; no volver a ponerla.) APORREAR NO GANA (`FIGHT.repeat`): pegar sin pausa (cada golpe
  arranca antes de 75 cuadros del anterior, con el botón que sea) marca un RITMO: cada golpe seguido pega menos (×0,75, 0,5, piso
  0,35; `limb.worn`) y la IA lo lee: se anticipa con la guardia, pegarle a la guardia traba al que pega (`blockedLock`) y la IA
  castiga esa ventana y contraataca (suelta la guardia para castigar). Encadenar después de acertar no suma al ritmo pero
  tampoco lo borra (antes golpe + UNO-DOS + golpe pegaba siempre entero). Medido en `docs/creature/BALANCE.md`.
- ENTRADAS v2 (T3, `FightInput.quadHeld` = cuadrante mantenido): tocar Q/W = RÁPIDO (×0,6, carga corta); mantener = CARGADO
  (×1 → ×1,6 a los 30 cuadros, tiembla; carga completa rompe la guardia; lo pesado no tiene rápido). ↓+Q/W = GANCHO (levanta,
  en el aire 3 golpes ×1/0,8/0,6, después invulnerable hasta caer). ↓+A/S = BARRIDA (derriba 40 cuadros, invulnerable; al
  levantarse 10 más). Doble toque de flecha = PASITO (3 cm en 10 cuadros; atrás, 6 invulnerables). D apretada ≤ 6 cuadros antes
  del impacto = ATAJADA (sin daño, el otro abierto 24, +25 de poder). GUARDIA ROTA: 4 bloqueos en 3 s, carga completa o chupetín
  → 40 cuadros sin guardia. Cadenas: 100/90/80/70 % (piso 50); CONTRA ×1,35. Sonidos `atajada`, `guardia-rota`, `barrida`,
  `pasito` (sin archivo suenan como bloqueo/escudo/golpe-pesado/drop).
- DESPROPORCIÓN (`heavyLoad` = extremidad más pesada / cuerpo − 0,6): si lo clavado pesa más que el chizito, camina y salta
  menos, pifiar lo traba más y la vuelta dura más; aviso al empezar la pelea.
- PODERES (`POWERS` en tuning.ts, lógica de cada comida; barra de PODER que se llena pegando, recibiendo y sola; se guarda entre
  rounds; E para el jugador, la IA los usa cuando conviene): TU CHIZITO NUBE DE QUESO (marea si está cerca; la guardia lo evita),
  BROCOLOCO VAPORAZO (vapor de la copa: quema y empuja de cerca), HUEVO HUEVAZO RODANTE (se hace bola y rueda: se salta o se
  bloquea; `f.roll` sólo se dibuja y termina en vuelta entera), QUINOA METRALLA DE GRANOS (proyectiles `m.shots` en abanico con
  gravedad; queda con menos coraza `armorLoss` hasta rearmarse). Todo se carga visiblemente (`wind`) antes de actuar.
- PODER v2 (T4, `FIGHT.powerUse`): la barra casi no se llena sola (`passive` 0,3). REMATE = E justo después de acertar con media
  barra (cancela la vuelta, poder corto: carga ×0,35, daño ×0,6; E en el congelamiento se recuerda, `pwBuf`). ESCAPE = E
  aturdido o bloqueando con media barra (estallido que separa, `escape`). SÚPER = barra llena. El súper de TU CHIZITO sale de sus
  BRAZOS (`superOf`): nada pesado → NUBE (zona `m.zones` 2 s, 2/s y el rival pega ×0,7), chupetín → TROMPO (3 vueltas, 3
  golpes), aceituna → CAROZAZO (proyectil recto que marea), escarbadientes → ACUPUNTURA (5 pinchazos), 2+ escudos → MURALLA
  (3 s sin retroceder ni aturdirse). Sonidos `poder-nube/trompo/carozo/acupuntura/muralla`, `escape`.
- ATAQUES HECHOS A MANO (T5, `moves.ts`): un ataque es DATO (ventanas de golpe, claves de pose en [hacia el rival, arriba,
  afuera], impulsos, guardia 'block'|'break'|'low', alcance, aviso, pesos por distancia). Claves por lado (`armR`) o por posición
  (`armF` adelante / `armB` atrás). El motor (`stepMove`/`movePose`/`moveHit`) pone las poses sin PD y pega si la punta (o el
  cuerpo) toca: lo que se ve es lo que pega. Con `FighterModel.moves`, la IA usa `rivalDecide` (decide cada `think` cuadros por
  distancia y vida, castiga trabas, se cubre si el otro ya carga). EL BROCOLOCO: zanahoriazo, doble, cabezazo (rompe guardia,
  30 cuadros de aviso sacudiendo la copa), pisotón (salta, rompe guardia) + VAPORAZO (poder).
- HUEVO DURO (T6): brazos de LÁTIGO (`whipify` en rivals3d: geometría horneada en el marco del brazo + shader que dobla en
  L/3 y 2L/3; `render.ts` mueve los ángulos con un resorte sobre la velocidad de giro del brazo, tope 25° por tramo, y una
  ondulación en reposo). Ataques: PINCHAZO largo (alcance 8,5 cm, 14 de aviso) y LÁTIGO bajo ('low': hay que saltarlo; derriba).
  Rebota con golpes cargados (`FIGHT.bounce`). FASE 2 (vida < 40): se ve la grieta y la yema, recibe ×1,3 y ataca 20 % más rápido.
- MONSTRUO DE QUINOA (T8, `model.absorb`, `FIGHT.grains`): sin regeneración mágica. Lo RÁPIDO (poder < 1,05) se hunde (40 %,
  sin aturdir, el brazo trabado); lo CARGADO o pesado la REVIENTA: daño entero y un MONTONCITO (`m.piles`, n = daño) que vuelve si
  la quinoa lo pisa o a los 8 s (+0,2 de vida por grano); un golpe al ras lo desparrama. Se achica con la vida (`count` de los
  granos del cuerpo, mezclados). Granos sueltos en mount (`looseGrains`, hasta 600): saltan, quedan en la tabla y vuelven
  volando. Ataques: PUÑO CAÑÓN, MAZAZO doble (rompe guardia, 34 de aviso), DERRUMBE (invulnerable 30, se rearma 6 cm más allá)
  + METRALLA. En guardia lleva los puños adelante de la cara (arriba parecían orejas).
- CUERPOS BLANDOS: el HUEVO es gelatina (`jelly`): vibra al recibir (`Jiggle` en render.ts) y los golpes seguidos pegan cada vez
  menos (`JELLY`); la QUINOA se abolla apenas. `soak()` aplica coraza + gelatina a todo daño.
- GRAVEDAD: enderezarse necesita APOYO (en el aire no hay torque que lo endereza: antes flotaba como colgado de un cable) y el
  equilibrio está amortiguado (`balanceZeta` 0,8); la guardia "respira" sólo mientras se pelea. APOYADO PIVOTA sobre lo que toca
  la mesa (`contactPoint`): al inclinarse o girar, ese punto no se desliza (se corrige `f.x`); antes giraba alrededor de su
  centro y los pies patinaban.
- GUARDIA FÍSICA: los brazos se cruzan delante del cuerpo (uno en diagonal arriba, otro abajo) y sólo bloquea si el golpe TOCA
  un brazo; lo que pasa por fuera pega. Sin brazos no hay guardia. CON ESCUDOS, la guardia PRESENTA el escudo (`shieldPose`):
  en la cabeza se inclina adelante, en la espalda se da vuelta, abajo se pone cabeza abajo; sin escudos vuelven los brazos.
- PIERNAS Y PESO: cada pierna carga gramos según su pieza (`legCarryGrams`); si la criatura pesa más, camina lento; si las piernas
  cargan menos del 60 % de la masa, o no hay piernas, NO SALTA. Sin piernas se arrastra. Cada pieza de pierna tiene FUERZA y
  RAPIDEZ (`legKind`): palito de la selva lento pero fuerte, escarbadientes rápido pero débil, palito medio. Salto =
  `jumpSpeed · √(fuerza total / gramos / jumpRef)` (más piernas suman fuerza, el peso la reparte); antes de despegar se agacha
  (`squat`, más con piernas lentas). La marcha se multiplica por la rapidez promedio.
- COMBINACIONES (`FIGHT.chain`, sólo después de ACERTAR, dentro de 26 cuadros; la siguiente sale sin carga y sin pagar el
  castigo): UNO-DOS (Z Z con otro brazo, 2+ brazos), RÁFAGA (otra piña mientras haya brazos sin usar, 3+ brazos; empuja más),
  PIÑA Y PATADA (Z X, 2+ piernas), CONTRA (C para bloquear y Z enseguida). Lo fijo (chupetín) no encadena. Pifiar corta la
  cadena. Lo apretado durante el congelamiento del impacto queda guardado (antes se perdía). EL BROCOLOCO encadena desde el
  nivel 2. El HUD muestra el nombre en grande.
- Tipos: liviano (palito), corte (escarbadientes: sangra), pesado (aceituna, bola del chupetín: llena el mareo → aturde), escudo.
- Golpe: carga → golpe → vuelta, siguiendo el ángulo a lo largo del eje del golpe (un brazo hacia atrás pasa por arriba, mazazo).
  El eje sale de girar la dirección de reposo hacia el rival, en 3D (sirve para varas que apuntan a la cámara).
- EFECTOS DE GOLPE: congelamiento (`hitstop`), destello blanco leve y vibración del que recibe (`Hurt` en `render.ts`), estallido,
  anillo, migas (`fx/Crumbs.ts`: 12 formas redondeadas distintas con manchas tostadas, muchas chicas y pocas grandes) y astillas.
- SHOW (G3–G6): efectos en `fight/fx.ts` (humo, destello, chispas, onda, confeti en 2 `Points`, tope 300) y luz de impacto
  (la vela, 3 cuadros); cámara: acercamiento en golpes de 10+, corte de 0,6 s al súper, giro de 20° en el KO; el público (restos
  sobre la tabla, `FightSet.cheer`) salta; confeti al ganador; barra de poder partida en dos. Capturas de la pelea:
  `node scripts/fight-shot.mjs <png> [nivel] [cuadros]` (con `npm run dev`; ~4 min por captura con el WebGL por software).
- TEXTOS: sin "NIVEL N" junto al nombre del rival, sin "¡MAREADO!", sin etiquetas en los golpes (sólo el número de daño); las
  palabras de historieta sólo en combinaciones o golpes de 10+, como mucho una cada 3 s. Estelas SOBRIAS (finas, cortas, tenues,
  sólo mientras pega). Presentación: el cartel del rival queda 2,4 s (tiempos `P_CHIZ0` 8,6, `P_VS` 12, `P_END` 13).
- SONIDOS: ids listos para que el usuario grabe los suyos (`public/assets/sounds/<id>.ogg|mp3|wav`; si no hay archivo, suena
  un sintetizado de verdad: golpe con cuerpo + crujido, campana, bronces, voces con formantes, vapor; con compresor): `golpe`, `golpe-pesado`, `bloqueo`, `zumbido` (golpe pesado que arranca), `pifio`, `escudo` (se rompe),
  `ko`, `round`, `pelea`, `combo` (sale una combinación), `japish` (el grito ¡JAPISH!, en golpes fuertes y combinaciones),
  `poder-carga`, `poder-queso`, `poder-vapor`, `poder-rodada`, `poder-metralla`,
  `risa` (presentación del brócoli), `pimba` (¡PIMBA!, patada que entra), `soplamoco` (¡SOPLAMOCO!, piña a la cara: el 38 % de
  arriba del cuerpo del que recibe), más los del constructor (`pick`, `drop`, `crack`, `crunch`, `out`). Los yerros alternan
  ¡PIFIÓ! y ¡PIF!. PALABRAS DE HISTORIETA: quietas 1,4 s, dentro de la pantalla y debajo de las barras (no se van volando), como
  mucho una cada 75 cuadros. MÚSICA: `musica-pelea` en loop si está el archivo; si no, una base sintetizada (`AudioManager.musicOn`).
- CLARIDAD: cada golpe deja una ESTELA (la punta de la extremidad, dorada el chizito, verde el brócoli; tenue mientras carga). Si
  una tecla no puede hacer nada, un cartelito dice por qué (no hay brazo/pierna de ese lado, atontado, poder al N %). La
  guía de teclas no desaparece: a los 7 s queda chica y transparente. Al terminar un round se cortan los golpes en curso.
- Formato: al mejor de 3 rounds, 90 s, vida 100, empate exacto = ronda extra. CONTROLES = un botón por CUADRANTE del chizito
  (mano izquierda, como se ve al armarlo): Q brazos izquierdos, W brazos derechos, A piernas izquierdas, S piernas derechas;
  cada toque usa la SIGUIENTE extremidad de ese cuadrante (de a una, cada cuadrante lleva su cuenta: mil escarbadientes de un
  lado y una aceituna del otro = un botón los usa de a uno, el otro carga sólo la pesada). D guardia (mantener). Flechas:
  ← → moverse, ↑ saltar (un brazo en el aire = en picada), ↓ agacharse. Esc pausa. Atajos: Z/X/C (o J/K/L) = cualquier brazo,
  cualquier pierna, guardia. El HUD muestra el chizito dividido con la tecla y cuántas extremidades hay en cada cuadrante.
  Mira siempre al rival.
- APAGÓN + PRESENTACIÓN (se saltea con cualquier tecla; en `?capture` sólo con `&presentacion`; capturas:
  `node scripts/present-shots.mjs <dir>`). Al apretar PELEAR las luces de la fiesta titilan y se cortan (capa `#cf-black`,
  sonido `apagon`) y la arena se arma a oscuras. Después (11,6 s, barras de cine, cortes secos, movimiento suave adentro):
  0–5,6 s EL BROCOLOCO a la luz de una VELA (`FightSet.candle`, una PointLight que va siempre en la arena para no recompilar;
  las luces del show en 0 con `FightSet.lights`): primero su BOCA sonriendo muy cerca, paneo lento; habla con SUBTÍTULOS
  (`hud.sub`; frases en `LINES` de mount.ts con sonidos `brocoloco-frase1/2/3`); sube despacio a los ojos. 5,6 s: se encienden
  los focos de golpe, ruge (`rugido`, `¡A LA MESA, BOCADITO!`) y después su nombre. 7,2–10,6 s TU CHIZITO responde (se
  despierta en contrapicado, piñas a la lente, pose de héroe). 10,6–11,6 s VS. La música entra con los focos.
- PELEAR pide una CARA: sin ningún trazo de ketchup avisa "¡Usá el ketchup para dibujarle un rostro!" y NO entra nunca (obligatorio;
  el diseño es libre).
- KO: el que cae se desploma (medio segundo) y rueda hasta su reposo físico (`restTilt`: el primer pozo de altura del centro
  de masa), con las extremidades aflojadas pegadas al cuerpo. Nada queda apuntalado en el aire.
- EL BROCOLOCO se para como un peleador (`FighterModel.stance`: guardia de boxeador, respira, se mece con el paso). La IA se
  acomoda con pasos decididos (no toques de un cuadro, que la hacían temblar como una marioneta).
- PASO: al caminar, la pierna que avanza se levanta (gira hacia afuera, `FIGHT.gaitLift`) y el cuerpo queda sobre la otra.
- CHUPETÍN: pesa más que el chizito (5 g contra 3,3) y lo inclina hacia su lado; pega girando el torso entero (`twist.swing`),
  el que más pega (`pieceDmg`); si pifia, da la vuelta entera hacia el lado del golpe (`whirl`).
- CUERPO ENTERO: el torso gira con el golpe (`FIGHT.twist`: el hombro va atrás al cargar y adelante al soltar; física y dibujo
  con el mismo giro, `f.yaw`) y las piernas apoyadas ponen el pie bajo el centro de masa (`FIGHT.support`; mucho más mientras
  otra patea: se para sobre ésa).
- Escenario (`stage.ts`), con el arte clave `docs/arte/arte-clave-pelea.jpg` como norte: la misma mesa de NOCHE, el cuarto en penumbra
  que se ADIVINA (G1: entorno ×0,16, fondo ×0,11; foco principal BLANCO neutro, tabla desaturada a madera en el shader,
  zanahorias corridas a naranja; antes ×0,06, sólo lucecitas y velas como bokeh, sombras apenas frías con `look.lift`). Arena = tabla de picar grande
  (50 × 32 cm, corrida hacia atrás para que el foco caiga sobre madera; `public/assets/fight/tabla.jpg`, se precarga con
  `preloadFightSet`; `GROUND` = 1,2 cm: el piso del motor está ahí). Foco CENITAL apenas detrás (sombras hacia adelante, sobre la
  madera) con su haz visible (columna aditiva + 260 motas de polvo), FOCOS DE CARA que siguen a cada luchador y se cambian de lado
  al darse vuelta (sin sombra, baratos), contorno frío, AO, más contraste y viñeta. Se esconden los
  recipientes y su sombra de grupo. Calidad adaptativa: AO → DoF → resolución. RESTOS DE FIESTA (`render/PartyProps.ts`, los
  mismos en el constructor, al fondo de la mesa): caramelos masticables envueltos (`public/assets/fight/sugus.jpg`, genérico,
  sin marca), carozos de aceituna comidos y servilletas usadas hechas un bollo con ketchup, en capas detrás y delante de los
  luchadores (sobre el borde de la tabla), desenfocados por la profundidad.
- CARGA SIN ESPERA: mientras se arma, en ratos libres (`requestIdleCallback`), un ENSAYO invisible deja la pelea lista: modelos
  del brócoli, foto de la tabla, la arena armada (`getArena`, queda guardada entre peleas) y los shaders de toda la escena
  compilados con la luz de la pelea (`prewarmFight`: `renderer.compile` con los focos en una escena aparte y apuntando al
  buffer del posprocesado, que cambia la variante del shader). Medido: abrir la pelea pasa de ~1 s a ~0,1 s y no compila
  ningún shader nuevo (antes 28). Al abrir la web, cargador animado con CSS (sigue andando aunque el JS esté ocupado); la
  utilería repetida de los bowls se genera una vez por forma (`AssetRegistry`, caché de 'prop').
- Brócoli (`brocoli.ts`): modelos 3D hechos en Higgsfield (imagen Nano Banana → SAM 3D): `public/assets/models/brocoli-cuerpo.glb`
  (cara hacia −Z, se gira) y `zanahoria.glb` (una zanahoria real por extremidad); arte en `docs/arte/`. Del GLB se usa SOLO LA
  COPA (un plano recorta todo lo que está debajo de `CROWN_CUT`; `syncCrownClip` lo lleva al mundo cada cuadro): su tallo es
  angosto y trae restos de cara deformes que, mezclados con la cara pegada, daban "muchos ojos". El tallo es propio
  (`stalk`, radio del boceto, se abre arriba hacia las ramas) y la cara del boceto va sobre él (`addFace`, superficie exacta
  con `onStalk`): dos rodajas de remolacha SEPARADAS con pupila y brillo, una tira de morrón por ceja en V sobre su ojo y una
  sonrisa malvada en media luna con dientes blancos arriba y abajo. Zanahorias CLAVADAS: la punta queda adentro del tallo y
  asoma la parte gruesa. Laboratorio rápido (sólo el brócoli, sin posprocesado): `lab/brocoli.html` con `npm run dev`. EL BROCOLOCO tiene su propio giro hacia la cámara (`FIGHT.broccoli.yaw` ≈ 60°, más de frente que
  la criatura): PRIORIDAD del usuario, su cara se tiene que entender fácil. Si faltan los GLB, queda el procedural entero.
- OJO: `Hurt` clona los materiales para el destello; `clone()` NO copia `onBeforeCompile`: se pasa a mano (si no, se pierden
  la zanahoria naranja y el látigo del huevo).
- Render: la parte de la vara que queda adentro del chizito se recorta con un plano por extremidad (`clippingPlanes`), así al girar
  no asoma. El squash de la criatura se integra en subpasos (a < 24 fps divergía: era el bug del zoom que crecía y parpadeaba).
- PELEA CONTRA UN AMIGO (O1, `fight/net.ts` + bloque "Sala contra un amigo" de mount.ts): botón INVITAR A UN AMIGO → sala con link
  `?sala=<código>`; el que abre el link es el invitado. Cada uno arma su chizito y aprieta PELEAR (queda fijo, no se edita más);
  cuando están los dos, se mandan el archivo de la criatura (para dibujarla: `buildOther` arma una segunda `Construction`) y el
  `FighterModel` ya calculado y pasado por JSON (los dos simulan con los mismos números). Sincronía por pasos (`Lockstep`): por la
  red sólo viajan las entradas, con 3 cuadros de retardo; un cuadro se simula cuando están las dos (si no, espera). Cada 60 cuadros
  comparan una huella (`hashMatch`); si difiere, el que invitó manda su estado entero (`packMatch`, conserva los Float64Array)
  y el invitado lo pisa y rehace los pasos que ya simuló (`Lockstep.since`, guarda 10 s); `e` en las huellas = reenvíos. Si el
  otro no manda su entrada por medio segundo: subtítulo "Esperando a tu amigo…". `vs.me` = qué luchador soy (0 el que invitó): HUD, ayudas y
  carteles usan `me()`. Sin presentación, sin niveles, sin pausa (Esc abre un menú; la pelea sigue). Revancha = pelea `gen + 1`
  en los dos lados. Salir cierra la sala. Red: WebRTC con PeerJS y su servidor público de presentación; `?sala=local-x` (+
  `&anfitrion` en una de las dos) usa BroadcastChannel entre dos pestañas del mismo navegador, sin internet (para probar).
  Pruebas: lockstep puro en `creature-fight-test.mjs`; de punta a punta `node scripts/versus-test.mjs <dir>` (~7 min por software; 6 de 6 OK). OJO: si se instala un paquete con el server prendido, reiniciarlo con `npx vite --force` (queda sirviendo dependencias viejas y la página no arranca).
- JUGABLE PRIMERO (pedido del usuario, 2026-11-19): palito 11–13 cuadros al impacto, aceituna ~24, chupetín ~27; daño por
  recorrido con piso 0,75; brazo con aceituna = golpe pesado siempre. Los DOS hombros giran igual (atrás al cargar, adelante al
  soltar; `twist.armWind/armFwd` para el de adelante). El chupetín hace un gesto corto (`swing.gesture`) para que se vea con cuál
  pega; la vuelta al pifiar es UN movimiento (`whirl.end`: afloja apenas, sin frenar). KO: el cuerpo pierde la estructura, cae
  ACOSTADO (±90°) y cada extremidad se afloja sobre la tabla (`limp`, `joint.limp`), todos los luchadores.
- PODER v4 (2026-11-20, pedido del usuario): sin ESCAPE. Barra en dos mitades para TU CHIZITO: media = OLOR A PATA (marea, zona
  de 4 s, sonido `poder-olor`; también como remate justo después de acertar); llena = CALESITA DEL DOLOR (el ex trompo: 3 vueltas,
  3 golpes de 7; sonido `poder-trompo`). Los poderes según lo armado (nube, carozazo, acupuntura, muralla) quedaron sin uso.
  RIVALES (2026-11-21), DOS poderes cada uno con la lógica de su comida (`power2` media barra / `power` llena; el VAPORAZO se
  sacó: "no tiene sentido"): EL BROCOLOCO arbolitos (ramitos de la copa en arco) / gas de brócoli (nube que marea 1 s); HUEVO
  rodada / cáscaras (abanico de cáscaras); QUINOA metralla / avalancha (ola de granos al ras que barre las piernas: se salta).
  Sonidos `poder-arbolitos/gas/cascaras/avalancha`. La IA usa el chico con poca frecuencia (puede esperar el grande). El corte de cámara del súper es sólo para el poder lleno del jugador (con el
  vaporazo del rival era un zoom indeseado).
- MÚSICA POR VILLANO: `musica-brocoloco` / `musica-huevo` / `musica-quinoa` (en `public/assets/sounds/`), desde que se entra a la
  pelea (también con la presentación); si falta, `musica-pelea`; si falta, la base sintetizada. Contra un amigo: `musica-pelea`.
- HINCHADA: el bowl de chizitos (`hinchada`, pegado a la tabla atrás a la izquierda): cada chizito salta por su cuenta con los
  golpes fuertes y hacen LA OLA una vez por pelea (primer golpe fuerte de tu chizito). Sin caras ni sonido (`FightSet.wave`).
- CÁMARA: la lateral de siempre (el usuario: "la cámara está bien"); V pasa a AÉREA (38°, más lejos) y a PRIMERA PERSONA: la cámara
  ES tu chizito (en su cara de ketchup, mira y se mueve con su cuerpo, 20 mm, banda nítida amplia) y en ese modo los dos se
  enfrentan DE FRENTE (se les saca el 3/4 sólo al dibujar, `fpK`); en el KO vuelve la lateral. Los poderes NO
  hacen zoom (se sacó el corte de cámara).
- KO (v2): cae al piso con `koFall` (gravedad y caída × 3,5; con la cámara lenta parecía que flotaba). Los rivales ponen cara de
  noqueado (`face(..., dead)`: ojos en rendija, sin pupila ni brillo, boca floja).
- CARTELES: el número de daño sólo con 8+ o en cadenas; ¡PIFIÓ! sólo cuando pifia lo pesado.
- NUBE DE QUESO (media barra sin piezas pesadas) y OLOR A PATA: al soltarlos MAREAN al que está adentro (nube 60 cuadros, olor 70;
  la guardia no tapa la nariz). Antes la nube "no hacía nada".
- CHUPETÍN (2026-11-20): al pifiar, la VUELTA es todo el castigo (`whirl.after` 0): ni un cuadro quieto después; golpe y vuelta
  son el mismo movimiento y sólo frena si pega.
- PIÑAS DE TU CHIZITO = GANCHO de afuera hacia adentro con los dos brazos (`startStrike`, `hook`: gira alrededor de la vertical,
  apenas inclinado hacia el rival); los rivales con `moves` no cambian. DE CERCA PEGA: rápido ×0,85, aporreo −20 % por golpe (piso
  45 %), recorrido mínimo 90 %.
- KO = CADÁVER: el cuerpo cae sobre la tabla y NINGUNA extremidad lo apuntala (`settle`/`contactPoint` ignoran las extremidades
  noqueadas). Cada extremidad va DERECHO a su pose floja final, calculada una vez con el cuerpo ya acostado (`koSettle`): no gira
  ni se acomoda en el piso.
- PIFIAR = UN movimiento: el golpe apunta desde el principio más allá del objetivo (`follow`) y el pifio se decide al pasar el
  punto de impacto (antes frenaba en el final del arco y volvía a arrancar).
- OLOR A PATA: deja quieto y mareado 2,2 s (también al entrar a la nube, una vez por nube).
- HINCHADA: chizitos PARADOS en el bowl (`fillCrowd`), sueltos (antes se fusionaban con `bakeStatic` y nunca saltaban).
- Huevo: sin dibujo de fase 2 (la grieta oscura eran las "pestañas"). Brócoli: dos filas de dientes; la de abajo baja con la
  mandíbula (`userData.ty`). CENSURAR también calla la música.
- CHUPETÍN: la IA no corta su carga (antes la cortaba siempre: "no puedo golpear con el chupetín"); se aleja para que pifie. Al
  pifiar: vuelta entera limpia (sin bamboleo, `whirl.wobble` 0) y expuesto `whirl.after` (40) cuadros más. `swing.poiseHits`
  (aguantar un golpe cargando) quedó en 0: con 1, el doble chupetín ganaba todo.
- QUINOA jugable sin chupetín: lo rápido saca 75 % (antes 40 %), traba 4 cuadros, cada grano devuelve 0,08; recibe × 0,9.
- VOLVER A ARMAR: la próxima pelea arranca contra el primer rival (antes seguía en el nivel en el que se salió).
- Huevo: sin el grano de arroz en los ojos (se leía amarillo); grieta y yema de la fase 2 abajo, en la panza.
- BALANCE (medido, `docs/creature/BALANCE.md`): el sangrado no sale de golpes gastados por aporrear (`bleed.minWorn`); frente a una
  carga LENTA el rival no se cubre: la corta con su ataque más rápido (`AI_LEVELS.cut`) o da un paso atrás para que pifie y
  castiga; al salir del aturdimiento decide enseguida. Los granos de la quinoa saltan hacia el que pegó (`grains.spill`): quedan
  entre los dos. Probado y descartado: chupetín que aguanta toques sin cortarse (invencible en niveles 2 y 3).
- Balance: `node scripts/make-archetypes.mjs` (arquetipos con el frente real en `src/creature/fixtures/arq/`) y
  `node scripts/fight-matrix.mjs [semillas]` (≈ 2 min) → pegar la salida en `docs/creature/BALANCE.md`.
- Pruebas: `node scripts/creature-fight-test.mjs` (puras: modelo, apoyo, contrapeso, caminar, golpes, peso, guardia, escudos,
  carga, chupetín, rounds, tiempo, determinismo, rendimiento) y con `npm run dev`: `node scripts/fight-ui-test.mjs [dir] [criatura]`
  (navegador, teclado real, capturas con HUD). Balance: `node scripts/fight-balance.mjs <criatura>`.
- HUD v2 (2026-11-20): RETRATOS (foto de la cara de cada uno con la cámara y el posprocesado de la pelea, al empezar el round 1,
  `portraits` en mount.ts) y RELOJ con dígito que cae (en los últimos 10 s, golpea). Al entrar cada round el FOCO BARRE la tabla
  (`arena.sweep`: haz y polvo cuelgan de un soporte en la lámpara). En el KO las LUCECITAS se apagan de un soplido en barrida
  (`Bulbs.blow`) y vuelven titilando en el round siguiente. Contra un amigo, si falta la entrada del otro medio segundo: "Esperando
  a tu amigo…". Capas de música por combo: NO (con una canción entera en mp3 no hay pistas que sumar; haría falta tenerla en stems).
  ABERRACIÓN CROMÁTICA de impacto (`Stage.aberration`, en 0 no hace nada; en la pelea golpe pesado o poder = 1 y se apaga en ~0,3 s).
- HUD v3 (2026-11-20): vida con segmentos (dorada tu chizito, verde el rival), PODER azul eléctrico → magenta llena, etiqueta en
  Bungee con contorno (antes blanco sobre amarillo no se leía). Sin tira de teclas: botón CONTROLES abajo al centro = pausa con la
  lista (queda el mapita del chizito). Botón CENSURAR (abajo a la derecha, ícono de parlante tachado; se recuerda en el navegador):
  la voz de los villanos (`*-frase*`, `risa`, `rugido`) suena como el pitido de la tele y sus subtítulos salen `#@$%&*!`.
  Retratos: encuadran la CARA (ojos/boca de los rivales; los trazos de ketchup de tu chizito). Rival con cara de ASCO al oler el
  olor a pata (`face(…, sick)`); la boca de los rivales se estira poco y los dientes nunca (`mouthStretch`: en el huevo, estirados,
  parecían pestañas despegadas).
- MÚSICA: fundido cruzado de 2,2 s al cambiar de canción; `musica-huevo.mp3` ya está.
- Ketchup del constructor: PLATITO PLAYO (`makePlate`) con dos sobres acostados, cada uno apoyado en lo de abajo.

