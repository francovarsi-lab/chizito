# Resumen para un chat nuevo — CUMPLEAÑITO / Chizito Fight (al 2026-11-13)

Repo privado `francovarsi-lab/chizito`. **Rama de trabajo actual: `claude/upbeat-keller-vgk6l1`** (sale de
`claude/compassionate-carson-41ubkc` y la continúa; último commit de código `a192419`). El detalle completo está en
`CLAUDE.md` (leerlo primero).

## Reglas permanentes (Franco)
- Español rioplatense. Usa Claude de escritorio (Windows); las sesiones corren en la nube. Informes cortos, con hash y qué mirar.
  Si no se puede probar, avanzar igual y dejar todo subido.
- NO pushear a `main` (historia distinta). No tocar `claude/friendly-faraday-2lyzl2`. Trabajar y pushear sólo en la rama de la
  sesión. Sin PRs salvo pedido. Commits con autor Franco Varsi.
- "Apuntar al 100 para llegar al 10": nivel top, bello, único, arte + función, fluidez primero. La pelea es un show con la MISMA
  estética que el constructor. Nada de errores tipo "rostro desarmado": simple pero bien hecho.
- Higgsfield: Nano Banana 2.1 en 1K (~1,5 créditos) para explorar, 2K sólo lo final; 3D con SAM 3. Avisar si el gasto se dispara.
  Gastado: ~15,5 créditos. (Desde la nube no se pueden subir archivos de referencia a Higgsfield: el host está bloqueado.)
- Sonidos: los graba él; dejar ids listos (`public/assets/sounds/<id>.ogg|mp3|wav`, si no hay archivo suena un sintetizado).

## Cómo probar
- Vercel (cada push genera un deploy de la rama; pide login de Vercel): sacar un link compartible con la herramienta de Vercel
  `get_access_to_vercel_url` sobre la URL del último deploy de la rama (dura ~23 h). Abrir en **Chrome** (el panel de la app de
  Claude puede no tener WebGL: el cargador ahora avisa si falta WebGL).
- `?nivel=2` o `?nivel=3` en la URL arranca la pelea contra ese rival. `?sinintro` saltea la intro.
- Local: `git clone …`, `git checkout claude/upbeat-keller-vgk6l1`, `npm install`, `npm run dev` → http://localhost:5173

## Qué es
Constructor 3D (Vite + TS + Three.js): se clavan snacks en un chizito y se le dibuja la cara con ketchup. Botón PELEAR: TU
CHIZITO (sus mallas reales) contra un rival por nivel. Código de la pelea en `src/creature/fight/` (engine.ts motor puro a 60 Hz,
tuning.ts todos los números, fighter.ts modelos, render.ts vistas, brocoli.ts, rivals3d.ts, stage.ts, hud.ts, mount.ts).

## Hecho en esta etapa
**Pelea**
- Rivales: 1 EL BROCOLOCO; 2 HUEVO DURO (pelado y gelatinoso, brazos largos de espárrago = el doble de alcance, recibe ×1,25);
  3 MONSTRUO DE QUINOA (miles de granos, brazos pesados, recibe ×0,6, se REARMA si pasa 1,5 s sin recibir, granos girando en los
  puños). Huevo y quinoa hechos POR PARTES en `rivals3d.ts` según los bocetos elegidos (`docs/arte/bocetos/huevo-b.png`,
  `quinoa-a.png`), nunca foto→3D.
- Brócoli rehecho: copa del GLB recortada + tallo propio + cara limpia (remolachas con pupila en rendija y brillo rojo, cejas de
  morrón en V, sonrisa con colmillos); zanahorias CLAVADAS; guardia de boxeador.
- Apagón al apretar PELEAR + presentación de 11,6 s: vela, primero la BOCA del rival sonriendo, paneos lentos, frases con
  subtítulos (3 por rival, sonidos `brocoloco/huevo/quinoa-frase1..3`), suben a los ojos, focos de golpe + rugido + nombre;
  después TU CHIZITO (piñas a la lente, pose de héroe) y VS. Música (`musica-pelea` o base sintetizada) desde los focos.
- PELEAR pide cara de ketchup la 1ª vez ("¡Usá el ketchup para dibujarle un rostro!"); la 2ª entra igual.
- Física: KO que se desploma y rueda a su reposo (nada apuntalado), paso de verdad (la pierna que avanza se levanta), IA sin
  temblor de marioneta, chupetín (5 g > cuerpo 3,3 g, gira el torso, tope 18 de daño, si pifia sigue la inercia).
- Claridad: estelas de golpe, cartelito si una tecla no hace nada, guía de teclas siempre visible (chica), palabras quietas y
  legibles: ¡JAPISH!, ¡PIMBA! (patadas), ¡SOPLAMOCO! (piñas a la cara), ¡PIFIÓ!/¡PIF!.
- Arreglos: el bowl ya no se ilumina con el golpe, los rounds terminan en seco, los escudos se astillan bien.
**Constructor**
- Espadita al revés (entra el mango, queda la hoja). Sin servilletas usadas. Sal mate. Sin "no es brazo" en la cabeza.
- Sombras de recipientes y chizito con los mismos parámetros; luz más alta (~55°).
- Cámara "rincón íntimo": 65 mm a 39 cm y más desenfoque (casi no se nota: ver pendientes).

## Pruebas
- `npx tsc --noEmit` limpio. `node scripts/creature-fight-test.mjs` → 159 OK.
- Capturas: con el WebGL por software cada captura tarda ~5 min. Hacerlas contra una copia compilada fija
  (`VERCEL=1 npx vite build --outDir <dir>` + `npx vite preview --outDir <dir> --port 4174`), porque el dev server recarga al
  editar. Playwright del proyecto pide otra versión de navegador: armar `PLAYWRIGHT_BROWSERS_PATH` con enlaces a
  `/opt/pw-browsers/chromium_headless_shell-1243` (ver historial). `node scripts/present-shots.mjs <dir> [criatura] [tiempos]`
  (env `URL`, `NIVEL`). Laboratorio rápido de rivales: `lab/brocoli.html?rival=huevo|quinoa` + `node lab/shot.mjs <url> <png>`.

## Pendientes / próximos pasos
1. Que Franco juegue los 3 niveles. Dificultad: contra una IA, el huevo gana 7/8 y la quinoa 8/8 → ajustar según cómo se sienta.
2. **Mesa / rincón íntimo**: el cambio de cámara casi no se nota; hace falta reacomodar o achicar la tira de recipientes del frente
   (pedir permiso: Franco pidió no mover mucho las cosas). La intro (casa con fiestita) se mantiene.
3. La quinoa, con los brazos arriba al rugir, parece tener orejas de conejo. Granos facetados en primerísimo plano.
4. Brócoli más "real" (tallo liso, de plástico) y golpes más humanos; efectos/golpes premium; PODERES (a definir con materiales).
5. Zanahorias que se ven rojas con la luz cálida de la pelea.
6. Grabaciones de sonido y música de Franco (todos los ids están listos).
7. Integración con `main`: decidir cómo antes de hacerla.
