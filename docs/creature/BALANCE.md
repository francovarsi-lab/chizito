# Balance de la pelea (matriz T1)

Generado con `node scripts/make-archetypes.mjs` (arquetipos con el frente real, `src/creature/fixtures/arq/`) y
`node scripts/fight-matrix.mjs 20` (≈ 2 min, un proceso por núcleo). Rival = `rivalFighter(nivel)` con `aiInput` de su nivel.
Bots de nuestro lado: `aporrea` (Q/W alternados cada 6 cuadros), `ia` (la IA de los rivales, nivel 3), `listo` (bloquea lo que
ve venir, castiga cuando el rival queda trabado, usa el poder lleno, pega cada 20 cuadros).

Objetivo (plan 4.7): `listo` 45–70 % al nivel 1, 30–55 % al 2, 15–40 % al 3; aporreando ≤ 25 % al 1 y ≤ 10 % al 2 y 3;
ningún arquetipo 15 puntos arriba del promedio.

## Lectura después de cortar el chupetín aporreado (2026-11-20)
Promedio (20 semillas): `listo` **99 % / 74 % / 76 %**; aporreando **51 % / 0 % / 4 %** (antes 86 / 14 / 14).
- **Causa del salto del aporreo** (46 → 86 % en el nivel 1, y doble chupetín 100 % en el 2 y el 3): desde que la IA "no corta la
  carga del chupetín" (se aleja para que pifie), revolearlo sin parar lo hacía intocable: el rival retrocedía siempre y nunca
  pegaba. Ahora, si el chupetín viene aporreado (`foe.repeat >= 1`), lo corta como a cualquier carga lenta; una carga pensada
  (sin aporrear) sigue sin cortarse.
- Sigue fuera de rango: aporreando con palitos gana el nivel 1 (boxeador, mazo, tanque 100 %): a propósito (Franco no le podía
  ganar), a decidir cuando juegue. `tanque` no le gana a la quinoa ni al huevo con `listo` (0 % / 20 %). El nivel 3 quedó tan
  fácil como el 2 para `listo`, y los chupetines arrasan con `ia`/`listo` en los niveles 2 y 3.

## Lectura después de "jugable primero" (2026-11-19, pedido de Franco: "no pude ganarle al brocoloco")
Promedio (20 semillas): `listo` **95 % / 56 % / 41 %**; aporreando **46 % / 0 % / 0 %**. A propósito por encima del objetivo
4.7 en el nivel 1: el usuario no le pudo ganar jugando de verdad. Cambios:
- Golpes más rápidos: palito 11–13 cuadros del botón al impacto (antes 13–16); aceituna 23–25 (antes 41–44); chupetín 27
  (antes 63). Daño por recorrido con piso 0,75 (antes 0,4): un golpe que conecta saca; aceituna 11, chupetín 12,5.
- Un brazo con aceituna pega PESADO toque con lo que toque (antes, si rozaba el palito, salía liviano).
- Pifiar cuesta menos (base 10 + 16 · peso, tope 48) pero se nota; la vuelta del chupetín es un solo movimiento.
- Brócoli: casi no se cubre (guardia 0,1), piensa cada 26 cuadros. Huevo 1,05 de daño recibido (antes 1,25) y pega más
  (pinchazo 6,8, látigo 5,8); quinoa 0,78 (antes 0,95). Niveles 2 y 3 reaccionan más rápido y cortan más lo lento.
- Fuera de rango: aporreando gana el nivel 1 con boxeador, mazo y tanque (100 %); `mazo` y `pinchudo` arrasan el nivel 2;
  `tanque` y `boxeador` no le ganan a la quinoa.

## Lectura después del ajuste de balance (2026-11-16, sesión siguiente)
Promedio (20 semillas): `listo` **66 % / 57 % / 17 %** (objetivo 45–70 / 30–55 / 15–40: el nivel 2 queda 2 puntos arriba);
aporreando **9 % / 0 % / 0 %** (objetivo ≤ 25 / 10 / 10 ✔). Antes: 81 / 69 / 9 y 64 / 0 / 0. Qué se cambió y por qué (medido):
- **El sangrado ganaba solo**: con 4 escarbadientes, aporreando, 49 de daño de golpes alcanzaban para dos KO (el resto era
  sangrado, que no se gastaba). Ahora un golpe gastado por aporrear no corta (`bleed.minWorn` 0,7), 1,1/s, 150 cuadros, 2 a la vez.
- **Lo lento no se castigaba**: el brócoli se cubría frente al mazazo de aceituna (36 cuadros de carga) y el golpe pasaba por
  arriba de la guardia. Ahora, frente a una carga lenta, el rival la CORTA con su ataque más rápido si llega (`AI_LEVELS.cut`),
  o da un paso atrás para que pifie y entra a castigar la traba; no se cubre.
- **Bajo presión el rival no jugaba**: su reloj de decisión no corría aturdido (12 ataques en 75 s contra el mazo). Al salir del
  aturdimiento decide enseguida, y si le leyó el ritmo al que aporrea contesta más (+0,3).
- **Quinoa**: los granos caían DETRÁS de ella (a 1,8 cm, dentro de su radio de 2 cm): los juntaba al instante, siempre. Ahora
  saltan hacia el que pegó (`grains.spill` 3,4 cm, entre los dos): tiene que avanzar para juntarlos y se pueden barrer; devuelven
  0,2 por grano (antes 0,3). PUÑO CAÑÓN 6 → 5 de daño y 8 cuadros más de recuperación; piensa cada 16 (antes 12).
- Pisotón del brócoli 8 → 6,5 y menos frecuente de lejos.
- Probado y DESCARTADO: que el chupetín lanzado aguante los toques sin cortarse (ganaba 100 % en los niveles 2 y 3).
- Fuera de rango todavía: `pinchudo` 90 / 90 / 40 con `listo`; `chupetin2` 0 % al nivel 1 con `listo` (el bot retrocede ante
  cabezazo y pisotón y con ese peso no escapa: es límite del bot tanto como del armado) y `tanque` aporreando 60 % al nivel 1
  (sus 16 golpes de escudo). `mazo` y `tanque` 0 % al nivel 3.

## Lectura después de T3–T8 (2026-11-16)
Rivales con ataques propios (T5–T8), quinoa de granos, entradas v2 y poder v2. El bot `listo` ahora juega con todo el sistema
(ataja lo que se bloquea, salta lo bajo, se aleja de lo que rompe la guardia, castiga con cargados, escape y súper) y lee bien
2 de cada 3 ataques (humano, no perfecto). Promedio de victorias (20 semillas):
- `listo`: nivel 1 **81 %**, nivel 2 **69 %**, nivel 3 **9 %** (objetivo 45–70 / 30–55 / 15–40). El 1 y el 2 quedaron un poco
  fáciles PARA UN BOT QUE LEE LOS AVISOS; el 3 todavía difícil (la quinoa: hay que cargar cada golpe y su METRALLA pega de lejos).
- Aporreando: nivel 2 y 3 **0 %** (objetivo ≤ 10 ✔); nivel 1 **64 %** (objetivo ≤ 25 ✘): con piezas pesadas o rápidas (mazo,
  pinchudo) el aporreo todavía le gana al brócoli de nivel 1. Se dejó así a propósito: el nivel 1 enseña, y bajarlo más
  castiga al que recién empieza. Si se quiere cumplir: subir `AI_LEVELS[0].think` hacia abajo o el castigo de `rivalDecide`.
- Desbalance de armado: el `mazo` gana todo en 1 y 2; el `pinchudo` es el único que le gana a la quinoa (la barrida y la
  acupuntura dispersan granos). Próximo ajuste: `pieceDmg.aceituna` y el alcance del látigo.

## Lectura después de T2 (2026-11-15)
Cambios: golpe más lento y legible, daño por recorrido, alcance parejo de los dos hombros, la IA suelta la guardia para
castigar y encadenar ya no borra el ritmo de aporreo.
1. **Aporrear dejó de ganar en los niveles 2 y 3** (1 % y 3 %; antes 41 % y 16 %). Objetivo cumplido.
2. **En el nivel 1 aporrear todavía gana el 76 %** (objetivo ≤ 25 %): el brócoli nivel 1 casi no lee el ritmo ni castiga.
   Es de su IA (moneda por cuadro) → T5.
3. **La quinoa (nivel 3) no pierde nunca** (0–5 %, salvo chupetin2 aporreando 20 %): coraza ×0,7 + regeneración + ahora el
   daño por recorrido. Se rediseña entera en T8 (absorber / reventar / granos).
4. **El bot `listo` es un mal instrumento**: pega poco (cada 80 cuadros para no contar como aporreo) y pierde el nivel 1 con casi
   todo mientras gana el 2 con boxeador y mazo. Mejorarlo junto con T3 (golpe rápido / cargado, atajada).
5. **El mazo sigue siendo el más fuerte** (100 % en nivel 1 y 2 con `listo`). Antes de tocar `pieceDmg` conviene tener la IA de
   T5: hoy el problema es que los rivales no castigan lo lento.

## Lectura antes de T2 (2026-11-15)
1. **Aporrear gana el nivel 1 siempre (100 %)** y el nivel 2 con `boxeador` y `tanque` (100 %). Objetivo: ≤ 25 % y ≤ 10 %.
2. **El nivel 1 es demasiado fácil**: `listo` gana el 99 % (objetivo 45–70 %).
3. **La quinoa (nivel 3) es intocable para las criaturas livianas**: `boxeador`, `pinchudo` y `tanque` no le meten ni un golpe
   limpio aporreando ni con `listo` (daño 0,0). Sólo la IA, que se mueve distinto, le pega.
4. **Los chupetines arrasan el nivel 1 y pierden casi siempre contra el huevo** (0–15 % al nivel 2).
5. **El `mazo` (aceitunas + piernas de selva) domina los niveles 2 y 3** (65–80 %).
6. **Los escarbadientes no conectan** contra el huevo ni la quinoa (daño 0,0 en casi todas las celdas): alcance de 2,1 cm.
7. Arreglado en esta tarea: el chupetín giraba alrededor de la guardia de 3/4, así que el del hombro de adelante pegaba antes
   (izq 68 c, der 63 c) y el de atrás a 6 cm apenas rozaba (v 0,24, 10,4 de daño). Ahora gira alrededor de la cara de frente:
   63 / 63 c, mismo daño y velocidad.

## Matriz (después de cortar el chupetín aporreado)
| arquetipo | g | bot | nivel 1 | nivel 2 | nivel 3 |
|---|---|---|---|---|---|
| boxeador | 4.9 | aporrea | 100% · 64 s · 1.7 / 6.0 | 0% · 53 s · 1.5 / 6.8 | 0% · 56 s · 1.3 / 5.0 |
| boxeador | 4.9 | ia | 75% · 93 s · 3.7 / 6.2 | 15% · 87 s · 2.9 / 6.6 | 0% · 102 s · 3.1 / 5.0 |
| boxeador | 4.9 | listo | 100% · 78 s · 5.2 / 5.9 | 100% · 99 s · 5.8 / 6.4 | 85% · 117 s · 5.0 / 5.0 |
| chupetin1 | 9.5 | aporrea | 15% · 81 s · 3.5 / 6.2 | 0% · 48 s · 4.3 / 6.8 | 0% · 67 s · 3.3 / 5.0 |
| chupetin1 | 9.5 | ia | 85% · 83 s · 4.9 / 6.5 | 95% · 84 s · 6.8 / 6.5 | 90% · 90 s · 4.6 / 5.0 |
| chupetin1 | 9.5 | listo | 100% · 60 s · 7.6 / 6.4 | 55% · 98 s · 9.5 / 6.3 | 95% · 98 s · 7.8 / 5.0 |
| chupetin2 | 14.1 | aporrea | 40% · 94 s · 7.2 / 6.3 | 0% · 58 s · 9.8 / 6.8 | 25% · 106 s · 5.2 / 5.0 |
| chupetin2 | 14.1 | ia | 95% · 82 s · 8.4 / 6.5 | 100% · 65 s · 9.2 / 6.5 | 100% · 63 s · 7.8 / 5.0 |
| chupetin2 | 14.1 | listo | 100% · 72 s · 10.4 / 7.0 | 95% · 80 s · 11.4 / 6.4 | 100% · 59 s · 9.7 / 5.1 |
| desparejo | 9.3 | aporrea | 5% · 79 s · 2.8 / 6.2 | 0% · 47 s · 4.9 / 6.8 | 0% · 66 s · 3.4 / 5.0 |
| desparejo | 9.3 | ia | 75% · 86 s · 4.3 / 6.5 | 70% · 82 s · 6.5 / 6.4 | 70% · 107 s · 4.0 / 5.0 |
| desparejo | 9.3 | listo | 100% · 66 s · 5.7 / 6.2 | 55% · 111 s · 8.3 / 6.3 | 80% · 107 s · 7.2 / 5.0 |
| mazo | 14.3 | aporrea | 100% · 52 s · 4.2 / 6.8 | 0% · 57 s · 5.3 / 6.8 | 0% · 77 s · 3.1 / 5.0 |
| mazo | 14.3 | ia | 100% · 56 s · 6.4 / 6.7 | 80% · 78 s · 7.3 / 6.5 | 100% · 67 s · 5.7 / 5.0 |
| mazo | 14.3 | listo | 100% · 51 s · 10.9 / 7.0 | 95% · 80 s · 12.6 / 6.4 | 70% · 89 s · 9.8 / 5.0 |
| pinchudo | 4.9 | aporrea | 0% · 75 s · 1.1 / 5.9 | 0% · 63 s · 0.7 / 6.8 | 0% · 55 s · 0.8 / 5.0 |
| pinchudo | 4.9 | ia | 45% · 84 s · 2.5 / 6.1 | 0% · 122 s · 2.1 / 6.2 | 0% · 72 s · 0.0 / 5.0 |
| pinchudo | 4.9 | listo | 100% · 60 s · 3.4 / 6.1 | 95% · 94 s · 3.8 / 6.5 | 100% · 89 s · 3.3 / 5.0 |
| tanque | 11.3 | aporrea | 100% · 51 s · 1.8 / 6.4 | 0% · 57 s · 1.6 / 6.8 | 0% · 56 s · 1.3 / 5.0 |
| tanque | 11.3 | ia | 100% · 59 s · 3.4 / 6.3 | 35% · 95 s · 3.2 / 6.2 | 0% · 87 s · 3.5 / 4.9 |
| tanque | 11.3 | listo | 95% · 90 s · 5.2 / 5.9 | 20% · 125 s · 6.4 / 6.0 | 0% · 112 s · 5.0 / 4.7 |

Promedio de victorias por bot (nivel 1 / 2 / 3):
- aporrea: 51% / 0% / 4% · a más de 15 puntos del promedio: boxeador@1 100%, mazo@1 100%, chupetin1@1 15%, pinchudo@1 0%, chupetin2@3 25%, tanque@1 100%, desparejo@1 5%
- ia: 82% / 56% / 51% · a más de 15 puntos del promedio: boxeador@2 15%, boxeador@3 0%, mazo@1 100%, mazo@2 80%, mazo@3 100%, chupetin1@2 95%, chupetin1@3 90%, pinchudo@1 45%, pinchudo@2 0%, pinchudo@3 0%, chupetin2@2 100%, chupetin2@3 100%, tanque@1 100%, tanque@2 35%, tanque@3 0%, desparejo@3 70%
- listo: 99% / 74% / 76% · a más de 15 puntos del promedio: boxeador@2 100%, mazo@2 95%, chupetin1@2 55%, chupetin1@3 95%, pinchudo@2 95%, pinchudo@3 100%, chupetin2@2 95%, chupetin2@3 100%, tanque@2 20%, tanque@3 0%, desparejo@2 55%

(70 s)

## Cerca pega, gancho y vuelta del chupetín (2026-11-20, 12 semillas)
Pedido del usuario: "la distancia corta no genera daño, sin chupetín no se puede ganar". Causa: el toque rápido sacaba 60 %, el
aporreo bajaba a 35 % y el recorrido corto a 75 % (de cerca, un palito sacaba 1–2). Ahora rápido 85 %, aporreo −20 % por golpe
(piso 45 %), recorrido piso 90 %. Las piñas de TU chizito son GANCHO de afuera hacia adentro con los dos brazos. La vuelta del
chupetín al pifiar es el castigo entero (`whirl.after` 0, sin quedarse quieto después).
- aporrea: 79 % / 0 % / 17 % · ia: 87 % / 48 % / 49 % · listo: 100 % / 67 % / 80 %.
- boxeador (sólo palitos) con `listo`: 100 / 100 / 100 (antes 100 / 100 / 85): sin chupetín se gana jugando bien.
- Sigue: el tanque no le gana a huevo ni quinoa (8 % / 0 %).

## Más enfrentados, raíces y cáscaras en la tabla (2026-11-22, 8 semillas)
`stanceYaw` 0,7 → 0,5 y los rivales ~60° → ~35° (pedido: "demasiado mirando a cámara"). Brócoli: RAÍCES en lugar del gas. Huevo:
las cáscaras que no pegan quedan en la tabla y lastiman al pisarlas. Probado y descartado: una atajada por tiempo sin que el golpe
toque el brazo (la IA atajaba casi todo: el nivel 1 bajó de 77 % a 59 %).
- aporrea: 75 % / 0 % / 9 % · ia: 77 % / 21 % / 34 % · listo: 100 % / 100 % / 100 % (antes ia 80 / 25 / 34).
- Sigue: el tanque y el pinchudo no le ganan a huevo ni quinoa con la `ia`.

## Bloqueo visible, lluvia de arbolitos y quinoa más dura (2026-11-22)
Guardia de los rivales con los brazos juntos delante de la cara y el pecho; arbolitos = 22 ramitos de 0,45; quinoa recibe ×0,8.
- aporrea: 59 % / 0 % / 0 % · ia: 75 % / 39 % / 25 % · listo: 100 % / 100 % / 100 %. Los niveles quedan en orden.
