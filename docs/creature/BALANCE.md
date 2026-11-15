# Balance de la pelea (matriz T1)

Generado con `node scripts/make-archetypes.mjs` (arquetipos con el frente real, `src/creature/fixtures/arq/`) y
`node scripts/fight-matrix.mjs 20` (≈ 2 min, un proceso por núcleo). Rival = `rivalFighter(nivel)` con `aiInput` de su nivel.
Bots de nuestro lado: `aporrea` (Q/W alternados cada 6 cuadros), `ia` (la IA de los rivales, nivel 3), `listo` (bloquea lo que
ve venir, castiga cuando el rival queda trabado, usa el poder lleno, pega cada 20 cuadros).

Objetivo (plan 4.7): `listo` 45–70 % al nivel 1, 30–55 % al 2, 15–40 % al 3; aporreando ≤ 25 % al 1 y ≤ 10 % al 2 y 3;
ningún arquetipo 15 puntos arriba del promedio.

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

## Matriz (después de T2)
| arquetipo | g | bot | nivel 1 | nivel 2 | nivel 3 |
|---|---|---|---|---|---|
| boxeador | 4.9 | aporrea | 0% · 66 s · 1.2 / 5.9 | 0% · 63 s · 2.2 / 4.1 | 0% · 52 s · 0.0 / 4.9 |
| boxeador | 4.9 | ia | 45% · 112 s · 3.0 / 5.9 | 20% · 122 s · 5.7 / 4.6 | 0% · 137 s · 3.2 / 6.7 |
| boxeador | 4.9 | listo | 10% · 118 s · 3.0 / 5.5 | 70% · 96 s · 6.0 / 4.0 | 0% · 132 s · 0.0 / 4.7 |
| chupetin1 | 9.5 | aporrea | 90% · 134 s · 3.3 / 5.5 | 0% · 69 s · 7.1 / 4.7 | 0% · 84 s · 4.5 / 6.5 |
| chupetin1 | 9.5 | ia | 50% · 121 s · 4.8 / 5.2 | 15% · 97 s · 8.7 / 4.4 | 0% · 92 s · 4.4 / 6.3 |
| chupetin1 | 9.5 | listo | 0% · 90 s · 4.5 / 5.0 | 5% · 94 s · 9.0 / 4.0 | 0% · 79 s · 5.0 / 6.1 |
| chupetin2 | 14.1 | aporrea | 85% · 135 s · 5.5 / 5.6 | 5% · 88 s · 11.5 / 4.8 | 20% · 138 s · 6.2 / 6.3 |
| chupetin2 | 14.1 | ia | 20% · 125 s · 6.0 / 5.3 | 10% · 93 s · 11.8 / 4.1 | 0% · 87 s · 6.0 / 5.7 |
| chupetin2 | 14.1 | listo | 0% · 93 s · 6.0 / 5.3 | 5% · 82 s · 11.8 / 3.8 | 0% · 61 s · 6.3 / 5.7 |
| desparejo | 9.3 | aporrea | 100% · 88 s · 2.5 / 5.5 | 5% · 73 s · 6.1 / 4.6 | 0% · 80 s · 3.7 / 6.7 |
| desparejo | 9.3 | ia | 65% · 124 s · 3.9 / 5.1 | 0% · 91 s · 8.8 / 4.2 | 0% · 79 s · 4.0 / 5.8 |
| desparejo | 9.3 | listo | 0% · 92 s · 3.7 / 4.9 | 0% · 70 s · 7.6 / 3.8 | 0% · 61 s · 4.4 / 5.3 |
| mazo | 14.3 | aporrea | 100% · 65 s · 2.9 / 5.9 | 0% · 72 s · 7.6 / 4.6 | 0% · 57 s · 3.6 / 7.4 |
| mazo | 14.3 | ia | 100% · 76 s · 5.5 / 5.7 | 70% · 99 s · 10.6 / 4.6 | 0% · 102 s · 5.4 / 7.3 |
| mazo | 14.3 | listo | 100% · 83 s · 5.0 / 5.7 | 100% · 79 s · 11.9 / 4.1 | 5% · 108 s · 6.2 / 6.9 |
| pinchudo | 4.9 | aporrea | 100% · 51 s · 0.8 / 5.4 | 0% · 54 s · 0.0 / 3.2 | 0% · 52 s · 0.0 / 4.8 |
| pinchudo | 4.9 | ia | 100% · 66 s · 2.5 / 5.9 | 15% · 187 s · 3.4 / 4.6 | 0% · 124 s · 2.9 / 6.4 |
| pinchudo | 4.9 | listo | 100% · 65 s · 1.9 / 5.3 | 0% · 159 s · 0.0 / 3.7 | 0% · 129 s · 0.0 / 4.7 |
| tanque | 11.3 | aporrea | 60% · 114 s · 1.2 / 5.3 | 0% · 83 s · 2.5 / 3.1 | 0% · 73 s · 0.0 / 2.8 |
| tanque | 11.3 | ia | 100% · 95 s · 3.2 / 3.6 | 10% · 125 s · 6.3 / 2.6 | 0% · 142 s · 3.8 / 3.1 |
| tanque | 11.3 | listo | 0% · 99 s · 3.0 / 3.3 | 0% · 111 s · 6.9 / 2.4 | 0% · 110 s · 0.0 / 2.8 |

Promedio de victorias por bot (nivel 1 / 2 / 3):
- aporrea: 76% / 1% / 3% · a más de 15 puntos del promedio: boxeador@1 0%, mazo@1 100%, pinchudo@1 100%, chupetin2@3 20%, tanque@1 60%, desparejo@1 100%
- ia: 69% / 20% / 0% · a más de 15 puntos del promedio: boxeador@1 45%, mazo@1 100%, mazo@2 70%, chupetin1@1 50%, pinchudo@1 100%, chupetin2@1 20%, tanque@1 100%, desparejo@2 0%
- listo: 30% / 26% / 1% · a más de 15 puntos del promedio: boxeador@1 10%, boxeador@2 70%, mazo@1 100%, mazo@2 100%, chupetin1@1 0%, chupetin1@2 5%, pinchudo@1 100%, pinchudo@2 0%, chupetin2@1 0%, chupetin2@2 5%, tanque@1 0%, tanque@2 0%, desparejo@1 0%, desparejo@2 0%

(115 s)
