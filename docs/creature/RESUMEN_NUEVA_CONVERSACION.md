# Resumen para un chat nuevo — CUMPLEAÑITO / Chizito Fight (al 2026-11-15)

Repo privado `francovarsi-lab/chizito`. **Rama de trabajo actual: `claude/wonderful-noether-lvp9gc`** (continúa
`claude/upbeat-keller-vgk6l1`). El detalle completo está en `CLAUDE.md`: leerlo primero.

**Plan vigente: `docs/PLAN_PREMIUM.md`** (diagnóstico, combate v2 y tareas para repartir entre sesiones). Rama con ese trabajo:
`claude/sharp-einstein-iuyqgn`.

## Reglas permanentes (Franco)
- Español rioplatense. Usa Claude de escritorio (Windows); las sesiones corren en la nube. Informes cortos, con hash y qué mirar.
  Si no se puede probar, avanzar igual y dejar todo subido. "Avanzá a fondo": hacer todo lo pedido antes de reportar.
- NO pushear a `main`. No tocar `claude/friendly-faraday-2lyzl2`. Pushear sólo a la rama de la sesión. Sin PRs salvo pedido.
  Commits con autor Franco Varsi.
- "Apuntar al 100 para llegar al 10": nivel top, premium, bello, con color (NADA de pasteles), fluidez primero.
- Higgsfield: Nano Banana 2.1 en 1K para explorar, 2K sólo lo final, 3D con SAM 3. Gastado ~15,5 créditos.
- Sonidos: los graba él; ids listos en `public/assets/sounds/<id>`; mientras, suenan sintetizados.
- Cosas que el usuario DESCARTÓ (no volver a poner): barra de AIRE/estamina, plato dorado bajo el chizito, "NIVEL N" junto al
  nombre del rival, "¡MAREADO!", etiquetas en los golpes (PESADO, CORTE…), "SE ESTÁ ESTABILIZANDO", sugus y bowl de chizitos en
  el constructor (van sólo en la pelea).

## Cómo probar
- Vercel: link compartible con `get_access_to_vercel_url` sobre el último deploy de la rama (team `el-mejor-lugar`, dura ~23 h).
  Abrir en Chrome. `?nivel=2|3` arranca contra ese rival; `?sinintro` saltea la intro.
- Local: `git checkout claude/wonderful-noether-lvp9gc` → `npm install` → `npm run dev` → http://localhost:5173
- Pruebas: `npx tsc --noEmit`; `node scripts/creature-fight-test.mjs` → 177 OK.
- Capturas (3D por software, ~10 min cada una): build fijo `VERCEL=1 npx vite build --outDir <dir>` + `npx vite preview --outDir
  <dir> --port 5173`, y `node scripts/one.mjs "seed=3" out.png 40` (W=1280 H=720). Playwright pide chromium 1194: armar
  `PLAYWRIGHT_BROWSERS_PATH` con enlaces a `/opt/pw-browsers/chromium-1243` y al `chrome-headless-shell` de
  `chromium_headless_shell-1243` (en `chromium_headless_shell-1194/chrome-linux/headless_shell`).
- Laboratorio rápido de rivales (segundos): `lab/brocoli.html?rival=huevo|quinoa&cam=x,y,z,lx,ly` + `node lab/shot.mjs <url> <png>`.
- Para mover recipientes o la cámara del constructor: proyectar cada recipiente con la cámara real (three en node) y chequear
  cortes, encimados, la zona del chizito y su sombra, y las dioptrías del foco (así se calculó `BOWL_LAYOUT`).

## Hecho en esta etapa
**Pelea**
- Pasar de nivel arma el rival correcto (huevo, quinoa) y lo presenta con su intro.
- PODERES (barra que se llena pegando/recibiendo; E): NUBE DE QUESO (tu chizito, marea), VAPORAZO (brócoli, quema y empuja),
  HUEVAZO RODANTE (huevo, rueda; se salta o se bloquea), METRALLA DE GRANOS (quinoa, proyectiles; queda con menos coraza).
- Huevo de gelatina (vibra; golpes seguidos pegan menos); quinoa se abolla, sus granos de los puños son munición.
- Daño por pieza fijo: chupetín 11,6 > aceituna 9,4 > palito de la selva 7,6 > palito 6,2 > espadita 5 > escarbadientes 4;
  cada extremidad pega con su pieza más fuerte; piernas ×1,15; la velocidad sólo ±10 %.
- Chupetín: carga larga; si pifia sigue el MISMO movimiento y da la vuelta entera hacia el lado del golpe.
- Desproporción: lo clavado más pesado que el cuerpo lo vuelve lento y torpe.
- Aporrear no gana: pegar sin pausa pega cada vez menos y la IA lo lee, lo ataja y castiga (2/6 en nivel 1, 0/6 en 2 y 3).
- Gravedad: se para pivotando sobre el pie (no patina), sin enderezarse en el aire, equilibrio amortiguado.
- Textos: frases nuevas del huevo (una + el grito) y la quinoa; cartel del rival 2,4 s; estelas sobrias; sonidos sintetizados
  de verdad (golpes, campana, voces de dibujito, vapor, granos) con compresor.
- Espárragos rehechos (tallo con fibras y escamitas, yema en escamas).

**Constructor**
- Cámara nueva (45 mm, 24°, foco amplio): todo cerca y nítido. Disposición calculada (derecha varas y aceitunas; izquierda
  escudos, palito de la selva y ketchup). Cerámica esmaltada de colores, vasitos rayados, mantel azul intenso, más contraste y
  saturación, viñeta. Ketchup sin superponerse. Cartel con la tabla de cuánto saca cada golpe.

## Pendientes / próximos pasos
1. Que Franco juegue los 3 niveles y diga cómo se siente la dificultad (IA en su lugar gana 3/8, 2/8, 0/8: el nivel 3 puede
   estar duro).
2. Constructor: seguir subiendo el arte (el usuario quiere "premium de verdad"): luz con más carácter, fondo/pared, materiales.
   La pelea es de noche con focos: evaluar llevar algo de eso al constructor sin romper la intro de día.
3. Brócoli más "real", golpes más humanos, efectos premium.
4. Zanahorias que se ven rojas con la luz de la pelea; la quinoa con los brazos arriba parece tener orejas.
5. Grabaciones de sonido y música de Franco.
6. Integración con `main`: decidir cómo antes de hacerla (historias distintas).
