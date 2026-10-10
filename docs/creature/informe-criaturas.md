# Informe del intérprete sobre las criaturas de prueba

Generado por `node scripts/creature-report.mjs`. Frente de combate +X, arriba +Y. Medidas en mm y gramos de juego (valores a calibrar, ver `src/creature/config.ts`).

| criatura | piezas | extremidades | decorativas | masa (g) | modo | vel. (mm/s) | freno | apoyos | en profundidad |
|---|---|---|---|---|---|---|---|---|---|
| A · cuerpo + 2 brazos + 2 piernas | 4 | 4 | 0 | 3.98 | walk | 22.6 | 1 | 2 | 0 |
| B · cuerpo + 4 brazos | 4 | 4 | 0 | 3.94 | drag | 15.1 | 0.9 | 0 | 0 |
| C · cuerpo + 1 brazo | 1 | 1 | 0 | 3.42 | drag | 15.9 | 0.9 | 0 | 1 |
| D · erizo | 30 | 30 | 0 | 8.56 | roll | 24.7 | 0.1 | 9 | 12 |
| E · asimétrica / extraña | 8 | 3 | 6 | 7.74 | drag | 10.9 | 0.9 | 0 | 2 |
| Rival vegetal (proxy) | 4 | 4 | 0 | 4.57 | walk | 22.4 | 1 | 2 | 0 |

**Criterios de aceptación**

- ✅ A camina
- ✅ B se arrastra
- ✅ C se arrastra y su brazo sale marcado "en profundidad"
- ✅ D rueda, casi no golpea y casi no frena
- ✅ E: 3 extremidades y el aviso de segundo nivel
- ✅ el vegetal camina

## A · cuerpo + 2 brazos + 2 piernas

4 piezas · 4 extremidades · 0 decorativas · masa 3.98 g · **walk**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 27.6 | 0.69 | support | 0.34 | 0.67 | 0.00 | no | -130 a -74 | no | lanza |
| A2 | 28.4 | 0.69 | reach | 0.15 | 0.00 | 0.00 | no | 127 a 183 | no | lanza |
| A3 | 28.6 | 0.67 | support | 0.33 | 0.65 | 0.11 | no | -105 a -51 | no | lanza |
| A4 | 28.7 | 0.68 | strike | 0.77 | 0.00 | 0.47 | no | -3 a 53 | no | lanza |

Locomoción: velocidad 22.6 mm/s · giro 1 · freno 1 · salto 0.0 mm · apoyos 2 · margen 16.8 mm · carga/capacidad 0.32

## B · cuerpo + 4 brazos

4 piezas · 4 extremidades · 0 decorativas · masa 3.94 g · **drag**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | 26.4 | 0.73 | reach | 0.08 | 0.00 | 0.00 | no | 140 a 170 | no | lanza |
| B2 | 26.1 | 0.73 | strike | 0.32 | 0.00 | 0.00 | no | 110 a 140 | no | lanza |
| B3 | 27.2 | 0.71 | defend | 0.40 | 0.00 | 0.47 | no | 10 a 40 | no | lanza |
| B4 | 26.8 | 0.72 | strike | 0.31 | 0.00 | 0.29 | no | 40 a 70 | no | lanza |

Locomoción: velocidad 15.1 mm/s · giro 0.4 · freno 0.9 · salto 0.0 mm · apoyos 0 · margen 0.0 mm · carga/capacidad 0.00

Avisos del panel:

- sin apoyos hacia abajo: se arrastra

## C · cuerpo + 1 brazo

1 piezas · 1 extremidades · 0 decorativas · masa 3.42 g · **drag**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 28.5 | 0.56 | strike | 0.39 | 0.00 | 0.17 | sí | 67 a 113 | no | lanza |

Locomoción: velocidad 15.9 mm/s · giro 0.4 · freno 0.9 · salto 0.0 mm · apoyos 0 · margen 0.0 mm · carga/capacidad 0.00

Avisos del panel:

- 1 extremidad en profundidad: se ve corta en reposo, ataca con su largo real al girar al plano
- sin apoyos hacia abajo: se arrastra

## D · erizo

30 piezas · 30 extremidades · 0 decorativas · masa 8.56 g · **roll**

Las 30 extremidades: golpe máximo 0.19 (mínimo para contar: 0.3), giro medio 10°, 12 en profundidad.

Locomoción: velocidad 24.7 mm/s · giro 0.2 · freno 0.1 · salto 0.0 mm · apoyos 9 · margen 35.1 mm · carga/capacidad 0.16

Avisos del panel:

- 12 extremidades en profundidad: se ven cortas en reposo, atacan con su largo real al girar al plano
- muchas extremidades en todas direcciones: rueda, casi no golpea y casi no frena

## E · asimétrica / extraña

8 piezas · 3 extremidades · 6 decorativas · masa 7.74 g · **drag**

| extremidad | largo | calidad | rol | golpe | apoyo | defensa | en profundidad | giro (grados) | cuelga | etiqueta |
|---|---|---|---|---|---|---|---|---|---|---|
| E1 (tail, par) | 13.5 | 0.45 | reach | 0.21 | 0.00 | 0.14 | sí | 68 a 112 | no | lanza |
| E1 (tip, par) | 11.0 | 0.45 | reach | 0.17 | 0.00 | 0.14 | sí | -23 a 23 | no | lanza |
| E6 | 60.0 | 0.76 | strike | 0.72 | 0.00 | 0.60 | no | -15 a -10 | sí | maza |

Locomoción: velocidad 10.9 mm/s · giro 0.4 · freno 0.9 · salto 0.0 mm · apoyos 0 · margen 0.0 mm · carga/capacidad 0.00

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
| V1 | 24.5 | 0.76 | support | 0.37 | 0.75 | 0.00 | no | -130 a -66 | no | lanza |
| V2 | 27.7 | 0.70 | reach | 0.15 | 0.00 | 0.00 | no | 131 a 189 | no | lanza |
| V3 | 25.1 | 0.75 | support | 0.37 | 0.74 | 0.07 | no | -113 a -51 | no | lanza |
| V4 | 25.0 | 0.76 | strike | 0.83 | 0.00 | 0.47 | no | -12 a 52 | no | lanza |

Locomoción: velocidad 22.4 mm/s · giro 1 · freno 1 · salto 0.0 mm · apoyos 2 · margen 15.3 mm · carga/capacidad 0.28

