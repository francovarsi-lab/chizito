# Informe del intérprete sobre las criaturas de prueba

Generado por `node scripts/creature-report.mjs`. Frente de combate +X, arriba +Y. Medidas en mm y gramos de juego (valores a calibrar, ver `src/creature/config.ts`).

| criatura | piezas | extremidades | decorativas |
|---|---|---|---|
| A · cuerpo + 2 brazos + 2 piernas | 4 | 4 | 0 |
| B · cuerpo + 4 brazos | 4 | 4 | 0 |
| C · cuerpo + 1 brazo | 1 | 1 | 0 |
| D · erizo | 30 | 30 | 0 |
| E · asimétrica / extraña | 8 | 3 | 6 |
| Rival vegetal (proxy) | 4 | 4 | 0 |

## A · cuerpo + 2 brazos + 2 piernas

4 piezas · 4 extremidades · 0 decorativas

| extremidad | extremo | libre | adentro | inclin. | calidad | etiqueta | masa | grupo |
|---|---|---|---|---|---|---|---|---|
| A1 | tail | 27.6 | 9.0 | 12° | 0.69 | lanza | 0.18 | 1 |
| A2 | tail | 28.4 | 9.0 | 0° | 0.69 | lanza | 0.19 | 1 |
| A3 | tail | 28.6 | 9.0 | 12° | 0.67 | lanza | 0.19 | 1 |
| A4 | tail | 28.7 | 9.0 | 0° | 0.68 | lanza | 0.19 | 1 |

## B · cuerpo + 4 brazos

4 piezas · 4 extremidades · 0 decorativas

| extremidad | extremo | libre | adentro | inclin. | calidad | etiqueta | masa | grupo |
|---|---|---|---|---|---|---|---|---|
| B1 | tail | 26.4 | 9.0 | 0° | 0.73 | lanza | 0.18 | 1 |
| B2 | tail | 26.1 | 9.0 | 0° | 0.73 | lanza | 0.18 | 1 |
| B3 | tail | 27.2 | 9.0 | 0° | 0.71 | lanza | 0.18 | 1 |
| B4 | tail | 26.8 | 9.0 | 0° | 0.72 | lanza | 0.18 | 1 |

## C · cuerpo + 1 brazo

1 piezas · 1 extremidades · 0 decorativas

| extremidad | extremo | libre | adentro | inclin. | calidad | etiqueta | masa | grupo |
|---|---|---|---|---|---|---|---|---|
| C1 | tail | 28.5 | 9.0 | 35° | 0.56 | lanza | 0.19 | 1 |

## D · erizo

30 piezas · 30 extremidades · 0 decorativas

Las 30 extremidades tienen calidad de ancla entre 0.56 y 0.69.

## E · asimétrica / extraña

8 piezas · 3 extremidades · 6 decorativas

| extremidad | extremo | libre | adentro | inclin. | calidad | etiqueta | masa | grupo |
|---|---|---|---|---|---|---|---|---|
| E1 | tail (par) | 13.5 | 11.0 | 59° | 0.45 | lanza | 0.10 | 1 |
| E1 | tip (par) | 11.0 | 11.0 | 59° | 0.45 | lanza | 0.08 | 1 |
| E6 | tail | 60.0 | 9.0 | 0° | 0.76 | maza | 2.96 | 3 |

Decorativas (suman masa, no son extremidades):

- `papita-fxE2` — **plate** (0.86 g)
- `palito-fxE3` — **weak-anchor** (0.16 g)
- `palito-fxE4` — **weak-anchor** (0.17 g)
- `palito-fxE5` — **too-short** (0.17 g)
- `palito-fxE8` — **second-level** (0.18 g)
- `ketchup-fxE9` — **stroke** (0.00 g)

## Rival vegetal (proxy)

4 piezas · 4 extremidades · 0 decorativas

| extremidad | extremo | libre | adentro | inclin. | calidad | etiqueta | masa | grupo |
|---|---|---|---|---|---|---|---|---|
| V1 | tail | 24.5 | 9.0 | 8° | 0.76 | lanza | 0.17 | 1 |
| V2 | tail | 27.7 | 9.0 | 0° | 0.70 | lanza | 0.18 | 1 |
| V3 | tail | 25.1 | 9.0 | 8° | 0.75 | lanza | 0.17 | 1 |
| V4 | tail | 25.0 | 9.0 | 0° | 0.76 | lanza | 0.17 | 1 |

