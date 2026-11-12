import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { litter } from '../../render/PartyProps';
import { BULBS_NAME, type Bulbs } from '../../render/Bulbs';
import type { Stage } from '../../render/Stage';

/** m: alto de la tabla de picar donde se pelea (el piso de la pelea queda a esta altura sobre el mantel). */
export const GROUND = 0.012;
/** Tabla de la arena (m): ancho, profundidad y corrimiento hacia atrás desde la línea de la pelea. */
const BOARD = { w: 0.5, d: 0.32, dz: -0.06 };

/**
 * Escenario de la pelea, armado sobre la MISMA mesa de cumpleaños pero de noche: el cuarto se apaga y la arena (una tabla de
 * picar de madera oscura) queda bajo una luz cálida de foco con sombras reales; detrás, guirnaldas de lucecitas y las velas
 * de la torta se vuelven bokeh. Luz de contorno fría para separar las siluetas, oclusión ambiental y color más profundo.
 * Devuelve cómo deshacerlo todo (el constructor vuelve exactamente a como estaba).
 */
export interface FightSet {
  restore(): void;
  /** Baja la calidad de a poco si el cuadro tarda (1: sin oclusión, 2: sin desenfoque, 3: menos resolución). */
  degrade(level: number): void;
  update(dt: number): void;
  /** Foco de cara de cada luchador: se para delante de su cara (del lado del rival y de la cámara) y la ilumina. */
  track(i: 0 | 1, head: THREE.Vector3, facing: 1 | -1): void;
  /** Luces del show, 0..1 (también las lucecitas y el entorno): para la entrada de la presentación. */
  lights(k: number): void;
  /** Vela de la presentación: posición y brillo (0 = apagada). */
  candle(at: THREE.Vector3 | null, k: number): void;
}

interface Hide {
  obj: THREE.Object3D;
  was: boolean;
}

let boardTex: THREE.Texture | null = null;
/** La foto de la tabla se carga antes de entrar: si no, los primeros cuadros la muestran negra. */
export async function preloadFightSet(): Promise<void> {
  if (boardTex) return;
  const tex = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/fight/tabla.jpg`).catch(() => null);
  if (!tex) return;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(1, 0.9); // tabla de 50 × 32 cm sobre una foto de 16:9
  tex.offset.set(0, 0.05);
  boardTex = tex;
}

/**
 * Lo propio de la pelea (focos, haz con polvo, tabla, restos de fiesta, lucecitas): se arma UNA vez y queda guardado entre
 * peleas (y lo arma antes el ensayo invisible `prewarmFight`, así PELEAR no traba).
 */
interface Arena {
  objects: THREE.Object3D[];
  update(t: number): void;
  track(i: 0 | 1, head: THREE.Vector3, facing: 1 | -1): void;
  resetTrack(): void;
  /** Nivel de las luces del show (0 apagadas … 1 a pleno): para el apagón y la entrada de la presentación. */
  level(k: number): void;
  /** La vela de la presentación: dónde está y cuánto alumbra (0 = apagada). */
  candle(at: THREE.Vector3 | null, k: number): void;
}

let arenaCache: { z0: number; arena: Arena } | null = null;

function getArena(z0: number): Arena {
  if (arenaCache && arenaCache.z0 === z0) return arenaCache.arena;
  const objects: THREE.Object3D[] = [];
  const add = (...o: THREE.Object3D[]): void => {
    objects.push(...o);
  };
  // Foco cenital apenas detrás de la arena: el cono de luz baja sobre la tabla (se ve el haz con polvo) y las sombras de los
  // luchadores caen hacia adelante, sobre la madera. Alcance limitado: no ilumina la pared.
  const keyPos = new THREE.Vector3(0.02, 0.62, z0 - 0.12);
  const keyAim = new THREE.Vector3(0, GROUND, z0 + 0.02);
  const key = new THREE.SpotLight(0xffe2bc, 9, 1.0, 0.31, 0.75, 0);
  key.position.copy(keyPos);
  key.target.position.copy(keyAim);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.3;
  key.shadow.camera.far = 0.9;
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.0006;
  key.shadow.radius = 5;
  // Focos de cara, uno por luchador (sin sombra: son baratos): siguen a cada uno y le iluminan la cara de 3/4, del lado del
  // rival y de la cámara. Al darse vuelta, el foco se cambia de lado con él.
  const faces = [0, 1].map(() => {
    const l = new THREE.SpotLight(0xfff0dc, 3.2, 0.42, 0.42, 1, 0);
    l.position.set(0, 0.1, z0 + 0.2);
    l.target.position.set(0, 0.05, z0);
    return l;
  });
  const faceInit = [false, false];
  // Contorno frío desde atrás, angosto: recorta las siluetas sin iluminar la mesa del fondo.
  const rim = new THREE.SpotLight(0xa9c6ff, 5, 0.9, 0.2, 0.7, 0);
  rim.position.set(0.12, 0.3, z0 - 0.48);
  rim.target.position.set(0, 0.03, z0);
  // Relleno mínimo (es direccional: alcanza todo el cuarto; la cara ya la iluminan los focos de cara).
  const fill = new THREE.DirectionalLight(0xffd8c0, 0.05);
  fill.position.set(0.4, 0.12, z0 + 0.5);
  fill.target.position.set(0, 0.03, z0);
  // Resplandor cálido de las guirnaldas sobre la pared y la mesa del fondo.
  const glowA = new THREE.PointLight(0xffb070, 0.012, 1.4, 2);
  glowA.position.set(-0.4, 0.32, -0.9);
  const glowB = glowA.clone();
  glowB.position.set(0.45, 0.3, -0.95);
  // Vela de la presentación (apagada fuera de ella). Va siempre en la escena: así no cambia la cantidad de luces (no recompila).
  const candle = new THREE.PointLight(0xff9a3c, 0, 0.12, 2);
  add(key, key.target, rim, rim.target, fill, fill.target, glowA, glowB, candle, ...faces, ...faces.map((l) => l.target));
  const showLights = [key, rim, fill, glowA, glowB, ...faces];
  const baseI = showLights.map((l) => l.intensity);

  // ── Haz de luz del foco: un cono aditivo, brillante en el centro y suave en los bordes, con polvo flotando adentro. ──
  const beamH = keyPos.distanceTo(keyAim);
  // El haz que se VE es el corazón del foco (una columna, como en el arte clave), no todo el cono: si no, vela el fondo.
  const beamR = 0.075;
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(1, 0.8, 0.56) }, uOpacity: { value: 0.1 } },
    vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
      void main() { vH = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vH; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        // uv.y: 0 en la tabla, 1 en el foco. Se apoya suave en la madera, más intenso arriba y se apaga cerca de la lámpara.
        float h = smoothstep(0.0, 0.05, vH) * (1.0 - smoothstep(0.82, 1.0, vH)) * (0.55 + 0.45 * vH);
        gl_FragColor = vec4(uColor * f * h * uOpacity, 1.0); }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, beamR, beamH, 40, 1, true), beamMat);
  beam.position.lerpVectors(keyPos, keyAim, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), keyPos.clone().sub(keyAim).normalize());
  beam.renderOrder = 2;
  beam.userData.noPick = true;
  add(beam);
  const DUST = 260;
  const dust = new Float32Array(DUST * 3);
  const motes = Array.from({ length: DUST }, (_, i) => ({ a: (i * 2.39996) % (Math.PI * 2), r: Math.sqrt(((i * 0.618) % 1) * 0.9), h: (i * 0.377) % 1, sp: 0.004 + ((i * 0.53) % 1) * 0.008, ph: i }));
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustMat = new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.25, 0.85), map: dotTex, size: 0.0016, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
  const motesObj = new THREE.Points(dustGeo, dustMat);
  motesObj.frustumCulled = false;
  add(motesObj);
  const axis = keyPos.clone().sub(keyAim).normalize();
  const side1 = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();
  const side2 = new THREE.Vector3().crossVectors(axis, side1);
  const placeDust = (time: number): void => {
    const p = new THREE.Vector3();
    motes.forEach((m, i) => {
      // Suben y bajan lento, girando apenas: polvo en el aire, sólo visible donde lo toca la luz.
      const h = (m.h + time * m.sp * 0.3) % 1;
      const along = 0.05 + h * 0.8;
      const rr = (beamR * (1 - along) + 0.012 * along) * m.r;
      const a = m.a + Math.sin(time * 0.3 + m.ph) * 0.4;
      p.copy(keyAim).addScaledVector(axis, along * beamH).addScaledVector(side1, Math.cos(a) * rr).addScaledVector(side2, Math.sin(a) * rr);
      dust[3 * i] = p.x;
      dust[3 * i + 1] = p.y;
      dust[3 * i + 2] = p.z;
    });
    dustGeo.attributes.position.needsUpdate = true;
  };
  placeDust(0);

  // ── Arena: tabla de picar de haya (foto generada de una tabla usada: vetas, tablillas pegadas, marcas de cuchillo y
  //    manchas), aceitada y mate para que no espeje el cuarto; el relieve sale de la misma foto. ──
  // Gris neutro: oscurece la haya sin correrle el tono (bajo el foco cálido se iba a naranja y el chizito amarillo se perdía).
  const wood = new THREE.MeshPhysicalMaterial({ color: '#6c7c86', map: boardTex, bumpMap: boardTex, bumpScale: 0.6, roughness: 0.62, specularIntensity: 0.3, envMapIntensity: 0.35 });
  if (!boardTex) wood.color.set('#7a5a40');
  // Tabla grande (50 × 32 cm), corrida hacia atrás: el foco cae entero sobre la madera, no sobre el mantel.
  const board = new THREE.Mesh(new RoundedBoxGeometry(BOARD.w, GROUND, BOARD.d, 4, 0.004), wood);
  board.position.set(0, GROUND / 2, z0 + BOARD.dz);
  board.receiveShadow = true;
  board.castShadow = true;
  add(board);

  // ── Restos de cumpleaños en capas: detrás de los luchadores (bollo de servilleta, carozos, caramelos) y delante, contra la
  //    cámara (desenfocados por la profundidad de campo). Dan escala y profundidad: los luchadores miden lo que un caramelo.
  //    Lo que cae dentro de la tabla se apoya en ella; lo de afuera, en el mantel. ──
  type Item = Parameters<typeof litter>[0][number];
  const items: Item[] = [
    { kind: 'pit', x: -0.115, z: z0 - 0.105, rot: 0.4 },
    { kind: 'pit', x: -0.1, z: z0 - 0.125, rot: 2.1 },
    { kind: 'candy', x: 0.15, z: z0 - 0.125, rot: 0.35, flavor: 2 },
    { kind: 'candy', x: 0.178, z: z0 - 0.16, rot: -0.5, flavor: 0 },
    { kind: 'candy', x: 0.125, z: z0 - 0.175, rot: 1.1, flavor: 4 },
    { kind: 'candy', x: -0.3, z: z0 - 0.2, rot: 0.9, flavor: 3 },
    // Delante, contra la cámara: sobre el borde de la tabla tapan apenas los pies al pasar.
    { kind: 'pit', x: -0.045, z: z0 + 0.06, rot: 0.8 },
    { kind: 'candy', x: 0.2, z: z0 + 0.06, rot: 0.3, flavor: 0 },
    { kind: 'candy', x: -0.11, z: z0 + 0.13, rot: 0.25, flavor: 1 },
    { kind: 'pit', x: 0.06, z: z0 + 0.125, rot: 1.3 },
  ];
  const onWood = (it: Item): boolean => Math.abs(it.x) < BOARD.w / 2 - 0.012 && Math.abs(it.z - (z0 + BOARD.dz)) < BOARD.d / 2 - 0.012;
  const onBoard = litter(items.filter(onWood), 23);
  onBoard.position.y = GROUND;
  add(onBoard, litter(items.filter((it) => !onWood(it)), 11));

  const arena: Arena = {
    objects,
    update(t) {
      placeDust(t);
    },
    track(i, head, facing) {
      // Delante de la cara: hacia el rival, hacia la cámara y un poco arriba; se mueve suave (al darse vuelta cruza).
      const l = faces[i];
      const want = new THREE.Vector3(head.x + facing * 0.1, head.y + 0.06, z0 + 0.17);
      if (!faceInit[i]) l.position.copy(want);
      else l.position.lerp(want, 0.18);
      faceInit[i] = true;
      l.target.position.set(head.x, head.y, z0);
    },
    resetTrack() {
      faceInit[0] = faceInit[1] = false;
    },
    level(k) {
      showLights.forEach((l, i) => (l.intensity = baseI[i] * k));
      beamMat.uniforms.uOpacity.value = 0.1 * k;
      dustMat.opacity = 0.75 * k;
    },
    candle(at, k) {
      if (at) candle.position.copy(at);
      candle.intensity = k;
    },
  };
  arenaCache = { z0, arena };
  return arena;
}

/**
 * Ensayo invisible de la pelea, en un rato libre mientras se arma el chizito: la arena se arma y los shaders de TODA la escena
 * se compilan con la luz de la pelea (en paralelo, con KHR_parallel_shader_compile), sin agregar nada a lo que se ve. Así, al
 * apretar PELEAR no hay que recompilar todo (cambiar la cantidad de luces obliga a rehacer cada shader).
 */
export async function prewarmFight(s: Stage, z0: number, extra: THREE.Object3D[] = [], heroes: THREE.Object3D[] = []): Promise<void> {
  await preloadFightSet();
  const arena = getArena(z0);
  const rehearsal = new THREE.Scene();
  rehearsal.environment = s.scene.environment;
  rehearsal.add(...arena.objects, ...extra);
  // Como en la pelea: el sol sin sombra y los luchadores proyectando y recibiendo la del foco.
  const sunCast = s.sun.castShadow;
  s.sun.castShadow = false;
  const flags: { m: THREE.Mesh; c: boolean; r: boolean }[] = [];
  for (const h of [...heroes, ...extra]) {
    h.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      flags.push({ m, c: m.castShadow, r: m.receiveShadow });
      m.castShadow = m.receiveShadow = true;
    });
  }
  // La escena se dibuja en el buffer del posprocesado (no en la pantalla): eso cambia la variante del shader (espacio de color
  // de salida), así que se compila con ese mismo destino.
  const prevTarget = s.renderer.getRenderTarget();
  s.renderer.setRenderTarget(s.composer.inputBuffer);
  try {
    s.renderer.compile(s.scene, s.camera, rehearsal);
    const done = s.renderer.compileAsync(rehearsal, s.camera, s.scene);
    s.renderer.setRenderTarget(prevTarget);
    for (const f of flags) {
      f.m.castShadow = f.c;
      f.m.receiveShadow = f.r;
    }
    s.sun.castShadow = sunCast;
    // Texturas a la GPU de a una (la del brócoli es grande).
    rehearsal.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m) return;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.bumpMap]) if (t) s.renderer.initTexture(t);
    });
    await done;
  } finally {
    s.renderer.setRenderTarget(prevTarget);
    for (const f of flags) {
      f.m.castShadow = f.c;
      f.m.receiveShadow = f.r;
    }
    s.sun.castShadow = sunCast;
    rehearsal.remove(...arena.objects, ...extra);
  }
}

export function enterFightSet(s: Stage, z0: number, fighters: THREE.Object3D[], extraHidden: THREE.Object3D[] = []): FightSet {
  const scene = s.scene;
  const added: THREE.Object3D[] = [];
  const add = (...o: THREE.Object3D[]): void => {
    scene.add(...o);
    added.push(...o);
  };
  const hidden: Hide[] = [];
  const hide = (obj: THREE.Object3D | undefined | null): void => {
    if (!obj || !obj.visible) return;
    hidden.push({ obj, was: obj.visible });
    obj.visible = false;
  };

  // ── Mesa despejada: se van los recipientes del frente y la sombra que compartían (la mancha oscura sobre el mantel). ──
  const backdrop = scene.getObjectByName('backdrop');
  backdrop?.children.filter((c) => c.name !== 'mesa' && c.name !== 'far-props').forEach(hide);
  extraHidden.forEach(hide);

  // ── De noche (como el arte clave): el cuarto casi negro, sólo lucecitas y velas; la luz es la del show sobre la arena. ──
  const env = { e: scene.environmentIntensity, b: scene.backgroundIntensity };
  scene.environmentIntensity = env.e * 0.06;
  scene.backgroundIntensity = env.b * 0.05;
  const sun = { i: s.sun.intensity, cast: s.sun.castShadow };
  s.sun.intensity = sun.i * 0.02;
  s.sun.castShadow = false;

  const arena = getArena(z0);
  arena.resetTrack();
  add(...arena.objects);
  // Las lucecitas del constructor (las mismas) se encienden a pleno.
  const bulbs = scene.getObjectByName(BULBS_NAME)?.userData.bulbs as Bulbs | undefined;
  const bulbsWas = bulbs?.level ?? 0;
  if (bulbs) bulbs.level = 1;

  // Los luchadores proyectan la sombra del foco (en el constructor usan sólo la sombra de contacto).
  const casters: { m: THREE.Mesh; cast: boolean }[] = [];
  for (const f of fighters) {
    f.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        casters.push({ m, cast: m.castShadow });
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  // ── Color y postprocesado: más contraste y profundidad, negros sin lavar, brillo en las luces. ──
  const u = s.look.uniforms;
  const lookWas = { sat: u.get('saturation')!.value as number, con: u.get('contrast')!.value as number, lift: (u.get('lift')!.value as THREE.Vector3).clone() };
  u.get('saturation')!.value = lookWas.sat + 0.06;
  u.get('contrast')!.value = lookWas.con + 0.1;
  // Sombras apenas frías (azul petróleo, como el arte clave): el negro no se embarra de rojo con la luz cálida.
  (u.get('lift')!.value as THREE.Vector3).set(0, 0.004, 0.011);
  const vigWas = s.vignette.darkness;
  s.vignette.darkness = 0.55;
  const dofWas = { band: s.dof.focusBand, ramp: s.dof.blurRamp, max: s.dof.maxBlur, en: s.dof.enabled };
  s.dof.focusBand = 1.6;
  s.dof.blurRamp = 2.0;
  s.dof.maxBlur = Math.max(dofWas.max, 0.03);
  const ao = s.composer.passes.find((p) => 'configuration' in p && 'aoRadius' in (p as unknown as { configuration: object }).configuration) as
    | (THREE.Object3D & { enabled: boolean; configuration: { aoRadius: number; intensity: number } })
    | undefined;
  const aoWas = ao ? { en: ao.enabled, r: ao.configuration.aoRadius, i: ao.configuration.intensity } : null;
  if (ao) {
    ao.enabled = true;
    ao.configuration.aoRadius = 0.008;
    ao.configuration.intensity = 2.2;
  }
  const prWas = s.renderer.getPixelRatio();
  const setPR = (pr: number): void => {
    s.renderer.setPixelRatio(pr);
    s.resize();
  };
  setPR(Math.min(1.25, prWas));

  let t = 0;
  return {
    update(dt) {
      t += dt;
      arena.update(t);
    },
    track(i, head, facing) {
      arena.track(i, head, facing);
    },
    lights(k) {
      arena.level(k);
      if (bulbs) bulbs.level = k;
      scene.environmentIntensity = env.e * 0.06 * (0.15 + 0.85 * k);
    },
    candle(at, k) {
      arena.candle(at, k);
    },
    degrade(lv) {
      if (lv >= 1 && ao) ao.enabled = false;
      if (lv >= 2) s.dof.enabled = false;
      if (lv >= 3) setPR(Math.min(0.8, prWas));
    },
    restore() {
      // La arena queda armada para la próxima pelea: sólo se saca de la escena (con las luces a pleno y la vela apagada).
      arena.level(1);
      arena.candle(null, 0);
      for (const o of added) o.removeFromParent();
      if (bulbs) bulbs.level = bulbsWas;
      for (const h of hidden) h.obj.visible = h.was;
      for (const c of casters) c.m.castShadow = c.cast;
      scene.environmentIntensity = env.e;
      scene.backgroundIntensity = env.b;
      s.sun.intensity = sun.i;
      s.sun.castShadow = sun.cast;
      u.get('saturation')!.value = lookWas.sat;
      u.get('contrast')!.value = lookWas.con;
      (u.get('lift')!.value as THREE.Vector3).copy(lookWas.lift);
      s.vignette.darkness = vigWas;
      Object.assign(s.dof, { focusBand: dofWas.band, blurRamp: dofWas.ramp, maxBlur: dofWas.max, enabled: dofWas.en });
      if (ao && aoWas) {
        ao.enabled = aoWas.en;
        ao.configuration.aoRadius = aoWas.r;
        ao.configuration.intensity = aoWas.i;
      }
      setPR(prWas);
    },
  };
}
