# AUDITORÍA — Hombrecito de chizito → intérprete de criaturas (MVP 0)

> **VERSIÓN 2 (2026-10-10).** Corregida tras leer la rama 3D `claude/friendly-faraday-2lyzl2` (hoy en 91994d3):
> la **Fase 4 ya estaba hecha ahí** (guardado/carga JSON, frente, tope de 40).
> Las secciones 1.6, 1.9, 2, 3, 5, 7 y 8 se reescribieron; el resto se conserva. Lo que describe `main` sigue siendo
> cierto para `main`, pero **la base de trabajo del intérprete es la rama 3D**, no `main`.
>
> **v2.1 (orientación de combate, decisión vigente):** el chizito del constructor arranca PARADO (eje largo +X hacia arriba) y
> **"arriba" de combate = +X**. El **frente de combate es dato por criatura sobre el eje horizontal de la pantalla del
> constructor, que es ±Y; la DERECHA de la pantalla es −Y** (medido en el juego), así que el frente por defecto es **−Y** y el giro
> de 180° lo da vuelta a +Y. Con frente −Y y arriba +X la profundidad (frente × arriba) es +Z, hacia el espectador: el perfil de
> combate es exactamente la imagen del constructor. Las decisiones anteriores (frente +Z, luego ±X con arriba +Y) quedan descartadas.

Modo: solo lectura sobre el código. Fecha: 2026-10-09. Auditado: `origin/main` @ `3eec4bf` (tras `git fetch`).
Marca **[INESTABLE]** = depende de las piezas en desarrollo (ketchup, chizito anidado, papita partida, zoom) o de
cosas que cambian en la otra rama. Marca **[A VERIFICAR]** = no pude comprobarlo.

---

## 0. HALLAZGO PREVIO: `main` NO es el estado real del desarrollo

| Rama | Commits | Estado |
|---|---|---|
| `origin/main` | 2 (`d152479` reconstrucción, `3eec4bf` "proyecto real recuperado del zip") | = mi rama `claude/vigilant-noether-244t33` (diff vacío) |
| `origin/claude/friendly-faraday-2lyzl2` | **23 commits por delante de main** (del 07 al 09/10) | Es donde vive TODO el trabajo 3D del otro chat |

Los commits de `friendly-faraday` que `main` no tiene (los relevantes):

- `137c178` nuevo estilo visual; `7ef7706` chizito cápsula; `9aa2749`/`8fddf51` palito de referencia y de 7 cm.
- `ccf0eea` Fase 3 (feedback, papitas, edición, undo/redo) — **ya está en main dentro del snapshot recuperado**, pero en la rama aparece como commit propio (la historia de main es una "reconstrucción").
- `a0a1c28` palitos a la mitad (3,5 cm). `7eaae61` mesa más lejos. `e301688` rueda = hundir/sacar. `7e09c58` estética pastel + animaciones.
- `600a254` **cámara con zoom** (rueda; `render/CameraRig.ts`). `6a5385f` **papita partida** (B) + giro.
- `ea6df44`, `49206f5`, `b872d70`, `d895c78` **piezas nuevas**: nacho, aceituna, escarbadientes/espadita.
- `8f29c92`, `e85c88d` **chizito ensartable** (chizito extra en la cola de un palito).
- `a966e4f`, `5b21e68` **ketchup**, vasitos separados, fix de la sacudida a pocos fps.
- `7def705` CLAUDE.md con los requisitos de Fase 4 (frente, JSON por conexiones, 40 piezas).

Magnitud: 60 archivos, +2080/−254. Toca `InteractionController` (+657 líneas), `PieceDefinition`, `Construction`,
`CommandStack`, `Picker`, `definitions.ts`, `Backdrop`, `main.ts`.

**Dos cosas que conviene que sepas antes de mergear esa rama:**
1. Esa rama **borra `.github/workflows/deploy.yml` y `vite.config.ts`** (`base: '/chizito/'`). Si se mergea tal cual, se
   rompe el deploy a GitHub Pages. Puede ser accidental (¿rama armada sobre un zip sin esos archivos?). Verificar.
2. Hay contradicciones entre `main` y la rama en datos básicos: palito **7 cm (main) vs 3,5 cm (rama)**, chizito en
   y=7,2 cm vs 10 cm, velocidad de hundido 4 vs 2 cm/s. Conclusión para el intérprete: **nunca hardcodear medidas**; leerlas
   resueltas del snapshot.

**Criterio de esta auditoría:** el código base es `main` (pedido). Donde la rama cambia el contrato de datos lo
marco **[INESTABLE]** y lo describo aparte, porque es lo que el intérprete va a tener que soportar.

---

## 1. AUDITORÍA DEL PROYECTO ACTUAL

### 1.1 Estructura y flujo (main: 35 archivos TS, ~5000 líneas)

```
src/main.ts                 orquestación: Stage → registries → fondo → pivot (chizito raíz) → Construction → Input/Picker/InteractionController → loop
src/config.ts               constantes de escena (cámara, luz, DoF, AO…)
src/render/                 Stage (renderer+postpro), Backdrop (mesa/bowls), Environment, ContactShadow, BokehDofPass, PhotoBackdrop, LookEffect
src/assets/                 AssetRegistry (GLB↔procedural), probe, procedural/{chizito,palito,papita,tube,surfaces,HeightField}
src/pieces/                 PieceDefinition (datos), PieceRegistry (Map), definitions.ts (CHIZITO, PALITO, PAPITA)
src/model/Construction.ts   árbol de piezas (PieceData/PieceNode) + restore()
src/interaction/            InteractionController (máquina de estados, 703 líneas), Picker (raycast), Placement (Aim), Ghost, TrackballRotator
src/commands/CommandStack   undo/redo por snapshots
src/input/ ui/ audio/ fx/   Input normalizado, Overlay (HUD DOM), AudioManager, Shake, Crumbs
scripts/                    screenshots, one, play-test, phase3-test (Playwright)
```

Flujo: `main()` crea el `pivot` (Group) con el chizito raíz, lo mete en `Construction` como nodo `root`,
y cada frame llama `interaction.update(dt)` → shake/crumbs → `stage.render`. Todo el estado de la
construcción cuelga del **grafo de escena de three.js** (`parent.object.add(child.object)`) y, en paralelo, del árbol `Construction`.
No hay bus de eventos: `InteractionController` expone callbacks sueltos (`onEvent`, `onChange`, `onReset`).

### 1.2 Piezas: PieceRegistry / AssetRegistry

- `PieceDefinition` (datos): `type`, `displayName`, `dimensions {length, thickness}` (m), `frame` (`centered`|`tip`),
  `procedural(seed, detail)`, `canPierce`, `canBePierced`, `maxDepth`, `sounds`.
- `PieceRegistry` = `Map<type, def>` con `register/get/all`. Se llena desde `ALL_DEFINITIONS` en `main.ts`.
- `AssetRegistry.create(type, seed, detail)`: si hay `public/assets/models/<type>.glb` (detectado por firma `glTF`)
  usa el GLB, normalizado al marco y escala de la definición (`normalizeToFrame`); si no, el procedural.
  `public/assets/models/` está **vacío** hoy: todo es procedural.
- **Lo que NO tiene una pieza:** masa, densidad, material/dureza, resistencia, ni geometría de colisión.
  Solo `dimensions` (largo/grosor nominales; el chizito real varía 4,4–5,2 cm por semilla y no se expone en PieceData).

| tipo | length | thickness | frame | pierce | pierced | maxDepth |
|---|---|---|---|---|---|---|
| chizito (raíz) | 4,8 cm ref. | 2,05 cm | centered | no | sí | – |
| palito | 7 cm [rama: 3,5] | 3,6 mm | tip | sí | no | 80 % del largo |
| papita | 5 cm Ø | 1,5 mm | tip | sí | sí | 8 mm |

### 1.3 Posicionado

- `Aim` (`interaction/Placement.ts`): marco local del padre `{entry, normal, u, v}` + `tiltX/tiltY` (máx 85° de la normal) + `depth` + `spin`.
  `pose()` = `position = entry + axis·(−depth)`, `quaternion = fromUnitVectors(Y, axis) · spin(Y)`.
  **La pose es 100 % reconstruible** desde `entryPoint, direction, depth, spin` (ver §5 de `PieceData`). `localMatrix` es derivado.
- Normal de entrada: raycast al mesh + promedio de 4 rayos vecinos a ±1,8 mm (`Picker.smoothNormal`) porque el chizito es grumoso.
  **La normal NO se guarda**; solo `direction` (que es −eje del palito).
- Jerarquía: la pieza clavada es hija en el grafo de escena del nodo en el que entró (`parent.object.add`). Rotar el pivot
  rota todo el árbol. Posiciones de hijos son locales del padre → **independientes de cómo esté girado el chizito en el mundo**.

### 1.4 Qué pasa cuando una pieza atraviesa a otra

- Atravesar = que el palito avance (`depth` crece) más allá de la superficie opuesta; **no hay cálculo de salida**. El `depth`
  solo está limitado por `maxDepth` (80 % del largo → siempre sobra el 20 % afuera).
- El hijo del palito es el nodo en que **entró** (la punta de entrada). Si el palito sale por el otro lado del chizito,
  no se registra ningún "punto de salida", ni el largo de punta libre, ni que ahora tiene DOS extremos libres.
  Si atraviesa un segundo objeto (p. ej. una papita ya clavada), queda hijo de la primera pieza donde entró; el de "la papita queda padre del palito" ocurre solo si el palito *entra* por la papita (`canBePierced`).
- La parte interior se oculta por depth buffer (el chizito es opaco). Es puramente visual: **no hay geometría de intersección**.

### 1.5 Almacenamiento en memoria: ¿grafo o solo posiciones?

**Es un árbol (padre→hijos), no un grafo de conexiones.**
- `Construction.nodes: Map<id, PieceNode>`; `PieceNode {data: PieceData, object, children, parent}`.
- `PieceData {id, type, parentId, seed, entryPoint, direction, depth, spin, localMatrix}`.
- La "conexión" es implícita: la arista padre→hijo + `entryPoint/direction/depth` del hijo. No hay objeto Conexión (sin id, sin
  estado de integridad, sin tipo de unión, sin punto de salida, sin ancla del lado del hijo).
- El árbol alcanza para el MVP 0 (una criatura es un árbol enraizado en el chizito). Un *grafo* haría falta solo si una pieza
  pudiera conectar dos padres (un palito que atraviesa dos chizitos queda hijo del primero; el segundo no lo "sabe").

### 1.6 Guardado / carga

- **En `main`: no existe.** (Verificado en su momento: sin `localStorage`, sin JSON, Ctrl+S sin implementar.)
- **En la rama 3D: SÍ existe (Fase 4 hecha)**, en `src/persistence/`:
  - `CreatureFile.ts`: formato **`hombrecito-de-chizito/criatura`, `version: 1`, unidades en metros**. Guarda por pieza
    `id, type, parentId, seed, attach{mode, entryPoint, direction, depth, spin}, params?` y por criatura
    `name, savedAt, pieceCount, root{type, seed}, front{direction, up}`. La pose se RECONSTRUYE al cargar
    (`poseFromData`); `localMatrix` no se guarda. `fromCreatureFile` valida (tipos conocidos, padre existente, conexión posible
    según `canPierce/canBePierced/tailMount/mountsOnTail`, tope de piezas) y descarta con aviso lo inválido.
  - `Persistence.ts`: Ctrl+S descarga el `.json`, Ctrl+O o arrastrar un archivo lo carga (`loadText`, público), autoguardado
    en `localStorage` (se recupera solo con `?recuperar`). Cargar se puede deshacer.
  - `interaction/attach.ts`: modos de conexión `pierce | tail | paint`, `tipPose`, `poseFromData`, `tailFrame` (desde la malla).
- **Consecuencia:** NO se propone un formato nuevo. `CreatureFileV1` es la fuente de verdad persistida y pertenece al chat 3D.
  El intérprete usa un `CreatureSnapshot` DERIVADO (archivo + geometría resuelta) que nunca se persiste.

### 1.7 Colisiones, físicas, joints, raycasts, bounding boxes

| Qué | Dónde | ¿Reutilizable? |
|---|---|---|
| Raycast contra mallas | `Picker` (superficie, bowls, pieza colocada), `updateHolding` | Sí, tal cual, para calcular chord/punto de salida en el *constructor* |
| Normal suavizada | `Picker.smoothNormal` | Sí (cálculo de ángulo de apoyo) |
| `Box3.setFromObject` | solo `normalizeToFrame` | Para medir tamaño real de una pieza al snapshotear |
| Física / joints / colisión entre piezas | **no hay** (decisión de proyecto: sin motor) | – |
| Sacudida | `fx/Shake` (resorte visual) | no es física |
| Migas | `fx/Crumbs` (gravedad+rebote simple, solo decoración) | no |

No hay hitboxes, ni AABB por pieza, ni nada 2D.

### 1.8 Undo / redo y selección

- `CommandStack`: `record(label, before, after)` con **snapshots completos** (`PieceData[]` sin raíz; máx 200). Deshacer = `restore(c.before)` →
  `Construction.restore` (diff por id; los objetos quitados van a un "cementerio" para reutilizar mallas).
- `InteractionController.record()` llama `onChange?.()` después de cada cambio, y `undo()/redo()` también. **Ese es el gancho para que el
  intérprete reaccione** (hoy sin suscriptor). Limitaciones: `onChange` es un único callback (no multicast) y se dispara al
  *terminar* el gesto, no durante el hundido (durante `INSERTING` el `PieceData` se muta cada frame sin notificar).
- Selección: `SELECTED_PLACED_PIECE` (`Picker.pickPlaced` + `Ghost.setHighlight` = resaltado cálido sutil). Un solo nodo seleccionado a la vez.
- Estados: `IDLE, HOLDING, AIMING, INSERTING, PLACED, SELECTED_PLACED_PIECE`.

### 1.9 Frente / orientación global

- **En `main`: no existe.**
- **En la rama 3D hay DOS cosas distintas:**
  1. **El lado de cara del constructor** (`BUILDER_FACE`, +Z, fijo): el costado que mira a la cámara en la pose inicial (parado). F vuelve a
     esa pose y lo marca. No es frente de combate.
  2. **El frente de combate**, dato por criatura que el cargador respeta (`Construction.front/up`, `creature.front` en el archivo). Hoy
     el chat 3D lo tiene con la convención ANTERIOR (±X, por defecto +X, arriba +Y; `DEFAULT_COMBAT_FRONT`, `readCombatFront`).
- **Decisión vigente** (más nueva que ese código): arriba de combate = arriba del constructor (**+X**); frente de combate = **±Y**, por
  defecto a la derecha de la pantalla del constructor = **−Y** (medido: con `homeRotation` Z+90°, la cámara tiene su derecha en −Y local;
  su arriba, en +X; y +Z apunta al espectador). Cambiar de lado = giro de 180° (un espejo exacto en x del perfil; los datos no se espejan).
- **Dependencia abierta con el chat 3D:** `readCombatFront` convierte todo lo que no sea ±X en +X con un aviso, así que los archivos
  nuevos (frente −Y, arriba +X) cargan igual pero con ese aviso, y `Construction.front/up` sigue en la convención vieja. Hay que pasar
  `DEFAULT_COMBAT_FRONT/UP` a (−Y, +X) y `readCombatFront` a ±Y. El intérprete no depende de eso: lee la orientación del snapshot.

### 1.10 Piezas en desarrollo — **[INESTABLE]** (rama `friendly-faraday-2lyzl2`, leído del código de la rama)

Cambios al contrato de datos que ya existen en esa rama:

| Cambio | Efecto en el contrato |
|---|---|
| `PieceData.params?: Record<string, unknown>` | datos de forma/variante: `bites` (papita/nacho partidos: semillas de mordiscos), `variant` (escarbadientes liso/espadita), puntos del trazo de ketchup |
| `PieceData.mount?: 'tail'` | el chizito se ensarta en la **cola** de un palito: `entryPoint/direction` pasan a coordenadas **de la propia pieza**, no del padre (¡cambia el significado del campo!). Pose = cola·inversa(punta). Nodo hijo = palito, pero físicamente el chizito *cuelga del palito*. |
| `PieceDefinition.frame: 'free'` | ketchup: geometría ya en coordenadas del padre; no es sólido ni se agarra. |
| `PieceDefinition.variants / holdHint / breakable / tailMount / mountsOnTail` | metadatos de UI/forma |
| Nuevos tipos | `aceituna, nacho, escarbadientes, ketchup` |
| Zoom (`CameraRig`) | no toca datos; sí cambia la cámara fija (Stage) |
| Papita partida | la forma depende de `params.bites` → **área/volumen cambian**; la masa no puede salir de `dimensions` nominales |
| Chizito anidado | el árbol puede tener chizitos que NO son raíz (cada uno con su `seed`/tamaño), sentido de "cuerpo" ambiguo |

---

## 2. QUÉ TENEMOS YA

1. Árbol de piezas con ids estables, padre, semilla y pose reconstruible (`PieceData`).
2. Registro de piezas por datos + `AssetRegistry` con reemplazo por GLB (cumple la restricción de arquitectura).
3. Raycast y normal suavizada confiables para calcular ángulos/puntos de entrada.
4. Undo/redo por snapshots y un gancho `onChange`.
5. Selección + resaltado de una pieza.
6. `Construction.restore()` que reconstruye una construcción desde datos (base para cargar criaturas de prueba).
7. Escala real (1 u = 1 m) y mesa en y=0: sirve para el escenario "a ras de mesa".
8. HUD DOM (`Overlay`) y entradas normalizadas (`Input`), tests de navegador con Playwright (`scripts/*-test.mjs`).
9. **(Rama 3D)** Guardado/carga JSON versionado, frente fijo y tope de 40 piezas (el ketchup no cuenta).
10. Estilo visual y escenografía (bowls, mantel, guirnaldas del fondo se pueden reusar en la arena).

## 3. QUÉ NOS FALTA PARA EL MVP 0 (sobre la rama 3D)

1. **Contrato `CreatureSnapshot`** derivado del archivo + un resolver que calcule la geometría (salida, cuerda, punta libre, anclas).
2. **Configuración única de umbrales y densidades** (`src/creature/config.ts`).
3. **Intérprete puro** (extremidades, masa, apoyos, locomoción, acciones) y **proyección 2D de perfil**.
4. **Criaturas de prueba** A–E y rival vegetal (con piezas proxy marcadas con `proxyDe`).
5. **Panel "ESTRUCTURA DETECTADA"**, resaltado de extremidades en 3D, selector y dibujo de perfil.
6. **Tope de 30 trazos de ketchup**: la constante vive en `src/creature/limits.ts`; el cumplimiento lo hace el chat 3D.
7. Decidir el **frente de combate** mirando los perfiles (ver 1.9).
8. Rival vegetal real (brócoli/tomate/zanahoria/apio): piezas del chat 3D.
(Ya resueltos por la rama 3D: guardado/carga, frente, tope de 40.)

## 4. QUÉ PARTES SE PUEDEN REUTILIZAR

| Pieza | Uso en el nuevo sistema |
|---|---|
| `Construction.list()/restore()` | serializar y reconstruir criaturas; cargar fixtures A–E |
| `PieceData` | núcleo de la conexión (`entryPoint,direction,depth,spin`) |
| `PieceRegistry/AssetRegistry` | piezas nuevas (vegetales) sin tocar lógica |
| `Picker` raycast + `smoothNormal` | calcular salida/cuerda/ángulo al snapshotear (solo en la app) |
| `Aim.pose()` | reconstruir `localMatrix` desde un snapshot (carga de fixtures) |
| `InteractionController.onChange` | disparar re-análisis (convertirlo en multicast pequeño) |
| `Ghost.setHighlight` / `setGhost` | resaltar extremidades (con color por rol, requiere variante) |
| `Overlay` | host del panel (o un panel DOM aparte) |
| `TrackballRotator` | orientar el chizito antes de "confirmar frente" |
| `Backdrop` bowls/guirnaldas | decorado de la arena |
| `scripts/*-test.mjs` | patrón de pruebas del panel y del intérprete |
| `Stage` | NO reutilizable tal cual para combate: perspectiva fija + DoF (ver riesgos) |

---

## 5. CAMBIOS DE ARQUITECTURA NECESARIOS (mínimos, sin romper lo que funciona)

1. Carpeta nueva `src/creature/` con el intérprete **puro** (sin three.js ni `Construction`) y un **resolver** como única parte que toca three.js.
2. **Un solo archivo de configuración** (`src/creature/config.ts`) con todos los umbrales y densidades. `limits.ts` (40 piezas, 30 trazos) queda
   aparte, sin imports, para que el chat 3D lo importe.
3. **No se crea un formato nuevo**: se lee `CreatureFileV1`. No hace falta emisor multicast: el panel encadena `interaction.onChange`
   como ya hace `Persistence`.
4. Un solo bloque en `main.ts` detrás del flag `?creature` (import dinámico; apagado = sin cambios de comportamiento) y una sección
   nueva al final de `CLAUDE.md`. Nada más de lo existente se toca.
5. El frente es parámetro: el contrato lee `orientation` del snapshot, no lo da por fijo.

## 6. PROPUESTA CONCRETA DEL INTÉRPRETE

### 6.1 Contrato `CreatureSnapshot` (v1)

Unidades: metros. Coordenadas: **marco local del chizito raíz** (X = eje largo). Datos JSON-puros (sin THREE).

```ts
interface CreatureSnapshot {
  schema: 'chizito.creature';
  version: 1;
  id: string; name?: string; createdAt: string;
  rootId: string;
  /** Frente y arriba, vectores unitarios en el marco local del raíz. Obligatorios al confirmar la vista de combate. */
  orientation: { front: V3; up: V3 };   // frente de combate (−Y por defecto) y arriba (+X); se lee del snapshot, no se supone
  pieces: SnapPiece[];            // incluye la raíz; orden padre→hijo
  connections: SnapConnection[];  // 1 por pieza no raíz
  stats: { structuralCount: number; cap: 40 };
}

interface SnapPiece {
  id: string; type: string; variant?: string; seed: number;
  params?: Record<string, unknown>;          // bites, puntos de ketchup…
  stability: 'stable' | 'unstable';          // marca de contrato (ver 6.7)
  /** Tamaño REAL resuelto al snapshotear (bbox de la malla), no el nominal. */
  size: { length: number; thickness: number };
  /** Eje largo de la pieza y centro, en marco raíz. Derivable de la pose pero se guarda resuelto. */
  axis: { a: V3; b: V3; radius: number };    // segmento + radio (cápsula) para 2D y masa
  cosmetic?: boolean;                        // ketchup: no cuenta ni colisiona
}

interface SnapConnection {
  id: string; parentId: string; childId: string;
  kind: 'pierce' | 'mount-tail' | 'paint';
  // Fuente de verdad (lo que se persiste):
  entryPoint: V3; direction: V3; depth: number; spin: number;   // en el marco declarado por `frame`
  frame: 'parent' | 'child';                                     // 'child' = mount-tail
  // Derivados al snapshotear (la app los calcula con raycast; las fixtures los traen escritos):
  entryNormal: V3;
  exit?: { point: V3; chord: number };       // si atraviesa: dónde sale y cuánto cuerpo cruzó
  freeTail: number;                          // largo de cola libre
  freeTip: number;                           // largo de punta libre saliendo del otro lado (0 si no sale)
  tiltFromNormal: number;                    // rad
  integrity: 'ok' | 'damaged' | 'broken';    // arranca 'ok'; lo usa el combate
}
```

Reglas del contrato: (a) la pose siempre se reconstruye de `entryPoint/direction/depth/spin`; (b) todo campo derivado puede
recalcularse y el intérprete solo confía en los que están, por eso las fixtures los incluyen; (c) `version` obligatoria, migraciones por versión;
(d) piezas desconocidas → tratadas como masa genérica y `stability:'unstable'`, nunca error.

### 6.2 Detección de extremidades por capacidades

Una *extremidad candidata* = **extremo libre** de una pieza conectada a una pieza sólida.
Una sola pieza que atraviesa produce **dos candidatas** (cola y punta saliente).

Condiciones (decisión del brief: "punta libre + base de apoyo clara"):
- largo libre ≥ `max(10 mm, 25 % del largo de la pieza)`;
- anclaje: largo embebido ≥ `max(6 mm, 20 % del largo)` y `tiltFromNormal ≤ 70°` (si no, "palito flojo": decorativo, cuenta como masa);
- la pieza padre `canBePierced` (sólida) y `integrity != broken`.
Las piezas de superficie (papita, nacho, aceituna) no son extremidades: son **apéndices/placas** (aportan masa y a veces `defend`).
Un chizito montado en la cola de un palito convierte esa extremidad en **maza** (más masa en la punta).

Para cada candidata se calculan capacidades continuas (0–1), **no excluyentes** (el rol se decide al final por la que gana):
- `support` (apoyar peso): componente hacia abajo de `up` ≥ 0,4, punta cerca del piso relativo, rigidez ≥ umbral.
- `push` (empujar): extremidad que apunta hacia atrás/abajo-atrás con rigidez (la usa la locomoción).
- `strike` (golpear): alcance hacia el frente con velocidad útil (poca masa en la punta) o maza (mucha masa, lenta).
- `reach` (alcanzar): proyección hacia el frente en el plano de perfil.
- `defend` (defender): superficie frontal o placa delante del núcleo.
Heurística antropomórfica **solo como sesgo** (peso 0,3): arriba → más `strike/reach`, abajo → más `support/push`. Lo dominante es la geometría y la masa.

### 6.3 Masa, alcance, apoyos y movilidad

- **Masa** = Σ `densidad[tipo] × volumen(cápsula|disco)`. Valores relativos en `pieceProfiles` ("calibrar con playtests", no reales). `cosmetic` pesa 0.
  Papita/nacho partidos: volumen × (1 − fracción mordida estimada de `params.bites.length`). **[INESTABLE]**
- **Centro de masa** = promedio ponderado de los centros de pieza, en el marco `(front, up, side)`.
- **Alcance** (por extremidad) = distancia en el plano de perfil desde el ancla hasta la punta; alcance de la criatura = máx por acción.
- **Apoyos** = extremidades con `support ≥ 0,5`; el **polígono de apoyo** en perfil es el intervalo `[xMin, xMax]` de sus puntas contra el suelo.
  Estabilidad = si el CoM proyectado cae dentro del intervalo (margen en cm).
- **Capacidad de carga por apoyo** ∝ `radio² × resistencia / largo` (pandeo simplificado). `carga = masa / nApoyos`.
- **Locomoción adaptativa:**
  - ≥ 2 apoyos separados y carga OK → `walk` (velocidad ∝ push, inversa a masa).
  - 1 apoyo → `hop`.
  - 0 apoyos → `drag` (arrastre).
  - carga > capacidad, o muchas extremidades radiales y simetría → `roll` (erizo) o `immobile`.
  - CoM fuera del polígono y sin recuperación → `tip over` (se cae/rueda; no inventamos partes que no hay).
- **Movilidad por extremidad**: rango angular = hasta dónde puede pivotar desde su punto de clavado sin penetrar el cuerpo (animación procedural sin keyframes).

### 6.4 Acciones ofensivas posibles (derivadas, nunca inventadas)

| Condición en la criatura | Acción | Mapeo (flechas + Ataque) |
|---|---|---|
| extremidad `strike` liviana al frente | **Jab** (rápido, corto) | Ataque |
| extremidad larga rígida al frente (palito) | **Estocada** (alcance, daño perforante) | → + Ataque |
| extremidad alta | **Golpe alto / barrido hacia abajo** | ↑ + Ataque |
| extremidad baja o apoyo adelantado | **Patada / barrida** | ↓ + Ataque |
| maza (chizito en punta) | **Mazazo** (lento, mucho daño) | Ataque mantenido |
| sin extremidades `strike` | **Embestida** del cuerpo | Ataque (único) |
| erizo / radial | **Rodada** con daño por contacto | → + Ataque |
Defensa (botón 2): `guard` con la mejor extremidad/placa frontal; sin ninguna, "encogerse" (reduce daño, pierde movilidad).
Daño = f(masa de la punta, velocidad de animación, material). Cada acción lleva `startup/active/recovery` (frames) derivados de la masa.

### 6.5 Panel "ESTRUCTURA DETECTADA"

- Panel DOM (`ui/StructurePanel.ts`) alimentado por `interpret(snapshot)`; se refresca por `onChanged`.
- Contenido: frente/arriba (con aviso si no está confirmado), masa total, CoM, modo de locomoción, apoyos, tabla de extremidades
  (rol dominante, alcance, fuerza, movilidad, resistencia), lista de acciones, **advertencias** (palito flojo, extremidad en eje de profundidad, tope 40).
- Resaltado 3D por extremidad con color por rol (variante de `setHighlight` que acepta color) y hover desde la fila de la tabla.
- Selector **A–E + Rival vegetal**: carga una fixture JSON (`src/creature/fixtures/*.json`) → `snapshot → PieceData[]` (reconstruyendo `localMatrix`
  con la misma matemática de `Aim.pose`) → `construction.restore()`. Funciona **sin** que exista la persistencia completa.
- Botón "vista de combate": orienta el pivot a perfil (ortográfica lateral), dibuja flecha/cartel de frente; permite voltear el frente y confirmar.

### 6.6 Proyección 2D de perfil (hitboxes)

Plano de perfil = `(front, up)`; se descarta el eje lateral `side`. Cada pieza sólida → **cápsula 2D** `(a2, b2, radio)`; el chizito → cápsula/elipse.
Hurtbox = unión de cápsulas (agrupadas por extremidad para daño por integridad). Hitbox activa = círculo en la punta de la extremidad que ataca,
durante sus frames activos. Cambio de lado = rotar 180° en Y (el frente cambia de signo en pantalla; las cápsulas no se espejan: se recalcula `x → −x`
solo en la proyección). Piezas con proyección < 3 mm (apuntan a la cámara) → mínimo de grosor + advertencia "extremidad en eje de profundidad".
Ketchup/cosmético: sin caja.

### 6.7 Tratamiento de lo INESTABLE en el contrato

`stability: 'unstable'` en `SnapPiece` para: `ketchup`, chizito montado (`mount-tail`), `papita/nacho` con `params.bites`, y cualquier tipo no listado en
`pieceProfiles`. Reglas: el adaptador es el **único** punto que conoce esos detalles; el intérprete trata `unstable` con valores conservadores (masa genérica,
no extremidad) y lo muestra en el panel. Cuando el otro chat se estabilice, solo se actualiza el adaptador y la tabla de perfiles.

---

## 6b. REFERENCIAS OPEN SOURCE (solo ideas de arquitectura)

**Honestidad previa:** solo pude consultar los *metadatos* de GitHub (búsqueda por API). El endpoint `/license` respondió 403, así que
**no leí los archivos LICENSE ni el código** de estos repos. Las ideas listadas son patrones estándar de juegos de lucha; hay que
confirmarlas leyendo cada repo antes de citarlos como fuente.

| Repo | Licencia (según metadatos de GitHub) | Notas |
|---|---|---|
| Shoto Fighter — `aminRX/shoto-fighter-godot` | **MIT** — [A VERIFICAR: archivo LICENSE y titular] | "2D fighting game estilo Street Fighter II, Godot 4, GDScript, diseño modular data-driven, 78 tests automáticos" |
| FightEngine — `Fxll3n/FightEngine` | **MIT** — [A VERIFICAR] | "Plugin de Godot 4.5 para acelerar peleadores 2D" |
| 2DFighting | **[A VERIFICAR]** — no identifiqué un repo inequívoco con ese nombre (la búsqueda por API dio 0 resultados exactos; hay decenas de repos genéricos de "2D fighting Godot" con licencias MIT/GPL/Apache/ninguna). Necesito la URL. | **No asumir** que es MIT: varios repos parecidos son GPL-3.0 (copyleft, incompatible con copiar código a un proyecto no-GPL). |

Qué se puede reutilizar legalmente: con MIT se puede copiar/adaptar código **conservando el aviso de copyright y la licencia**; pero GDScript no es portable a TS, así que
lo realista es reutilizar **ideas** (que no son protegibles) y reescribir. Los assets (arte/sonido) pueden tener licencias distintas a las del código: no copiarlos sin revisar.
Ideas útiles a evaluar (patrones habituales, a contrastar con los repos): máquina de estados por personaje (idle/walk/attack/hit/block/ko), separación hurtbox/hitbox,
tablas de *frame data* (startup/active/recovery) como datos, cámara que encuadra a ambos luchadores, input buffer. Sin dependencias nuevas.
Regla de oro: **nada de GPL** al repo.

---

## 7. RIESGOS TÉCNICOS

1. **Dos fuentes de verdad (`main` vs rama 3D):** el código cambia debajo. Mitigación: contrato + adaptador único; desarrollar el intérprete en carpetas nuevas.
2. **Merge de la rama 3D** borra `deploy.yml` y `vite.config.ts` → rompe Pages. Revisar antes de mergear.
3. **Semántica de `entryPoint/direction` cambia con `mount:'tail'`** (marco del hijo, no del padre): un intérprete ingenuo posiciona mal. Por eso `SnapConnection.frame`.
4. **Punto de salida no existe**: la detección de "dos extremos libres" depende de un raycast a la malla; con GLB reales o mallas grumosas puede dar cuerdas distintas. Mitigar: calcular siempre desde la malla vigente y guardar el resultado.
5. **Cámara lateral y profundidad:** extremidades que apuntan hacia/desde la cámara se ven cortas en 2D → choca con "respetar la creación". Se propone avisar, no deformar; puede hacer falta una regla de construcción ("vista de combate" obligatoria al guardar).
6. **Tope de 40 piezas:** los trazos de ketchup son nodos (uno por trazo): si cuentan, se agotan enseguida. Decisión tuya: ¿cuentan? Propuesta: no.
7. **Chizito anidado:** ¿"cuerpo" es el raíz o el más pesado? Propuesta: el raíz es núcleo, los montados son masa/maza de una extremidad. Puede chocar con la intención de usuario.
8. **Perfil físico inventado:** masas/resistencias son valores de juego, no reales; mal calibrados dan criaturas injugables → necesitan playtest y configuración externa (JSON).
9. **Render de combate:** `Stage` usa perspectiva + `BokehDofPass` (CoC por profundidad) y postproceso pesado; una cámara ortográfica baja puede romper el DoF/AO **[A VERIFICAR]**. Objetivo 60 fps con 40 piezas + arena.
10. **Rendimiento del raycast al snapshotear** con muchas piezas: `Picker.smoothNormal` hace 4 rayos por consulta; para 40 piezas es aceptable si se calcula una vez al confirmar, no por frame.
11. **`onChange` no cubre el hundido en curso** (se muta `PieceData` por frame sin notificar): re-analizar solo en commit/undo/redo/load.
12. **Libertad de construcción vs jugabilidad:** una criatura "inviable" (todo palito flojo, 0 apoyos, 0 ataques) debe jugar igual (embestida/arrastre); hay que definir el mínimo garantizado.
13. **Cálculo de ángulos en arrastre trackball:** el frente/arriba dependen de que el jugador confirme la vista; si no confirma, usar un default determinista y avisar.
14. **Orientación de combate:** ver 1.9. Decidida: arriba +X, frente ±Y (derecha = −Y). Depende de que el chat 3D actualice su cargador.
15. **La rama 3D se mueve** (hoy 91994d3 y avanzando): se integra con merge periódico; los fixtures dependen del formato `CreatureFileV1`.
16. **Palitos clavados en un chizito montado** no cuentan como extremidades propias en el MVP 0 (deuda del MVP 1); el panel lo avisa.
17. **Matter.js:** no instalar ahora, de acuerdo; el intérprete no debe asumir física general.

**Choques entre tu visión y el código real (para que decidas):**
- "Lo construido es 100 % utilizable": hoy cualquier palito clavado en cualquier ángulo es válido; hay piezas "flojas" y piezas hacia la cámara que no podrán usarse como extremidades → habrá una categoría "decorativa" y avisos en el panel.
- "Frente explícito": el modelo no lo tiene, y el chizito es simétrico (cápsula) → el frente tiene que declararlo el jugador.
- "Hombrecito": el chizito raíz es de eje X, pero la construcción puede apilar chizitos (anidado): el concepto de núcleo no es único.

---

## 8. ORDEN EXACTO DE IMPLEMENTACIÓN (aprobado; v2)

Rama: `claude/creature-interpreter`, creada desde la rama 3D. Un commit + push por tanda. Tandas 0–3 aprobadas; se frena tras la 3.

| # | Tanda | Archivos | Verifica |
|---|---|---|---|
| 0 | Doc v2 | `docs/AUDITORIA.md` | Coincide con el código de la rama base. |
| 1 | Contrato y límites | `src/creature/{limits,config,types,index}.ts` | `typecheck`; `MAX_PIECES` igual al del juego. |
| 2 | Perfiles y matemática | `profiles.ts`, `math/{vec,shapes2d,basis,mass}.ts`, `scripts/creature-test.mjs` | Proyección, giro de 180°, colisiones 2D, masas a mano. |
| 3 | Criaturas de prueba | `fixtures/`, `scripts/make-fixtures.mjs`, `public/assets/creatures/*.json`, `docs/creature/perfiles-a-vs-b.svg` | Los archivos cargan (con el único aviso conocido del frente viejo); D ≤ 40; perfiles de frente a la derecha, izquierda y +Z vs ±X. |
| 4 | Detección | `detect/*` | A: 4 extremidades, B: 4, C: 1, D: muchas con tope, E: decorativas con razón. |
| 5 | Masa, capacidades, locomoción | `analyze/*` | A camina, B salta o se arrastra, C se arrastra, **D rueda, casi sin acciones de golpe ni frenado (criterio de aceptación)**, vegetal camina. |
| 6 | Acciones, perfil 2D, fachada | `analyze/actions`, `project/*`, `interpret.ts`, `describe.ts` | Acciones sin duplicados; 40 piezas en < 5 ms. |
| 7 | Resolver (three.js) | `resolve/*` | Archivo cargado en la app = snapshot de referencia (1 mm, 2°). |
| 8 | Panel y selector | `ui/*` | Panel, resaltado, selector A–E, perfil 2D; avisa que los palitos en un chizito montado no cuentan como extremidades. |
| 9 | Instalación y cierre | `install.ts`, `docs/CREATURE_CONTRACT.md`, bloque en `main.ts`, sección en `CLAUDE.md` | Flag apagado = app idéntica; build limpio. |
