# Informe del intérprete sobre las criaturas de prueba

Generado por `node scripts/creature-report.mjs` (tanda 6: incluye acciones y defensa). Cajas de golpe: `docs/creature/hitboxes.svg`. Orientación de combate: frente a la derecha de la pantalla del constructor (−Y), arriba +X (el chizito parado). Medidas en mm y gramos de juego (valores a calibrar, ver `src/creature/config.ts`).

| criatura | piezas | extremidades | decorativas | masa (g) | modo | vel. (mm/s) | freno | apoyos | en profundidad |
|---|---|---|---|---|---|---|---|---|---|
| A · cuerpo + 2 brazos + 2 piernas | 4 | 4 | 0 | 3.98 | walk | 22.0 | 1 | 2 | 0 |
| B · cuerpo + 4 brazos | 4 | 4 | 0 | 3.94 | drag | 15.1 | 0.9 | 0 | 0 |
| C · cuerpo + 1 brazo | 1 | 1 | 0 | 3.42 | drag | 15.9 | 0.9 | 0 | 1 |
| D · erizo | 30 | 30 | 0 | 8.56 | roll | 24.7 | 0.1 | 6 | 12 |
| E · asimétrica / extraña | 8 | 3 | 6 | 7.75 | drag | 10.9 | 0.9 | 0 | 2 |
| Rival vegetal (proxy) | 4 | 4 | 0 | 4.57 | walk | 21.3 | 1 | 2 | 0 |

**Criterios de aceptación**

- ✅ A camina
- ✅ B se arrastra
- ✅ C se arrastra y su brazo sale marcado "en profundidad"
- ✅ D rueda, casi no golpea y casi no frena
- ✅ D: su única acción es la rodada
- ✅ E: 3 extremidades y el aviso de segundo nivel
- ✅ el vegetal camina

## A · cuerpo + 2 brazos + 2 piernas

4 piezas · 4 extremidades · 0 decorativas · masa 3.98 g · **walk**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 27.6 | 0.65 | reach | 0.15 | 0.00 | 0.00 | no | 131 a 185 | no | lanza |
| A2 | 28.4 | 0.69 | support | 0.18 | 0.62 | 0.00 | no | -129 a -101 | no | lanza |
| A3 | 28.6 | 0.63 | strike | 0.71 | 0.00 | 0.45 | no | -4 a 48 | no | lanza |
| A4 | 28.7 | 0.68 | support | 0.17 | 0.62 | 0.22 | no | -79 a -51 | no | lanza |

Locomoción: velocidad 22.0 mm/s · giro 1 · freno 1 · salto 0.0 mm · apoyos 2 · margen 16.6 mm · carga/capacidad 0.32

Acciones (una por entrada):

| acción | entrada | arranque | activa | recuperación | daño | alcance (mm) | radio (mm) |
|---|---|---|---|---|---|---|---|
| estocada | forward+attack | 13 | 6 | 17 | 8.7 | 28.6 | 4.0 |
| embestida | attack | 15 | 6 | 18 | 5.3 | 10.8 | 10.8 |

Defensa: **guardia** (−27 % de daño)

## B · cuerpo + 4 brazos

4 piezas · 4 extremidades · 0 decorativas · masa 3.94 g · **drag**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | 26.4 | 0.69 | reach | 0.08 | 0.00 | 0.00 | no | 146 a 174 | no | lanza |
| B2 | 26.1 | 0.47 | reach | 0.20 | 0.00 | 0.00 | no | 120 a 140 | no | lanza |
| B3 | 27.2 | 0.68 | defend | 0.37 | 0.00 | 0.46 | no | 6 a 34 | no | lanza |
| B4 | 26.8 | 0.46 | reach | 0.20 | 0.00 | 0.21 | no | 40 a 60 | no | lanza |

Locomoción: velocidad 15.1 mm/s · giro 0.4 · freno 0.9 · salto 0.0 mm · apoyos 0 · margen 0.0 mm · carga/capacidad 0.00

Acciones (una por entrada):

| acción | entrada | arranque | activa | recuperación | daño | alcance (mm) | radio (mm) |
|---|---|---|---|---|---|---|---|
| estocada | forward+attack | 12 | 6 | 16 | 4.6 | 27.2 | 4.0 |
| embestida | attack | 15 | 6 | 18 | 5.3 | 10.8 | 10.8 |

Defensa: **guardia** (−28 % de daño)

Avisos del panel:

- sin apoyos hacia abajo: se arrastra

## C · cuerpo + 1 brazo

1 piezas · 1 extremidades · 0 decorativas · masa 3.42 g · **drag**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 28.5 | 0.56 | strike | 0.39 | 0.00 | 0.17 | sí | 67 a 113 | no | lanza |

Locomoción: velocidad 15.9 mm/s · giro 0.4 · freno 0.9 · salto 0.0 mm · apoyos 0 · margen 0.0 mm · carga/capacidad 0.00

Acciones (una por entrada):

| acción | entrada | arranque | activa | recuperación | daño | alcance (mm) | radio (mm) |
|---|---|---|---|---|---|---|---|
| golpe-alto | up+attack | 13 | 6 | 17 | 4.4 | 28.5 | 4.0 |
| embestida | attack | 14 | 6 | 17 | 5.1 | 10.8 | 10.8 |

Defensa: **se encoge** (−25 % de daño)

Avisos del panel:

- 1 extremidad en profundidad: se ve corta en reposo, ataca con su largo real al girar al plano
- sin apoyos hacia abajo: se arrastra

## D · erizo

30 piezas · 30 extremidades · 0 decorativas · masa 8.56 g · **roll**

Las 30 extremidades: golpe máximo 0.17 (mínimo para contar: 0.3), giro medio 10°, 12 en profundidad.

Locomoción: velocidad 24.7 mm/s · giro 0.2 · freno 0.1 · salto 0.0 mm · apoyos 6 · margen 27.4 mm · carga/capacidad 0.25

Acciones (una por entrada):

| acción | entrada | arranque | activa | recuperación | daño | alcance (mm) | radio (mm) |
|---|---|---|---|---|---|---|---|
| rodada | attack | 26 | 30 | 23 | 12.0 | 40.5 | 40.5 |

Defensa: **guardia** (−29 % de daño)

Avisos del panel:

- 12 extremidades en profundidad: se ven cortas en reposo, atacan con su largo real al girar al plano
- muchas extremidades en todas direcciones: rueda, casi no golpea y casi no frena

## E · asimétrica / extraña

8 piezas · 3 extremidades · 6 decorativas · masa 7.75 g · **drag**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| E1 (tail, par) | 12.7 | 0.59 | reach | 0.26 | 0.00 | 0.18 | sí | 152 a 208 | no | lanza |
| E1 (tip, par) | 12.1 | 0.59 | reach | 0.25 | 0.00 | 0.18 | sí | -29 a 29 | no | lanza |
| E6 | 60.0 | 0.74 | strike | 0.80 | 0.00 | 0.57 | no | 10 a 15 | sí | maza |

Locomoción: velocidad 10.9 mm/s · giro 0.4 · freno 0.9 · salto 0.0 mm · apoyos 0 · margen 0.0 mm · carga/capacidad 0.00

Acciones (una por entrada):

| acción | entrada | arranque | activa | recuperación | daño | alcance (mm) | radio (mm) |
|---|---|---|---|---|---|---|---|
| mazazo | hold+attack | 62 | 6 | 41 | 38.2 | 60.0 | 15.6 |
| embestida | attack | 24 | 6 | 22 | 6.6 | 10.8 | 10.8 |

Defensa: **guardia** (−34 % de daño)

Decorativas (suman masa, no son extremidades):

- `papita-fxE2` — **plate** (0.86 g)
- `palito-fxE3` — **weak-anchor** (0.16 g)
- `palito-fxE4` — **weak-anchor** (0.17 g)
- `palito-fxE5` — **too-short** (0.17 g)
- `palito-fxE8` — **second-level** (0.18 g)
- `ketchup-fxE9` — **stroke** (0.00 g)

Avisos del panel:

- 2 extremidades en profundidad: se ven cortas en reposo, atacan con su largo real al girar al plano
- 1 palito clavado en un chizito ensartado: en el MVP 0 no cuenta como extremidad propia (se mueve con su extremidad)
- 1 pieza decorativa (placa pegada al cuerpo): suma masa, no es extremidad
- 2 piezas decorativas (base floja (poco adentro o muy inclinada)): suman masa, no son extremidades
- 1 pieza decorativa (sobresale muy poco): suma masa, no es extremidad
- 1 extremidad cuelga por el peso de su punta: solo puede bajar
- sin apoyos hacia abajo: se arrastra

## Rival vegetal (proxy)

4 piezas · 4 extremidades · 0 decorativas · masa 4.57 g · **walk**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| V1 | 27.7 | 0.67 | reach | 0.15 | 0.00 | 0.00 | no | 135 a 189 | no | lanza |
| V2 | 24.5 | 0.77 | support | 0.19 | 0.72 | 0.00 | no | -126 a -94 | no | lanza |
| V3 | 25.0 | 0.72 | strike | 0.79 | 0.00 | 0.46 | no | -12 a 48 | no | lanza |
| V4 | 25.1 | 0.75 | support | 0.19 | 0.71 | 0.17 | no | -86 a -54 | no | lanza |

Locomoción: velocidad 21.3 mm/s · giro 1 · freno 1 · salto 0.0 mm · apoyos 2 · margen 12.3 mm · carga/capacidad 0.28

Acciones (una por entrada):

| acción | entrada | arranque | activa | recuperación | daño | alcance (mm) | radio (mm) |
|---|---|---|---|---|---|---|---|
| estocada | forward+attack | 12 | 6 | 16 | 9.5 | 25.0 | 4.0 |
| embestida | attack | 17 | 6 | 19 | 5.5 | 11.7 | 11.7 |

Defensa: **guardia** (−27 % de daño)

