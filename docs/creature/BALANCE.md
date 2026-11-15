# Balance de la pelea (matriz T1)

Generado con `node scripts/make-archetypes.mjs` (arquetipos con el frente real, `src/creature/fixtures/arq/`) y
`node scripts/fight-matrix.mjs 20` (≈ 2 min, un proceso por núcleo). Rival = `rivalFighter(nivel)` con `aiInput` de su nivel.
Bots de nuestro lado: `aporrea` (Q/W alternados cada 6 cuadros), `ia` (la IA de los rivales, nivel 3), `listo` (bloquea lo que
ve venir, castiga cuando el rival queda trabado, usa el poder lleno, pega cada 20 cuadros).

Objetivo (plan 4.7): `listo` 45–70 % al nivel 1, 30–55 % al 2, 15–40 % al 3; aporreando ≤ 25 % al 1 y ≤ 10 % al 2 y 3;
ningún arquetipo 15 puntos arriba del promedio.

## Lectura (2026-11-15, antes de T2)
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

## Matriz
| arquetipo | g | bot | nivel 1 | nivel 2 | nivel 3 |
|---|---|---|---|---|---|
| boxeador | 4.9 | aporrea | 100% · 40 s · 3.5 / 7.9 | 100% · 114 s · 3.2 / 7.5 | 0% · 45 s · 0.0 / 6.5 |
| boxeador | 4.9 | ia | 100% · 55 s · 6.2 / 6.9 | 45% · 110 s · 7.5 / 6.2 | 0% · 126 s · 5.5 / 7.4 |
| boxeador | 4.9 | listo | 100% · 38 s · 4.5 / 7.7 | 95% · 91 s · 3.7 / 7.5 | 0% · 114 s · 0.0 / 5.3 |
| chupetin1 | 9.5 | aporrea | 100% · 73 s · 6.0 / 7.1 | 5% · 74 s · 8.3 / 6.8 | 5% · 106 s · 5.7 / 9.1 |
| chupetin1 | 9.5 | ia | 60% · 84 s · 7.0 / 6.8 | 0% · 66 s · 10.3 / 6.1 | 0% · 95 s · 5.7 / 8.1 |
| chupetin1 | 9.5 | listo | 100% · 73 s · 8.8 / 6.7 | 55% · 84 s · 11.3 / 6.0 | 65% · 103 s · 7.2 / 7.8 |
| chupetin2 | 14.1 | aporrea | 100% · 72 s · 12.1 / 6.8 | 15% · 71 s · 15.0 / 6.2 | 50% · 103 s · 8.9 / 7.7 |
| chupetin2 | 14.1 | ia | 30% · 86 s · 11.3 / 6.4 | 0% · 70 s · 14.0 / 5.7 | 5% · 74 s · 8.0 / 7.0 |
| chupetin2 | 14.1 | listo | 90% · 79 s · 12.3 / 6.5 | 15% · 73 s · 15.4 / 5.7 | 0% · 74 s · 8.9 / 7.3 |
| desparejo | 9.3 | aporrea | 100% · 62 s · 5.1 / 7.1 | 15% · 67 s · 9.4 / 6.6 | 20% · 115 s · 5.7 / 8.7 |
| desparejo | 9.3 | ia | 70% · 82 s · 6.4 / 6.6 | 0% · 66 s · 10.0 / 5.8 | 0% · 76 s · 5.2 / 8.0 |
| desparejo | 9.3 | listo | 100% · 68 s · 8.1 / 6.9 | 10% · 73 s · 11.6 / 5.9 | 45% · 85 s · 7.1 / 7.7 |
| mazo | 14.3 | aporrea | 100% · 37 s · 8.1 / 6.6 | 55% · 111 s · 8.3 / 6.1 | 35% · 193 s · 5.3 / 9.6 |
| mazo | 14.3 | ia | 100% · 52 s · 8.9 / 6.4 | 35% · 91 s · 13.1 / 5.9 | 80% · 88 s · 7.0 / 8.7 |
| mazo | 14.3 | listo | 100% · 41 s · 8.5 / 6.6 | 70% · 83 s · 12.5 / 5.9 | 65% · 88 s · 7.3 / 8.7 |
| pinchudo | 4.9 | aporrea | 100% · 31 s · 3.5 / 7.2 | 0% · 39 s · 0.0 / 5.5 | 0% · 45 s · 0.0 / 6.5 |
| pinchudo | 4.9 | ia | 100% · 53 s · 5.0 / 6.6 | 10% · 116 s · 5.1 / 5.4 | 0% · 103 s · 0.0 / 6.9 |
| pinchudo | 4.9 | listo | 100% · 37 s · 3.8 / 7.3 | 0% · 122 s · 0.0 / 4.2 | 0% · 115 s · 0.0 / 5.3 |
| tanque | 11.3 | aporrea | 100% · 35 s · 3.1 / 2.0 | 100% · 93 s · 3.0 / 2.5 | 0% · 61 s · 0.0 / 3.7 |
| tanque | 11.3 | ia | 100% · 42 s · 6.6 / 2.7 | 35% · 113 s · 7.3 / 3.1 | 0% · 154 s · 5.3 / 3.4 |
| tanque | 11.3 | listo | 100% · 35 s · 4.6 / 2.1 | 95% · 95 s · 3.6 / 2.7 | 0% · 97 s · 0.0 / 3.2 |

Promedio de victorias por bot (nivel 1 / 2 / 3):
- aporrea: 100% / 41% / 16% · a más de 15 puntos del promedio: boxeador@2 100%, boxeador@3 0%, mazo@3 35%, chupetin1@2 5%, pinchudo@2 0%, pinchudo@3 0%, chupetin2@2 15%, chupetin2@3 50%, tanque@2 100%, tanque@3 0%, desparejo@2 15%
- ia: 80% / 18% / 12% · a más de 15 puntos del promedio: boxeador@1 100%, boxeador@2 45%, mazo@1 100%, mazo@2 35%, mazo@3 80%, chupetin1@1 60%, chupetin1@2 0%, pinchudo@1 100%, chupetin2@1 30%, chupetin2@2 0%, tanque@1 100%, tanque@2 35%, desparejo@2 0%
- listo: 99% / 49% / 25% · a más de 15 puntos del promedio: boxeador@2 95%, boxeador@3 0%, mazo@2 70%, mazo@3 65%, chupetin1@3 65%, pinchudo@2 0%, pinchudo@3 0%, chupetin2@2 15%, chupetin2@3 0%, tanque@2 95%, tanque@3 0%, desparejo@2 10%, desparejo@3 45%

(112 s)
