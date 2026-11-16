# Balance de la pelea (matriz T1)

Generado con `node scripts/make-archetypes.mjs` (arquetipos con el frente real, `src/creature/fixtures/arq/`) y
`node scripts/fight-matrix.mjs 20` (≈ 2 min, un proceso por núcleo). Rival = `rivalFighter(nivel)` con `aiInput` de su nivel.
Bots de nuestro lado: `aporrea` (Q/W alternados cada 6 cuadros), `ia` (la IA de los rivales, nivel 3), `listo` (bloquea lo que
ve venir, castiga cuando el rival queda trabado, usa el poder lleno, pega cada 20 cuadros).

Objetivo (plan 4.7): `listo` 45–70 % al nivel 1, 30–55 % al 2, 15–40 % al 3; aporreando ≤ 25 % al 1 y ≤ 10 % al 2 y 3;
ningún arquetipo 15 puntos arriba del promedio.

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

## Matriz (después de T3–T8)
| arquetipo | g | bot | nivel 1 | nivel 2 | nivel 3 |
|---|---|---|---|---|---|
| boxeador | 4.9 | aporrea | 0% · 75 s · 1.0 / 6.0 | 0% · 63 s · 1.6 / 5.5 | 0% · 41 s · 0.8 / 5.9 |
| boxeador | 4.9 | ia | 0% · 101 s · 2.7 / 6.3 | 0% · 100 s · 3.2 / 5.3 | 0% · 94 s · 1.9 / 5.3 |
| boxeador | 4.9 | listo | 90% · 142 s · 3.2 / 5.8 | 85% · 128 s · 6.7 / 5.2 | 0% · 144 s · 4.5 / 5.7 |
| chupetin1 | 9.5 | aporrea | 35% · 145 s · 3.3 / 7.4 | 0% · 80 s · 6.2 / 5.5 | 0% · 61 s · 1.3 / 6.0 |
| chupetin1 | 9.5 | ia | 20% · 116 s · 4.5 / 7.1 | 10% · 106 s · 7.1 / 5.2 | 0% · 93 s · 2.7 / 5.7 |
| chupetin1 | 9.5 | listo | 85% · 133 s · 5.9 / 6.5 | 35% · 146 s · 9.4 / 5.0 | 0% · 130 s · 5.7 / 5.5 |
| chupetin2 | 14.1 | aporrea | 60% · 165 s · 5.9 / 8.0 | 0% · 101 s · 11.1 / 5.5 | 0% · 92 s · 8.8 / 5.9 |
| chupetin2 | 14.1 | ia | 40% · 128 s · 6.7 / 7.7 | 15% · 122 s · 10.9 / 5.2 | 0% · 97 s · 6.3 / 5.6 |
| chupetin2 | 14.1 | listo | 10% · 155 s · 6.2 / 7.9 | 75% · 146 s · 11.8 / 5.1 | 0% · 121 s · 9.1 / 5.6 |
| desparejo | 9.3 | aporrea | 80% · 115 s · 2.4 / 7.5 | 0% · 77 s · 5.7 / 5.5 | 0% · 66 s · 1.0 / 5.9 |
| desparejo | 9.3 | ia | 20% · 118 s · 3.4 / 7.1 | 0% · 105 s · 5.9 / 5.2 | 0% · 92 s · 2.1 / 5.6 |
| desparejo | 9.3 | listo | 95% · 112 s · 4.0 / 6.2 | 35% · 161 s · 6.3 / 5.0 | 0% · 140 s · 4.6 / 5.5 |
| mazo | 14.3 | aporrea | 100% · 72 s · 2.4 / 7.5 | 0% · 83 s · 7.4 / 5.5 | 0% · 65 s · 3.6 / 6.0 |
| mazo | 14.3 | ia | 95% · 90 s · 5.1 / 7.4 | 25% · 118 s · 9.4 / 5.2 | 5% · 93 s · 5.3 / 5.6 |
| mazo | 14.3 | listo | 100% · 69 s · 8.8 / 7.8 | 80% · 137 s · 16.0 / 5.2 | 0% · 122 s · 11.3 / 5.5 |
| pinchudo | 4.9 | aporrea | 100% · 55 s · 0.6 / 6.0 | 0% · 64 s · 0.8 / 5.5 | 0% · 41 s · 0.5 / 5.9 |
| pinchudo | 4.9 | ia | 60% · 94 s · 2.0 / 6.1 | 0% · 183 s · 2.3 / 5.0 | 0% · 74 s · 0.0 / 5.2 |
| pinchudo | 4.9 | listo | 100% · 80 s · 2.0 / 5.7 | 100% · 99 s · 4.2 / 5.3 | 60% · 144 s · 2.9 / 5.7 |
| tanque | 11.3 | aporrea | 70% · 126 s · 1.1 / 6.1 | 0% · 67 s · 1.9 / 5.5 | 0% · 42 s · 0.8 / 6.0 |
| tanque | 11.3 | ia | 55% · 119 s · 2.4 / 6.4 | 0% · 101 s · 3.6 / 5.1 | 0% · 119 s · 1.9 / 5.1 |
| tanque | 11.3 | listo | 90% · 132 s · 3.8 / 5.6 | 75% · 151 s · 7.4 / 4.8 | 0% · 127 s · 4.9 / 5.2 |

Promedio de victorias por bot (nivel 1 / 2 / 3):
- aporrea: 64% / 0% / 0% · a más de 15 puntos del promedio: boxeador@1 0%, mazo@1 100%, chupetin1@1 35%, pinchudo@1 100%, desparejo@1 80%
- ia: 41% / 7% / 1% · a más de 15 puntos del promedio: boxeador@1 0%, mazo@1 95%, mazo@2 25%, chupetin1@1 20%, pinchudo@1 60%, desparejo@1 20%
- listo: 81% / 69% / 9% · a más de 15 puntos del promedio: boxeador@2 85%, mazo@1 100%, chupetin1@2 35%, pinchudo@1 100%, pinchudo@2 100%, pinchudo@3 60%, chupetin2@1 10%, desparejo@2 35%

(102 s)
