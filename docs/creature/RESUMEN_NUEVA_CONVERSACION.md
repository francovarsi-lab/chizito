# Resumen para un chat nuevo — CUMPLEAÑITO / Chizito Fight (al 2026-11-28)

Repo `francovarsi-lab/chizito`, rama **`claude/stoic-newton-87biy2`** (nunca `main`, sin pull requests). Vite + TypeScript +
Three.js. Dos partes: el CONSTRUCTOR (clavás palitos y snacks en un chizito y le dibujás la cara con ketchup) y la PELEA (TU
CHIZITO contra 3 rivales: EL BROCOLOCO, HUEVO DURO, MONSTRUO DE QUINOA; también contra un amigo por link). Todas las decisiones
están en `CLAUDE.md` (leerlo entero; la sección "Pelea" es larga y lo último está al final). Balance: `docs/creature/BALANCE.md`.

## Reglas permanentes (Franco)
- Español rioplatense. Usa Claude de ESCRITORIO. Un commit y un push por tanda, firmados por Franco Varsi. Reportes CORTOS (qué
  cambió, qué mirar, qué quedó sin probar) y SIEMPRE el link para jugar:
  https://chizito-git-claude-stoic-newton-87biy2-el-mejor-lugar.vercel.app (último deploy de la rama; protección de Vercel apagada).
- "Avanzá fuerte / con todo": hacer TODA la lista antes de volver. Apuntar al 100, fluidez primero (60 fps).
- DESCARTADO, no volver a poner: barra de aire, "NIVEL N", "¡MAREADO!", las palabras "trastabilla" / "se está estabilizando" /
  "atajada" (se dice ¡BLOQUEADO!), colores pastel, granitos flotando en la quinoa, la bola de quinoa, "arboletes" (son ARBOLITOS).

## Cómo probar
- `node scripts/creature-fight-test.mjs` → 240 OK. `npm run typecheck`, `npm run build`.
- Balance: `node scripts/fight-matrix.mjs 8` (~25 s). Hoy: bot medio (`ia`) 79 % / 23 % / 4 %; el que juega bien (`listo`)
  100 % / 68 % / 52 %; aporreando 61 % / 0 % / 14 %.
- Sondas sin navegador: `kick-probe.mjs` (patada pareja de los dos lados), `power-probe.mjs` (daño de cada poder),
  `roots-probe.mjs` (las raíces atan 2,5 s), `fight-probe.mjs`.
- Capturas (WebGL por software, 1–5 min cada una; no editar `src/` mientras corren): `npx vite --port 5173` y
  `node scripts/power-shot.mjs <png> <nivel> <poder|ataque|guardia> [cuadros] [cuadros dibujados]`,
  `node scripts/fight-shot.mjs`, `CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/present-shots.mjs <dir>`.
- Pelea contra un amigo: `node scripts/versus-test.mjs <dir>` (~7 min) → 6 de 6.

## Hecho en las últimas tandas (2026-11-24 → 28)
- Quinoa: MASA QUE CAMBIA DE FORMA (`MoveKey.stretch`, `f.st` en el motor: lo que se ve es lo que pega). Puño elástico, martillo
  con puños-maza, látigo de granos al ras (se salta), derrumbe que corre como charco y se rearma en géiser. En el dibujo se estira
  SÓLO el tramo de arriba (el puño queda redondo) con un resorte que rebota. ¡REAGRUPARSE! (reemplaza la bola): torbellino de
  2,3 s; los granos giran en espiral, se PEGAN al cuerpo y se hunden. Tsunami de 5 cm que saca 18. Núcleo con textura de granos
  (sin base marrón); boca en anillos (antes asomaba quinoa por agujeros).
- Patadas con el mismo recorrido de los dos lados (la aceituna en la pierna ya no pega sin cargar).
- Lluvia de ARBOLITOS que lastima (~10 quieto, ~6 cubierto). Olor a pata SIN daño (marea y frena).
- Raíces: se cierran sobre el atrapado y lo siguen, 3 lazos gruesos, tiembla atado (el motor ya ataba; el dibujo quedaba al costado).
- Huevo: brazos colgando abajo en reposo, UN codo de verdad a media altura (nudo de escamas), espárragos más gruesos.
- Guardias "reales": varas (palitos, zanahorias, espárragos) = una delante de la cara y otra cruzando el pecho; la quinoa brazo
  adelante y antebrazo arriba (codo). Rivales se cubren menos (`AI_LEVELS.guard` 0,36 / 0,45).
- Vida que se regenera se VE: la barra brilla verde con un barrido y salen "+N" verdes.
- ¡TUKI! se turna con ¡JAPISH! en los golpes fuertes al cuerpo (sonido `tuki`, sin archivo suena como japish).
- Presentación: la vela del brócoli desaparece después de su plano (en el VS parecía un palito de la selva); el mapita del chizito
  (abajo a la izquierda) más chico y translúcido; se trababa ~2 s por un shader de la copa del brócoli compilado en plena intro
  (el ensayo lo compilaba sin recorte local) y por las piezas nuevas de tu chizito: ahora se compilan antes, a oscuras.

## Pendiente
- Que Franco juegue y confirme: guardias nuevas, estiramientos, torbellino, raíces, huevo, ¿el "escudo que tapa al personaje" era
  el mapita? (se achicó; si era otra cosa, pedir captura).
- Pinchudo casi no le gana a la quinoa (sus pinchazos se hunden; probado que no se hundan: pasa a 88–100 %, descartado).
- Aporreando se le gana 14 % a la quinoa (antes 0 %).
- HDRI real: la red de la sesión bloquea Poly Haven; si Franco sube un `.hdr` a `public/assets/hdri/interior.hdr` se usa solo.
- Partículas que se funden con la tabla (fundido por profundidad): sin hacer.
- Probar la pelea contra un amigo entre dos computadoras de verdad.
- Integrar la rama a `main`: no comparten historia; decidirlo con Franco (reemplazar `main` o mezclar resolviendo conflictos).
