# Plan premium — CUMPLEAÑITO / Chizito Fight

Escrito el 2026-11-14 sobre la rama `claude/sharp-einstein-iuyqgn` (parte de `claude/wonderful-noether-lvp9gc`, commit 5c8e6f9).
Es el documento que dirige el trabajo: cada tarea de la sección 5 está pensada para que la tome OTRA sesión de Claude sin
contexto previo. Leer primero `CLAUDE.md` y después este archivo entero (por lo menos las secciones 1 a 4 y la tarea asignada).

---

## 1. Diagnóstico (medido, no opinado)

Herramienta nueva: `node scripts/fight-probe.mjs A B veg criatura-20261011-1623` mide, con el frente real del juego, el brazo
izquierdo (Q) y el derecho (W): arco, cuadros hasta pegar, daño.

### 1.1 Jugabilidad
| # | Problema | Evidencia | Estado |
|---|---|---|---|
| J1 | Brazo izquierdo y derecho no pegaban igual | Criatura simétrica `A`: izquierdo 3,25 rad de recorrido, derecho 2,07 rad (un jab), los dos 6,8 de daño. Causa: la guardia de 3/4 (`stanceYaw` 0,7) deja un hombro adelante y el arco salía de "dónde está el brazo → dónde está el rival" | **Arreglado** (`FIGHT.sweep`): ahora 3,2 vs 2,9 rad y 10 vs 9 cuadros |
| J2 | Golpes que atravesaban al rival sin tocarlo | El contacto se medía sólo donde QUEDABA cada punto; un palito recorre > 2 cm por cuadro. Además el último cuadro del arco no contaba | **Arreglado** (contacto barrido, `segSegD`) |
| J3 | Dos chupetines pesaban lo mismo que uno | `heavyLoad` usaba sólo la pieza más pesada | **Arreglado**: cuenta todo lo clavado menos las piernas que cargan; el tope de carga del chupetín sube con el peso (`swing.loadCharge`) |
| J4 | Los golpes son un "flash" | Del botón al impacto: 8–10 cuadros (0,15 s). La fase de golpe dura **3 cuadros** (57 rad/s). No se lee anticipación ni peso; no hay tiempo de reaccionar ni de ver la animación | Pendiente → T2 |
| J5 | El daño no depende de cómo se pega | Daño fijo por pieza ± 10 %. Un contacto a 0,16 m/s (apoyar el brazo) saca el 90 % | Pendiente → T2 |
| J6 | Un solo ataque por extremidad | No hay golpe rápido / fuerte, ni gancho, ni barrida, ni dash, ni atajada justa, ni derribo. Las 4 "combinaciones" salen solas apretando otra vez después de acertar: no hay decisión ni habilidad | Pendiente → T3 |
| J7 | El poder no tiene sentido táctico | Una barra, un botón, se llena sola. NUBE DE QUESO marea si el rival está cerca: no se conecta con lo que armaste ni con un combo | Pendiente → T4 |
| J8 | Los rivales son copias del chizito | Mismo motor de brazos rígidos con otra malla. La IA tira una moneda por cuadro (`aggression` 0,035–0,065): sin patrones, sin ataques con aviso | Pendiente → T5–T8 |
| J9 | La quinoa se comporta como un cuerpo sólido | `armorMul` 0,7 + regeneración. Los granos son decoración | Pendiente → T8 |
| J10 | Las 177 pruebas no prueban el juego real | Todos los fixtures tienen el frente viejo (−Y): ahí los dos brazos caen del mismo lado. Ningún fixture puro tiene chupetín ni escudos | Pendiente → T1 |
| J11 | Balance del peso sin instrumento | No hay forma de medir "doble chupetín vs cuatro palitos" contra cada rival | Pendiente → T1 |

### 1.2 Visual
Comparar siempre contra `docs/arte/arte-clave-pelea.jpg` (el norte).
| # | Problema | Causa en el código |
|---|---|---|
| V1 | La pelea es un vacío negro con una tabla roja | `stage.ts`: entorno × 0,06 y fondo × 0,05; la foto `tabla.jpg` bajo luz cálida satura a rojo; no hay luz de relleno ni fondo legible (en el arte clave se ven lucecitas, torta con velas, servilletas) |
| V2 | Efectos de golpe "de Flash" | `mount.ts` 129–210: anillos planos (`RingGeometry`), esferitas, humo = icosaedros blancos sin textura. Sin partículas blandas, sin luz propia |
| V3 | Brazos del huevo malos | Espárragos de 5,8 cm rígidos girando desde el hombro con el motor PD (limpiaparabrisas). Sin codo, sin retardo, sin ataques propios |
| V4 | Materiales chatos de cerca | El chizito en la pelea ocupa media pantalla y su normal map está pensado para el constructor; falta polvo de queso, micro-relieve, borde de luz |
| V5 | Zanahorias rojas | Luz principal cálida × albedo naranja |
| V6 | Constructor plástico | Saturación 0,32 + cian puro; halos blancos del DoF alrededor de los envoltorios; mantel sin relieve |
| V7 | Poco show | Sin público, sin cámara dramática en los golpes fuertes, sin cierre de round, HUD correcto pero genérico |

---

## 2. Qué se hizo en esta sesión
- **Cámara del constructor**: el chizito se ve de frente. La cámara sigue alta (24°, se necesita para ver la mesa); el chizito
  se presenta inclinado ese mismo ángulo (`CONFIG.creature.homeRotation`, calculado de la cámara: si se mueve la cámara, sigue).
- **Motor** (`engine.ts`, `tuning.ts`): J1, J2 y J3 de la tabla. `repeat` pasó a 0,25 / 0,35 para que aporrear siga sin ganar
  ahora que los golpes ya no se pierden.
- `scripts/fight-probe.mjs` (sonda de golpes) y este plan. Pruebas: `node scripts/creature-fight-test.mjs` → 177 OK.

---

## 3. Pilares de diseño (deciden toda duda)
1. **Lo que armás es cómo peleás.** Cada pieza da un GOLPE distinto, no sólo un número. Dos criaturas distintas se juegan distinto.
2. **Todo se lee.** Ningún golpe sale en menos de 8 cuadros; lo fuerte avisa. Si el jugador pierde, tiene que saber por qué.
3. **El peso es poder y es costo, siempre visible.** Más gramos = más daño y empuje, y también: camina más lento, salta menos,
   carga más, pifiar cuesta más y el cuerpo se va con el golpe. Regla: ninguna pieza es gratis.
4. **Cada rival es un personaje.** Ataques propios hechos a mano, con aviso, patrón y punto débil. No comparten el motor de
   brazos del chizito.
5. **Show.** La pelea es el espectáculo de la fiesta: luz, público, cámara, sonido. Mismo mundo que el constructor.
6. **Fluidez primero.** 60 fps en una notebook; toda mejora visual entra con su nivel de degradación (`FightSet.degrade`).

No volver a poner (descartado por Franco): barra de AIRE/estamina, plato dorado, "NIVEL N", "¡MAREADO!", etiquetas en los golpes,
"SE ESTÁ ESTABILIZANDO", sugus y bowl de chizitos en el constructor. Nada de colores pastel.

---

## 4. Sistema de combate v2 (especificación)

### 4.1 Tiempos (60 cuadros por segundo). Todo en `tuning.ts`
| Golpe | Anticipación | Activo | Recuperación | Daño | Nota |
|---|---|---|---|---|---|
| Toque rápido (palito, escarbadientes) | 8–10 | 4 | 12 | 60 % de la pieza | encadena |
| Golpe cargado (mantener ≥ 12 y soltar) | 12–30 (lo que se mantuvo) | 5 | 20 | 100 → 160 % según carga | carga completa rompe la guardia |
| Pesado (aceituna, selva) | mínimo 18 | 5 | 24 | 100 % | no tiene toque rápido |
| Chupetín (cuerpo entero) | 44–62 según peso total | 6 | 30; si pifia, vuelta entera | 100 % | rompe guardia siempre |
| Patada | 12 | 4 | 18 | × 1,15 | |

- La fase de golpe hoy dura 3 cuadros: bajar `joint.strike.wn` (54 → ~30) y acotar la velocidad angular para que dure 5–6.
- **Daño por recorrido**: daño × clamp(arco recorrido / arco planeado, 0,4, 1). Un contacto sin recorrido no es un golpe.
  Reemplaza al `speedMul` de ± 10 %.

### 4.2 Entradas nuevas (se mantienen Q W A S, D, E y flechas)
| Entrada | Acción |
|---|---|
| Toque de Q/W | golpe rápido |
| Mantener Q/W y soltar | golpe cargado (el brazo tiembla y brilla al llegar al tope) |
| ↓ + Q/W | GANCHO: levanta al rival (permite seguirlo en el aire, hasta 3 golpes con daño 100/80/60 %) |
| ↓ + A/S | BARRIDA: derriba (estado `down` 40 cuadros; se levanta invulnerable 10) |
| → → / ← ← | PASITO (3 cm en 10 cuadros; hacia atrás, los 6 primeros no reciben golpes) |
| D justo antes del impacto (≤ 6 cuadros) | ATAJADA: sin daño, el que pegó queda abierto 24 cuadros, + 25 de poder |
| 4 golpes bloqueados en 3 s | GUARDIA ROTA: brazos abiertos 40 cuadros. Sin barra nueva: los brazos tiemblan cada vez más |

### 4.3 Combos (rutas con decisión, no automáticas)
`rápido → rápido (otro brazo) → cargado o patada → remate con poder`. Cada golpe de la cadena pega 100 / 90 / 80 / 70 %
(piso 50 %). La ventana para seguir es la recuperación del golpe anterior (se cancela), sólo si ACERTÓ. Lo fijo (chupetín) no
encadena, pero sí puede ser el cierre después de un gancho. El HUD ya muestra el contador y el nombre.

### 4.4 Cada pieza, su golpe
| Pieza | Rápido | Cargado | Rasgo |
|---|---|---|---|
| Palito | jab | estocada (avanza 1 cm) | parejo |
| Escarbadientes | pinchazo (el más rápido) | — | sangra |
| Espadita | tajo | tajo largo | sangra, más alcance |
| Palito de la selva | — | garrotazo | el que más empuja |
| Aceituna en la punta | — | mazazo | aturde |
| Chupetín | — | revoleo de cuerpo entero | rompe guardia; pifiar = vuelta entera |
| Papita / nacho | — | D + → : escudazo (empuja, 2 de daño) | escudo |

### 4.5 Poder v2 (misma barra, tres usos)
| Uso | Costo | Qué hace |
|---|---|---|
| REMATE: E justo después de acertar | 50 % | cancela la recuperación y suelta una versión corta del poder: extiende el combo |
| ESCAPE: E mientras te están pegando | 50 % | estallido de polvo de queso que separa a los dos |
| SÚPER: E con la barra llena | 100 % | corte de cámara de 0,6 s + el poder completo |

La barra deja de llenarse sola (`power.passive` → 0,3): se gana pegando, atajando y arriesgando.
El súper de TU CHIZITO sale de lo que armaste (la pieza de más daño que tenga):
- sin nada pesado → **NUBE DE QUESO**: nube que QUEDA 2 s en el lugar (zona: 2 de daño por segundo y el rival pifia más).
- chupetín → **TROMPO**: la vuelta entera pero a propósito, 3 impactos.
- aceituna → **CAROZAZO**: dispara el carozo (proyectil recto, aturde).
- escarbadientes / espadita → **ACUPUNTURA**: 5 pinchazos seguidos.
- 2 + escudos → **MURALLA**: 3 s sin retroceder ni recibir aturdimiento.

### 4.6 Rivales: ataques hechos a mano
Nuevo módulo `src/creature/fight/moves.ts`: un ataque es DATO.
```ts
interface Move {
  id: string; startup: number; active: number; recovery: number;
  /** Cajas de golpe por cuadro activo: cápsulas en el marco local del rival. */
  hit: { a: V3; b: V3; r: number }[]; dmg: number; kb: number; stun: number;
  guard: 'block' | 'break' | 'low';        // se bloquea, rompe la guardia, o hay que saltarla
  /** Pose de cada extremidad en 3–5 claves (el render interpola con curva; el motor no usa el PD para esto). */
  keys: { t: number; limbs: Record<string, Q>; body?: { dx?: number; dy?: number; tilt?: number } }[];
  tell?: { sound: string; flash?: string };  // aviso
}
```
El motor ejecuta el ataque (cuadros, cajas, daño) y el render usa las mismas claves: lo que se ve es lo que pega.
La IA de cada rival pasa a ser una máquina de estados con pesos por distancia y por vida (fases), no una moneda por cuadro.

**EL BROCOLOCO (nivel 1, enseña a bloquear y castigar)**
| Ataque | Aviso | Respuesta correcta |
|---|---|---|
| Zanahoriazo (jab) | 10 cuadros | bloquear |
| Doble zanahoria | 12 + segundo golpe a los 14 | bloquear los dos y castigar |
| CABEZAZO DE COPA | se agacha y sacude la copa 30 cuadros; rompe guardia | pasito atrás y castigar |
| Pisotón | salta | pasar por abajo |
| VAPORAZO (poder) | la copa humea 24 cuadros | alejarse |

**HUEVO DURO (nivel 2, enseña distancia)**. Brazos de espárrago como LÁTIGOS (ver T6).
| Ataque | Aviso | Respuesta |
|---|---|---|
| Pinchazo largo (alcance 7 cm) | el brazo se recoge 14 | atajada o pasito adentro |
| Látigo bajo (barrida) | el brazo va atrás y abajo 18 | saltar |
| Rebote: al recibir un golpe cargado sale rebotando y vuelve | — | no perseguir |
| HUEVAZO RODANTE (poder) | se hace bola 22 | saltar o bloquear |
| Fase 2 (vida < 40 %): la clara se raja y se ve la yema | — | recibe × 1,3 pero ataca 20 % más rápido |

**MONSTRUO DE QUINOA (nivel 3, enseña a elegir el golpe)**. Está hecho de granos y se comporta así:
- **ABSORBE**: un golpe rápido se hunde (40 % del daño, sin aturdir, tu brazo queda trabado 10 cuadros). Un golpe cargado o
  pesado lo REVIENTA: daño entero y saltan granos.
- **Los granos que saltan quedan en la tabla** en montoncitos. Si la quinoa camina sobre ellos (o pasan 6 s) los reabsorbe y
  recupera vida. El jugador puede patearlos fuera de la tabla. Reemplaza la regeneración mágica actual.
- **Se achica**: la cantidad de granos dibujados sigue a su vida (100 % → 45 %). Se ve cuánto le falta.
- Ataques: PUÑO CAÑÓN (el brazo se dispara como chorro de granos, recto, se bloquea), METRALLA (poder, en abanico),
  DERRUMBE (se desarma en un montón, es invulnerable 30 cuadros y se rearma 6 cm más allá: castigable al rearmarse),
  MAZAZO doble (rompe guardia, 34 de aviso).

### 4.7 Objetivos de balance (se miden con T1)
Con un bot que juega bien (bloquea lo que avisa, castiga): cada arquetipo gana 45–70 % al nivel 1, 30–55 % al 2, 15–40 % al 3.
Aporreando: ≤ 25 % al nivel 1 y ≤ 10 % al 2 y 3. Ningún arquetipo queda 15 puntos arriba del promedio.

---

## 5. Tareas
Reglas para toda sesión que tome una tarea:
- Rama propia de la sesión. No pushear a `main`. Sin PR salvo pedido. Commits con autor Franco Varsi, en español.
- Antes de commitear: `npx tsc --noEmit` y `node scripts/creature-fight-test.mjs` en verde. Si una prueba deja de valer por
  diseño, se actualiza la prueba y se dice en el commit.
- Todos los números van en `tuning.ts`. El motor (`engine.ts`) es puro, determinista y sin `Math.random` (condición del online).
- Capturas: build fijo + `vite preview` (ver `docs/creature/RESUMEN_NUEVA_CONVERSACION.md`). En la pelea avanzar con
  `__chizito.renderFrames(n)` (con `__fight.advance` la cámara no sigue). El 3D por software tarda minutos por captura.
- Informe final corto: hash, qué mirar, qué quedó sin probar.
- No cambiar `CreatureFileV1` ni la geometría de las piezas.

Orden: **T1 → T2 → T3 → T4** en serie (tocan `engine.ts`). **T5** después de T2. **T6, T7, T8** después de T5, de a una.
**G1…G7** tocan sólo render y pueden ir en paralelo con las T desde el primer día (una sesión por tarea). **O1** después de T4.

### T1 — Banco de pruebas real y matriz de balance (primero; mecánica)
**Hecha** (2026-11-15): ver `docs/creature/BALANCE.md`. El chupetín ahora gira alrededor de la cara de frente (simetría).
Por qué: J10 y J11. Sin esto, todo ajuste es a ojo.
1. `scripts/make-archetypes.mjs`: genera snapshots en `src/creature/fixtures/arq/` con `orientation = { front: [0,0,1], up: [1,0,0] }`
   (el frente real, ver `mount.ts` línea ~1123). Arquetipos, todos simétricos izquierda/derecha salvo el último:
   `boxeador` (2 palitos brazo + 2 pierna), `pinchudo` (4 escarbadientes brazo + 2 palitos pierna), `mazo` (2 palitos con
   aceituna + 2 piernas de selva), `chupetin1` (1 chupetín + 1 palito + 2 piernas), `chupetin2` (2 chupetines + 2 piernas),
   `tanque` (2 palitos + 2 nachos + 2 papitas + 2 piernas de selva), `desparejo` (chupetín de un lado, escarbadientes del otro).
   Base: tomar `A.snapshot.json` y cambiar tipos/agregar piezas como hace la prueba del chupetín
   (`creature-fight-test.mjs` líneas ~485–495).
2. `scripts/fight-matrix.mjs`: arquetipo × rival (1, 2, 3) × bot × 20 semillas → tabla de % de victorias, duración media y daño
   por golpe. Bots (funciones `(match) => FightInput`): `aporrea` (Q/W alternados), `ia` (`aiInput` nivel 3 de nuestro lado),
   `listo` (bloquea cuando el rival está en anticipación y a distancia, castiga cuando `foe.lock > 4`, usa el poder lleno).
3. Agregar a `creature-fight-test.mjs`: para `boxeador`, `mazo` y `chupetin2`, el brazo izquierdo y el derecho pegan con arco
   dentro de ± 15 % y cuadros dentro de ± 2 (usar la lógica de `fight-probe.mjs`).
Hecho cuando: la matriz corre en < 2 min, se pega su salida en `docs/creature/BALANCE.md`, pruebas en verde.

### T2 — Golpes que se leen y daño por recorrido
**Hecha** (2026-11-15). Balance fuera de objetivo explicado en `docs/creature/BALANCE.md` (es de la IA de los rivales: T5–T8).
Por qué: J4, J5. Especificación: 4.1.
1. `tuning.ts`: `joint.strike.wn` 54 → 30 y probar; agregar `strikeMinFrames: 5` (el objetivo guiado no avanza más de
   `arco / strikeMinFrames` por cuadro en `guided()`, `engine.ts` ~1022). `windMin` 7 → 9.
2. `applyHit` (`engine.ts` ~1375): reemplazar `clamp(speed / dmgSpeedRef, …speedMul)` por
   `clamp((s.phi − s.windup) / (s.target − s.windup), 0.4, 1)`. Para lo fijo (chupetín) usar el giro del torso recorrido desde
   que empezó el golpe sobre el giro total (`twist.swing · (1 + twist.wind)`).
3. Simetría de alcance: en `fight-probe`, `B` y `S4` muestran que el brazo izquierdo pifia a 4,5 cm donde el derecho pega (el
   hombro de atrás queda más lejos). Subir `twist.arm` sólo para el hombro de atrás hasta que el alcance de los dos lados quede
   dentro de 3 mm (medir la x máxima de la punta en el golpe).
4. Correr T1; reajustar `pieceDmg` sólo si un arquetipo sale del objetivo 4.7.
Hecho cuando: del botón al impacto ≥ 12 cuadros para un palito, la fase de golpe dura ≥ 5, izquierda/derecha dentro de
tolerancia, matriz dentro de objetivos o diferencias explicadas.

### T3 — Entradas nuevas: rápido / cargado, gancho, barrida, pasito, atajada, guardia rota
**Hecha** (2026-11-16). Todo en `FIGHT.hold/upper/dash/parry/guardBreak` y `chain.scale`; la IA carga y da pasitos desde el nivel 2.
Especificación: 4.2, 4.3, 4.4. Una sub-tarea por commit, cada una con su prueba pura:
1. **Rápido / cargado.** `FightInput.quad` pasa a ser estado mantenido + flanco de soltar (`quadHeld`, `quadUp`). En `mount.ts`
   (teclado, ~1040) mandar `keydown` / `keyup`. En el motor: al apretar arranca la anticipación; si se suelta antes de 12
   cuadros sale el rápido (60 %, arco × 0,6); si se mantiene, el brazo queda atrás temblando hasta `chargeMax` 30 y sale al soltar
   con 100 → 160 %. Las piezas pesadas no tienen rápido (tabla 4.4): sale siempre el cargado con su mínimo.
2. **Gancho y barrida.** `kind` nuevo en `startStrike`: `'upper'` (eje del golpe = de abajo hacia arriba; al acertar
   `b.vy = 0.55`, `b.juggle++`) y `'sweep'` (eje bajo; al acertar el rival pasa a `down`). Estado `down` en `FighterState`
   (cuadros, invulnerable al levantarse). Tope de 3 golpes en el aire con daño 100/80/60 %.
3. **Pasito.** Doble toque de flecha dentro de 12 cuadros (detectarlo en el motor con el historial de `input.x`, no en el teclado).
4. **Atajada y guardia rota.** `f.guardT` = cuadros desde que se apretó D. En `applyHit`, si `blocked && b.guardT <= 6` →
   atajada. Contador de bloqueos con ventana de 180 cuadros → guardia rota.
5. **Rutas de combo** (4.3): reemplazar `comboFor()` por la tabla de rutas y la escala de daño; cancelar la recuperación.
6. HUD: la guía de teclas y el menú de pausa (`hud.ts` ~149 y ~303) con las entradas nuevas. La IA usa pasito y cargado desde
   el nivel 2.
Hecho cuando: cada entrada tiene prueba, la matriz de T1 sigue en objetivos con un bot `listo` que use todo.

### T4 — Poder v2
**Hecha** (2026-11-16).
Especificación: 4.5. `stepPower` y `POWERS`. REMATE y ESCAPE primero (son los que le dan sentido a la barra); después los
súper por pieza, uno por commit, cada uno con su efecto (coordinar con G3). La nube de queso pasa a ser una zona
(`m.zones: { x, r, life, by }[]`) que el motor recorre cada cuadro.

### T5 — Sistema de ataques de rivales (`moves.ts`) + IA por estados
**Hecha** (2026-11-16). Contacto por puntas/cuerpo en vez de cápsulas sueltas (mismo resultado: pega lo que se ve).
Especificación: 4.6. Es la base de T6–T8.
1. `moves.ts` con el tipo `Move` y `stepMove(m, i)`: cuenta cuadros, activa cajas, llama a un `applyMoveHit` (extraer de
   `powerHit` lo común). Mientras un rival ejecuta un `Move`, sus extremidades NO pasan por `drive()`: el motor guarda
   `f.move = { id, t }` y el render calcula la pose de las claves (`RenderPose.qs`).
2. `ai.ts`: `aiInput` para rivales devuelve `{ move: id }` o movimiento. Máquina: `neutral → acercarse | esperar | ataque(id) →
   recuperar`, pesos por distancia (cerca / media / lejos) y por fase de vida, tiempo de reacción por nivel. Mantener la lectura
   del aporreo (`foe.repeat`).
3. Portar EL BROCOLOCO entero como prueba del sistema (tabla 4.6).
Hecho cuando: el brócoli no usa más `startStrike`, cada ataque tiene aviso visible y sonoro, prueba pura por ataque (pega dentro
de su ventana, se bloquea / no se bloquea según `guard`).

### T6 — HUEVO DURO: brazos de látigo y ataques propios
**Hecha** (2026-11-16). El látigo es un shader de flexión (no 3 grupos): mismo efecto, sin rehacer la malla.
1. Render (`rivals3d.ts` `asparagus`, `render.ts` `modelView`): partir cada espárrago en 3 tramos encadenados (grupos padre →
   hijo). Movimiento secundario sólo de dibujo: cada tramo gira un extra = resorte amortiguado de la velocidad angular del
   brazo (la punta llega tarde y se pasa), tope 25° por tramo para que la caja de golpe del motor siga valiendo.
2. Ataques de la tabla 4.6 con `moves.ts`. El pinchazo estira el brazo en línea (los tres tramos alineados); el látigo bajo
   lo arrastra por la tabla.
3. Fase 2: grieta en la clara (decal / segunda malla), yema visible, `armorMul` 1,3 y ataques × 0,8 de tiempo.
Hecho cuando: en `lab/brocoli.html?rival=huevo` los brazos se ven elásticos en reposo y en cada ataque.

### T7 — (reservada) Segundo pase del brócoli: cara que reacciona
**Hecha** (2026-11-16): en mount, para todos los rivales (aviso, recibe, gana).
`views[1].face()` ya existe: gesto por estado (aviso = cejas abajo + boca abierta, recibe = ojos cerrados, gana = risa).

### T8 — MONSTRUO DE QUINOA hecho de granos
**Hecha** (2026-11-16). Balance en `docs/creature/BALANCE.md`.
Especificación: 4.6. `rivals3d.ts` (`grains`, `ellipsoidPoints`, InstancedMesh) y motor.
1. Motor: `absorb` en `FighterModel` (rápido = 40 % y `a.lock += 10`; cargado / pesado = 100 %). Evento `grains { at, n }` con
   n ∝ daño. `m.piles: { x, n }[]`: se juntan al pasar por encima (`|f.x − pile.x| < 0.02` → vida + n · k) o a los 360
   cuadros. Un golpe del jugador que pase a menos de 1 cm del piso sobre un montón lo dispersa. Quitar `regen`.
2. Render: `mesh.count` del cuerpo = total · (0,45 + 0,55 · vida). Granos sueltos = un segundo InstancedMesh (hasta 600) con
   balística simple, rebote y reposo sobre la tabla; al reabsorberse vuelan hacia el cuerpo (interpolación a su centro).
3. Ataques con `moves.ts`: PUÑO CAÑÓN, DERRUMBE, MAZAZO doble, METRALLA.
4. Corregir "parece que tiene orejas" con los brazos arriba: en la pose de guardia los puños van adelante de la cara, no arriba.
Hecho cuando: se ve achicarse, los granos quedan en la tabla y vuelven, y la prueba pura cubre absorber / reventar / reabsorber.

### G1 — Luz y escenario de la pelea según el arte clave
**Hecha en parte** (2026-11-16): cuarto ×0,16/×0,11 (se adivina), luz principal blanca, contorno frío más fuerte, relleno cálido, tabla desaturada a madera, zanahorias naranjas. Falta: normal/roughness desde la foto y calcos de migas.
`stage.ts`. Referencia: `docs/arte/arte-clave-pelea.jpg` (capturar y comparar lado a lado en cada iteración).
1. Entorno × 0,06 → × 0,22 y fondo × 0,05 → × 0,18: el cuarto se tiene que ADIVINAR (lucecitas, torta con velas atrás a la
   derecha, gorrito, servilletas), desenfocado por el DoF.
2. Luz principal BLANCA neutra (5200 K, no cálida: arregla V5, las zanahorias rojas) + contraluz frío azulado detrás de cada
   luchador (borde de luz que los despega del fondo) + relleno cálido tenue desde las lucecitas.
3. Tabla: bajar saturación y valor de `tabla.jpg` en el material (color × `#8a6a55`), generar normal y roughness desde la foto
   (Sobel en un canvas al cargar), borde biselado y canto visible, migas y manchas como calcos.
4. Guirnalda de lucecitas arriba, fuera de foco (esferas emisivas instanciadas en catenaria; el bloom hace el resto), que laten
   apenas con la música.
Hecho cuando: una captura de la pelea al lado del arte clave comparte paleta, profundidad y dirección de luz; 60 fps.

### G2 — Materiales de cerca
**Ya estaba casi todo** (2026-11-16): chizito con sheen y polvo de queso en el mapa, palito clearcoat, aceituna 0,8, huevo con transmisión 0,1. Sin cambios.
`assets/procedural/chizito.ts`, `palito.ts`, piezas. Sólo para la pelea si cuesta (variante 'hero-fight').
- Chizito: `MeshPhysicalMaterial` con `sheen` (polvo), motas de queso naranja en el albedo, normal map a 2048 con dos escalas,
  roughness con variación. Palito: `clearcoat` 0,25, sal con brillo puntual estable. Aceituna: `clearcoat` 0,8. Huevo:
  `transmission` 0,15 + `thickness` (aspecto de clara cocida). Verificar con capturas a 22 cm.

### G3 — Efectos de golpe en 3D (reemplaza V2)
**Hecha** (2026-11-16): `fight/fx.ts` (humo procedural en atlas, destello en estrella, chispas, onda, confeti; 2 `Points`, tope 300) + luz de impacto (la PointLight de la vela, 3 cuadros). Falta: fundido por profundidad y aberración cromática.
`mount.ts` 129–210 → módulo nuevo `fight/fx.ts`.
- Textura de humo procedural (ruido en canvas de 128 px, 4 variantes) y partículas blandas (billboards con fundido por
  profundidad) para vapor, polvo de queso y polvo de impacto. Fuera los icosaedros blancos.
- Impacto: destello aditivo con textura de estrella irregular (2 cuadros) + onda sobre la tabla (calco que crece) + migas reales
  de la pieza que pegó (`fx/Crumbs.ts` ya existe) + una luz puntual de 3 cuadros en el punto de impacto.
- Estelas: cinta (tira de triángulos que sigue la punta, 8 muestras, afinada y aditiva) sólo en la fase de golpe.
- Golpe cargado y súper: aberración cromática y desenfoque radial de 80 ms (un `Effect` de postprocessing), cámara que se
  acerca 6 %.
Presupuesto: ≤ 300 partículas vivas; todo instanciado.

### G4 — Cámara de espectáculo
**Hecha** (2026-11-16): acercamiento en golpes de 10+, corte de 0,6 s inclinado 2° al súper, giro de 20° alrededor del que cae en el KO (ya había cámara lenta).
`mount.ts` `camera()` (~528). Acercamiento breve en golpes de 10 +, inclinación de 2° en el súper, corte de 0,6 s al lanzar un
súper (primer plano del que lo tira, fondo oscurecido), cámara lenta real en el KO con giro de 20° alrededor del que cae, y
vuelta suave. Nunca perder de cuadro a ninguno de los dos.

### G5 — Show: público y ceremonia
**Hecha en parte** (2026-11-16): los restos de fiesta sobre la tabla saltan con golpes fuertes y el KO; cañón de confeti al que gana. Falta: velitas que se apagan, focos que barren y capas de música.
- Público: restos de la fiesta con vida alrededor de la tabla, desenfocados (aceitunas, palitos parados, sugus): saltan con
  cada golpe fuerte, se agachan con el súper. Instanciado, sin sombras.
- Fin de round: se apagan las velitas de la torta de un soplido en el KO, cañón de confeti para el que gana, cartel con el
  nombre. Entrada de round: los focos barren la tabla.
- Música: capas que suben con el combo (ya hay `AudioManager.musicOn`).

### G6 — HUD premium
**Hecha en parte** (2026-11-16): barra de poder partida en dos (media = REMATE/ESCAPE, llena = SÚPER) y guía con las entradas nuevas (la vida fantasma y el salto del combo ya estaban). Falta: retratos y reloj animado.
`hud.ts`. Barra de vida con "fantasma" (lo perdido queda blanco y baja con retardo), retrato de cada luchador (render a textura
de su cara al abrir la pelea), barra de poder partida en dos mitades (50 % = remate / escape) que brilla al llenarse, contador de
combo que pega un salto por golpe, reloj con cambio de dígito animado. Guía de teclas: sólo íconos, y los golpes nuevos de T3.

### G7 — Constructor más real
**Hecha en parte** (2026-11-16): saturación 0,32 → 0,24 (el mantel ya tenía arrugas y la cerámica clearcoat). Falta: halos del DoF y HDRI real.
`config.ts`, `render/`. Saturación 0,32 → 0,24; mantel con normal map de arrugas suaves y brillo de plástico (clearcoat bajo);
cerámica con clearcoat; corregir los halos blancos del DoF en los bordes de los envoltorios (revisar el orden bloom / DoF y el
premultiplicado de los materiales transparentes en `BokehDofPass.ts`); HDRI real de interior en
`public/assets/hdri/interior.hdr` (ya se usa solo si existe). No mover la cámara ni `BOWL_LAYOUT`.

### O1 — Pelea contra un amigo
El motor ya sirve: es puro, determinista, a paso fijo y sin azar. Pasos, de a uno:
1. **Dos chizitos en pantalla (local).** `creatureView` hoy asume una sola `Construction`. Cargar una segunda criatura desde su
   archivo en un segundo pivote y un segundo `creatureView`. Jugador 2 en el mismo teclado (I J K L + U O) para probar.
2. **Intercambio de criaturas**: mandar el `FighterModel` ya calculado (JSON) además del archivo, para que los dos lados
   simulen con los mismos números exactos (el resolver mide mallas y puede diferir en el último decimal entre máquinas).
3. **Sala por link** (`?sala=abc123`): WebRTC DataChannel. Señalización sin servidor propio para el prototipo (PeerJS con su
   broker público); si funciona, pasar a un canal propio.
4. **Sincronía**: lockstep con 3 cuadros de retardo de entrada (cada lado manda su `FightInput` por cuadro; se avanza cuando
   están los dos). Cada 60 cuadros se compara un hash del `Match`; si difiere, el anfitrión manda el estado entero
   (`structuredClone` del `Match`: es JSON + `Float64Array`). Rollback sólo si el retardo molesta.
Riesgo conocido: `Math.sin/cos/pow` pueden diferir entre navegadores distintos; el hash + reenvío lo cubre. Exigir Chrome.

### P1 — Plataforma de juegos de la fiesta (a futuro; no empezar todavía)
Cuando arranque el SEGUNDO juego (no antes): sacar de `main.ts` lo común (escena, mesa, cuarto, audio, entrada, HUD, el chizito
como avatar) a un `shell/` y definir `interface Minijuego { id; titulo; preload(); mount(ctx); unmount() }`; la pelea pasa a
ser el primero. Ideas anotadas: la PIÑATA (2–4 chizitos, la piñata explota y se pelean por los caramelos con el mismo motor de
golpes), la COLA AL BURRO en versión graciosa (pantalla mareada, el burro se mueve y patea, los amigos gritan pistas falsas, y
queda la foto del resultado para compartir).

---

## 6. Qué tiene que probar Franco (no lo puede medir una máquina)
1. Constructor: ¿el chizito se ve de frente como querías, o preferís además bajar la cámara?
2. Pelea: Q y W con una criatura simétrica, ¿se sienten iguales ahora?
3. Dos chupetines: ¿se nota el peso (camina lento, carga ~1 s)? ¿Sigue siendo fácil?
4. Los tres niveles después de T2: dificultad.
