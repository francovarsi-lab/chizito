# Batería de golpes (S1–S7)

Generado por `node scripts/creature-battery.mjs`. Frente por defecto (−Y, derecha de la pantalla del constructor). Mínimo de capacidad de golpe: 0.3.

## S1 · 1 brazo

Locomoción: drag, freno 0.90. Acciones: estocada ← pS11 (cola) · embestida ← cuerpo.

| extremidad | largo cm | ángulo | golpe por dirección | ancla | vecinas iguales | capacidad | acción |
|---|---|---|---|---|---|---|---|
| pS11 (cola) | 2.7 | 20° | estocada | 0.67 | 0 | 0.74 | **estocada** (forward+attack), daño 9.1 |

## S2 · 2 brazos iguales

Locomoción: drag, freno 0.90. Acciones: estocada ← pS22 (cola) · embestida ← cuerpo.

| extremidad | largo cm | ángulo | golpe por dirección | ancla | vecinas iguales | capacidad | acción |
|---|---|---|---|---|---|---|---|
| pS21 (cola) | 2.7 | 160° | — | 0.67 | 0 | 0.15 | ninguna: apunta fuera del arco de golpe |
| pS22 (cola) | 2.5 | 20° | estocada | 0.72 | 0 | 0.79 | **estocada** (forward+attack), daño 9.6 |

## S3 · 2 brazos distintos (20° y 60°)

Locomoción: drag, freno 0.90. Acciones: golpe-alto ← pS31 (cola) · estocada ← pS32 (cola) · embestida ← cuerpo.

| extremidad | largo cm | ángulo | golpe por dirección | ancla | vecinas iguales | capacidad | acción |
|---|---|---|---|---|---|---|---|
| pS31 (cola) | 2.8 | 120° | golpe-alto | 0.35 | 0 | 0.31 | **golpe-alto** (up+attack), daño 3.4 |
| pS32 (cola) | 2.7 | 20° | estocada | 0.67 | 0 | 0.74 | **estocada** (forward+attack), daño 9.0 |

## S4 · 4 brazos apilados

Locomoción: drag, freno 0.90. Acciones: estocada ← pS44 (cola) · embestida ← cuerpo.

| extremidad | largo cm | ángulo | golpe por dirección | ancla | vecinas iguales | capacidad | acción |
|---|---|---|---|---|---|---|---|
| pS41 (cola) | 2.6 | 160° | — | 0.68 | 1 | 0.08 | ninguna: apunta fuera del arco de golpe |
| pS42 (cola) | 2.8 | 160° | — | 0.66 | 1 | 0.07 | ninguna: apunta fuera del arco de golpe |
| pS43 (cola) | 2.7 | 20° | estocada | 0.68 | 1 | 0.37 | ninguna: pasa el mínimo, pero la acción "estocada" la ejecuta pS44 (cola) (una por tipo) |
| pS44 (cola) | 2.4 | 20° | estocada | 0.72 | 1 | 0.40 | **estocada** (forward+attack), daño 4.8 |

## S5 · 2 brazos + 2 piernas

Locomoción: walk, freno 1.00. Acciones: barrida ← pS52 (cola) · estocada ← pS53 (cola) · embestida ← cuerpo.

| extremidad | largo cm | ángulo | golpe por dirección | ancla | vecinas iguales | capacidad | acción |
|---|---|---|---|---|---|---|---|
| pS51 (cola) | 2.8 | 175° | — | 0.68 | 0 | 0.14 | ninguna: apunta fuera del arco de golpe |
| pS52 (cola) | 2.5 | -125° | barrida | 0.75 | 0 | 0.39 | **barrida** (down+attack), daño 3.8 |
| pS53 (cola) | 2.6 | 5° | estocada | 0.74 | 0 | 0.76 | **estocada** (forward+attack), daño 9.2 |
| pS54 (cola) | 2.7 | -55° | barrida | 0.71 | 0 | 0.38 | ninguna: pasa el mínimo, pero la acción "barrida" la ejecuta pS52 (cola) (una por tipo) |

## S6 · 6 palitos en abanico

Locomoción: hop, freno 0.70. Acciones: golpe-alto ← pS66 (cola) · embestida ← cuerpo.

| extremidad | largo cm | ángulo | golpe por dirección | ancla | vecinas iguales | capacidad | acción |
|---|---|---|---|---|---|---|---|
| pS61 (cola) | 2.8 | -50° | barrida | 0.45 | 0 | 0.24 | ninguna: capacidad 0.24 < 0.3 — ancla 0.45 |
| pS62 (cola) | 2.6 | -30° | estocada | 0.63 | 2 | 0.18 | ninguna: capacidad 0.18 < 0.3 — apiñada con 2 del mismo golpe (÷3) |
| pS63 (cola) | 2.7 | -10° | estocada | 0.70 | 3 | 0.17 | ninguna: capacidad 0.17 < 0.3 — apiñada con 3 del mismo golpe (÷4) |
| pS64 (cola) | 2.4 | 10° | estocada | 0.76 | 3 | 0.20 | ninguna: capacidad 0.20 < 0.3 — apiñada con 3 del mismo golpe (÷4) |
| pS65 (cola) | 2.6 | 30° | estocada | 0.63 | 2 | 0.24 | ninguna: capacidad 0.24 < 0.3 — apiñada con 2 del mismo golpe (÷3) |
| pS66 (cola) | 2.7 | 50° | golpe-alto | 0.46 | 0 | 0.40 | **golpe-alto** (up+attack), daño 4.4 |

## S7 · 1 brazo en la cabeza

Locomoción: drag, freno 0.90. Acciones: golpe-alto ← pS71 (cola) · embestida ← cuerpo.

| extremidad | largo cm | ángulo | golpe por dirección | ancla | vecinas iguales | capacidad | acción |
|---|---|---|---|---|---|---|---|
| pS71 (cola) | 2.7 | 90° | golpe-alto | 0.71 | 0 | 0.64 | **golpe-alto** (up+attack), daño 7.1 |

