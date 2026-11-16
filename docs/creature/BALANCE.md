# Balance de la pelea (matriz T1)

Generado con `node scripts/make-archetypes.mjs` (arquetipos con el frente real, `src/creature/fixtures/arq/`) y
`node scripts/fight-matrix.mjs 20` (≈ 2 min, un proceso por núcleo). Rival = `rivalFighter(nivel)` con `aiInput` de su nivel.
Bots de nuestro lado: `aporrea` (Q/W alternados cada 6 cuadros), `ia` (la IA de los rivales, nivel 3), `listo` (bloquea lo que
ve venir, castiga cuando el rival queda trabado, usa el poder lleno, pega cada 20 cuadros).

Objetivo (plan 4.7): `listo` 45–70 % al nivel 1, 30–55 % al 2, 15–40 % al 3; aporreando ≤ 25 % al 1 y ≤ 10 % al 2 y 3;
ningún arquetipo 15 puntos arriba del promedio.

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

## Matriz (después del ajuste de balance)
| arquetipo | g | bot | nivel 1 | nivel 2 | nivel 3 |
|---|---|---|---|---|---|
| boxeador | 4.9 | aporrea | 0% · 74 s · 1.0 / 6.0 | 0% · 61 s · 1.7 / 5.5 | 0% · 48 s · 0.8 / 5.0 |
| boxeador | 4.9 | ia | 0% · 92 s · 2.8 / 6.2 | 5% · 95 s · 3.4 / 5.3 | 0% · 91 s · 1.8 / 5.0 |
| boxeador | 4.9 | listo | 80% · 146 s · 3.2 / 5.7 | 90% · 120 s · 6.7 / 5.2 | 10% · 160 s · 3.9 / 5.0 |
| chupetin1 | 9.5 | aporrea | 0% · 59 s · 2.2 / 6.2 | 0% · 53 s · 4.0 / 5.4 | 0% · 55 s · 1.3 / 5.0 |
| chupetin1 | 9.5 | ia | 5% · 82 s · 4.0 / 6.2 | 0% · 94 s · 5.9 / 5.1 | 0% · 98 s · 3.1 / 5.0 |
| chupetin1 | 9.5 | listo | 75% · 151 s · 5.8 / 6.0 | 30% · 126 s · 9.3 / 5.0 | 15% · 148 s · 6.2 / 4.9 |
| chupetin2 | 14.1 | aporrea | 0% · 57 s · 6.9 / 6.2 | 0% · 56 s · 11.3 / 5.4 | 0% · 65 s · 8.5 / 5.0 |
| chupetin2 | 14.1 | ia | 0% · 71 s · 6.6 / 6.3 | 10% · 105 s · 10.8 / 5.1 | 0% · 97 s · 6.8 / 4.9 |
| chupetin2 | 14.1 | listo | 0% · 97 s · 6.6 / 6.3 | 50% · 113 s · 12.0 / 5.1 | 45% · 134 s · 9.2 / 4.9 |
| desparejo | 9.3 | aporrea | 0% · 62 s · 1.9 / 6.2 | 0% · 51 s · 2.9 / 5.4 | 0% · 55 s · 1.2 / 5.0 |
| desparejo | 9.3 | ia | 0% · 77 s · 3.2 / 6.3 | 0% · 92 s · 5.3 / 5.2 | 0% · 93 s · 2.8 / 5.0 |
| desparejo | 9.3 | listo | 70% · 149 s · 3.9 / 6.0 | 35% · 146 s · 7.1 / 5.0 | 10% · 145 s · 5.2 / 4.9 |
| mazo | 14.3 | aporrea | 0% · 71 s · 3.1 / 6.2 | 0% · 58 s · 7.6 / 5.5 | 0% · 63 s · 4.8 / 5.0 |
| mazo | 14.3 | ia | 5% · 81 s · 5.0 / 6.3 | 0% · 86 s · 8.3 / 5.2 | 0% · 87 s · 4.8 / 4.9 |
| mazo | 14.3 | listo | 75% · 98 s · 8.3 / 6.8 | 50% · 112 s · 14.5 / 5.3 | 0% · 93 s · 9.5 / 4.9 |
| pinchudo | 4.9 | aporrea | 0% · 82 s · 0.6 / 6.0 | 0% · 62 s · 0.8 / 5.5 | 0% · 49 s · 0.5 / 5.0 |
| pinchudo | 4.9 | ia | 0% · 92 s · 1.9 / 6.1 | 0% · 160 s · 2.2 / 4.9 | 0% · 80 s · 0.0 / 5.0 |
| pinchudo | 4.9 | listo | 90% · 109 s · 1.9 / 5.8 | 90% · 121 s · 4.1 / 5.3 | 40% · 168 s · 2.5 / 5.0 |
| tanque | 11.3 | aporrea | 60% · 119 s · 1.1 / 6.0 | 0% · 67 s · 2.0 / 5.5 | 0% · 50 s · 0.8 / 5.0 |
| tanque | 11.3 | ia | 10% · 106 s · 2.6 / 6.3 | 0% · 96 s · 3.2 / 5.1 | 0% · 116 s · 1.8 / 4.9 |
| tanque | 11.3 | listo | 70% · 137 s · 3.8 / 5.9 | 55% · 139 s · 7.2 / 4.8 | 0% · 132 s · 4.6 / 4.7 |

Promedio de victorias por bot (nivel 1 / 2 / 3):
- aporrea: 9% / 0% / 0% · a más de 15 puntos del promedio: tanque@1 60%
- ia: 3% / 2% / 0%
- listo: 66% / 57% / 17% · a más de 15 puntos del promedio: boxeador@2 90%, mazo@3 0%, chupetin1@2 30%, pinchudo@1 90%, pinchudo@2 90%, pinchudo@3 40%, chupetin2@1 0%, chupetin2@3 45%, tanque@3 0%, desparejo@2 35%

(82 s)
