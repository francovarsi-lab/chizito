# Hombrecito de chizito — decisiones del proyecto

## Stack
Vite + TypeScript + three.js puro (sin librerías extra de postprocesado: ver más abajo).

## Por qué se reconstruyó
Una sesión anterior de Claude Code hizo las Fases 1-3 en un sandbox en la nube,
pero nunca llegó a hacer `git push`; al cerrarse esa máquina, el código se
perdió. Esta versión se reconstruyó en una sola pasada incorporando ya todos
los ajustes que se habían pedido sobre la marcha (ver abajo).

## Red bloqueada en la nube de Anthropic
La cuenta/organización tiene bloqueado el acceso a npm, GitHub (salvo el repo
ya conectado) y cualquier CDN desde los comandos que ejecuta Claude, tanto en
el sandbox de la nube como a través del puente a esta computadora. Por eso
este proyecto se escribió directamente en el disco (eso no necesita red) y el
`npm install` / `npm run dev` / `git push` se corren a mano, en una terminal
normal de Windows, donde la red no tiene esa restricción.

## Postprocesado: cambio respecto del plan original
El plan original usaba las librerías `postprocessing` y `n8ao` para el bokeh y
el AO. Como no pude instalar nada ni compilar para probar, decidí NO sumar esas
dependencias (ponytail: no agregar una dependencia que no puedo verificar) y
usar en cambio los módulos `examples/jsm` que ya vienen incluidos en el
paquete `three`: `EffectComposer` + `BokehPass` para la profundidad de campo,
y un `RoomEnvironment` (iluminación de interior genérica, sin descargar HDRI)
vía `PMREMGenerator`. El AO real queda pendiente; por ahora hay una sombra de
contacto falsa (un círculo oscuro bajo el chizito).
Si después hace falta AO real: sumar `n8ao` y su `N8AOPostPass` al composer.

## Escala (metros)
- Chizito: 5,5 cm de largo, 1,4 cm de radio.
- Palito: 9,5 cm de largo, 1,7 mm de radio. **Se volvió al largo original del
  prompt** (no los 3,4 cm de una iteración anterior): con el palito corto el
  muñeco quedaba sin brazos reconocibles, que era justo el problema a evitar.
- Papita: 2,5 cm de radio, 1,5 mm de espesor.
- Cámara fija, ~20 cm del chizito, fov vertical 27° (≈50mm full-frame).

## HDRI real (opcional)
Si bajás un HDRI de interior cálido (2K, .hdr) de polyhaven.com y lo guardás
en `public/assets/hdri/interior.hdr`, el juego lo usa automáticamente en vez
del RoomEnvironment genérico, sin tocar código.

## Modelo 3D real (opcional)
`src/pieces.ts` genera todo proceduralmente. Para reemplazar el chizito por un
modelo real (por ejemplo generado con Meshy/Hunyuan3D a partir de una foto),
hay que: 1) poner el archivo en `public/assets/models/chizito.glb`, y 2)
cargarlo con `GLTFLoader` en `construction.ts` como `overrideMesh` al crear el
`PieceNode` raíz. Ese segundo paso todavía no está hecho — es la próxima tarea
cuando tengas el .glb.

## Controles
- Arrastrar con clic izquierdo (sobre el chizito o el vacío, en estado IDLE) o
  clic derecho en cualquier estado: rota el chizito (con inercia). La cámara
  nunca se mueve.
- Clic en el vaso (derecha) o el bowl (izquierda): agarra un palito / papita.
- Mover el mouse sobre el chizito: previsualiza el punto de entrada. Clic:
  fija el punto y entra en modo "apuntar".
- Apuntando: mover el mouse (o flechas, Shift = paso grande) ajusta el ángulo,
  hasta 85° respecto de la normal. Q/E rotan la pieza sobre su propio eje.
- Mantener clic izquierdo: clava (empieza a 0 m/s y avanza a 5 cm/s). Al
  soltar, el ángulo queda trabado para siempre; solo se puede seguir hundiendo
  o sacando en línea recta.
- Clic en una pieza ya clavada: la selecciona. Mantener clic = la hunde más;
  Shift + mantener = la saca. Supr/Backspace la quita (con todo lo que cuelgue
  de ella). Esc deselecciona / cancela.
- Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y): deshacer/rehacer, por snapshots del árbol
  completo (más simple que un patrón de comandos, y alcanza para este MVP).
- R dos veces seguidas (antes de 600ms): reinicia la construcción.
- Ctrl+S: exporta el .json. Arrastrar un .json a la ventana: lo importa.
  Autoguardado en localStorage en cada cambio.
- H: oculta el indicador de ángulo.

## Pendiente / límites conocidos (ponytail)
- AO real (ver arriba).
- Sonidos son sintetizados (osciladores/ruido). Si Franco grava sonidos
  reales y los pone en `public/assets/sounds/<pick|drop|crack|crunch|out>.*`,
  se usan solos.
- Eliminar una pieza elimina todo lo que cuelga de ella (no se puede
  "rescatar" lo que colgaba).
- No hay medición de 60fps ni prueba con mouse real todavía: eso lo hace
  Franco al correr `npm run dev` en su máquina.
