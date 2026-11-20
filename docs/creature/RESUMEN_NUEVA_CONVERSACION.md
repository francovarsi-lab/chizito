# Resumen para un chat nuevo — CUMPLEAÑITO / Chizito Fight (al 2026-11-19)

Repo privado `francovarsi-lab/chizito`. **Rama vigente: `claude/wonderful-galileo-8j38yn`** (sale de
`claude/charming-cray-7n5v8f`; contiene todo lo anterior). Leer primero `CLAUDE.md` (decisiones; la sección "Pelea" es larga y
al final tiene lo último) y `docs/PLAN_PREMIUM.md`. Balance medido: `docs/creature/BALANCE.md`.

## Reglas permanentes (Franco)
- Español rioplatense. Usa Claude de ESCRITORIO; las sesiones corren en la nube. Informes CORTOS: hash, qué mirar, qué quedó sin
  probar. "Avanzá con todo": hacer toda la lista antes de reportar.
- Link para probar: Vercel publica cada push de la rama (proyecto `chizito`, equipo "Franco"; buscar el último deploy con la
  herramienta de Vercel). También `npx vite --host 0.0.0.0 --port 5173` + `report_preview_port` (nombre "juego").
- NO pushear a `main`. Sin PRs salvo pedido. Commits con autor Franco Varsi, en español.
- "Apuntar al 100 para llegar al 10": premium, color de verdad (NADA de pasteles), fluidez primero (60 fps). JUGABLE PRIMERO:
  Franco no le podía ganar al brócoli; la dificultad del nivel 1 quedó baja a propósito.
- La cámara de la pelea "está bien": no cambiarla; para otras vistas, opcionales (V = aérea).
- DESCARTADO (no volver a poner): barra de AIRE, plato dorado, "NIVEL N", "¡MAREADO!", etiquetas en los golpes, "SE ESTÁ
  ESTABILIZANDO", sugus y bowl de chizitos en el constructor, ESCAPE del poder, zoom de cámara en los poderes, la yema del huevo.

## Cómo probar / medir
- `npm install` (si se instala algo con el server prendido: `npx vite --force`).
- Pruebas: `npx tsc --noEmit` y `node scripts/creature-fight-test.mjs` → **233 OK**.
- Balance: `node scripts/fight-matrix.mjs 20` (~75 s). Detalle: `MDEBUG=1 MATRIX_CHILD=1 node scripts/fight-matrix.mjs 2 boxeador`.
- Tiempos y daño por brazo: `node scripts/fight-probe.mjs arq/boxeador arq/mazo arq/chupetin1`.
- Capturas (3D por software, lento): `node scripts/fight-look.mjs <dir>` (round 1 + KO del huevo, ~10 min),
  `node scripts/one.mjs "seed=3" out.png` (constructor), `node scripts/versus-test.mjs <dir>` (pelea contra un amigo).

## Hecho en esta etapa
- Balance + IA (sangrado, castigo a lo lento, quinoa con granos entre los dos).
- O1: pelea contra un amigo por link (`fight/net.ts`, PeerJS + lockstep). Probada entre dos pestañas; NO entre dos computadoras.
- Jugable primero: golpes rápidos (palito 11–13 cuadros, aceituna ~24, chupetín ~27), aceituna pega pesado siempre, los dos
  hombros giran igual, gesto del chupetín, vuelta al pifiar = un solo giro limpio y queda expuesto.
- KO: cae al piso acostado, piernas plegadas, brazos flojos; los rivales ponen cara de noqueado.
- Poder v3: media barra = el de lo armado (nube que MAREA, trompo, carozazo, acupuntura, muralla); llena = OLOR A PATA.
- Canción por villano (`musica-brocoloco|huevo|quinoa`), arranca al entrar a la pelea. Hinchada: el bowl de chizitos salta y
  hace la ola una vez. Menos carteles. Sobres de ketchup dentro del platito. Volver a armar → arranca contra el brócoli.
- Quinoa: se le baja la vida sin cargar (rápido saca 75 %). Huevo sin arroz en los ojos ni yema.

## Pendiente (en orden)
1. HECHO: canción del brócoli en `public/assets/sounds/musica-brocoloco.mp3`.
2. Que Franco JUEGUE y diga: dificultad de los 3 niveles, chupetín (carga y vuelta), nube que marea, KO, hinchada.
3. Balance: HECHO el aporreo del chupetín (ver BALANCE.md, 2026-11-20). Queda: aporreo con palitos gana el nivel 1 (a propósito),
   tanque no le gana a la quinoa ni al huevo jugando bien; nivel 3 tan fácil como el 2 con `listo`.
4. Pelea contra un amigo: HECHOS el aviso "Esperando a tu amigo…" y el reenvío de estado si se desincroniza. Falta probar entre dos computadoras.
5. Restos visuales: HECHOS lucecitas que se apagan en el KO, foco que barre, retratos y reloj en el HUD. Capas de música: sólo
   con la canción en stems. Aberración en impactos: HECHA. Quedan: fundido por profundidad en efectos, halos del DoF en el constructor, HDRI real,
   normal map de la tabla.
6. Integración con `main`: historias distintas; decidir con Franco antes.
