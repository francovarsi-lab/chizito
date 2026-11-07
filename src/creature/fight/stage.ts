import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { litter } from '../../render/PartyProps';
import type { Stage } from '../../render/Stage';

/** m: alto de la tabla de picar donde se pelea (el piso de la pelea queda a esta altura sobre el mantel). */
export const GROUND = 0.012;

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
  tex.repeat.set(1, 0.57); // tabla de 44 × 14 cm sobre una foto de 16:9
  tex.offset.set(0, 0.2);
  boardTex = tex;
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

  // ── De noche: el cuarto y el sol se apagan casi del todo; la luz es la del foco sobre la arena. ──
  const env = { e: scene.environmentIntensity, b: scene.backgroundIntensity };
  scene.environmentIntensity = env.e * 0.14;
  scene.backgroundIntensity = env.b * 0.12;
  const sun = { i: s.sun.intensity, cast: s.sun.castShadow };
  s.sun.intensity = sun.i * 0.06;
  s.sun.castShadow = false;

  // Foco angosto: la luz cae sobre la arena y el resto del cuarto queda en penumbra.
  const key = new THREE.SpotLight(0xffe4c4, 7, 1.2, 0.27, 0.8, 0);
  key.position.set(-0.18, 0.5, z0 + 0.38);
  key.target.position.set(0, 0.02, z0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 1.4;
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.0006;
  key.shadow.radius = 5;
  // Contorno frío desde atrás, angosto: recorta las siluetas sin iluminar la mesa del fondo.
  const rim = new THREE.SpotLight(0xa9c6ff, 5, 0.9, 0.2, 0.7, 0);
  rim.position.set(0.12, 0.3, z0 - 0.48);
  rim.target.position.set(0, 0.03, z0);
  const fill = new THREE.DirectionalLight(0xffd8c0, 0.2);
  fill.position.set(0.4, 0.12, z0 + 0.5);
  fill.target.position.set(0, 0.03, z0);
  // Resplandor cálido de las guirnaldas sobre la pared y la mesa del fondo.
  const glowA = new THREE.PointLight(0xffb070, 0.08, 1.4, 2);
  glowA.position.set(-0.4, 0.32, -0.9);
  const glowB = glowA.clone();
  glowB.position.set(0.45, 0.3, -0.95);
  add(key, key.target, rim, rim.target, fill, fill.target, glowA, glowB);

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

  // ── Arena: tabla de picar de haya (foto generada de una tabla usada: vetas, tablillas pegadas, marcas de cuchillo y
  //    manchas), aceitada y mate para que no espeje el cuarto; el relieve sale de la misma foto. ──
  // Gris neutro: oscurece la haya sin correrle el tono (bajo el foco cálido se iba a naranja y el chizito amarillo se perdía).
  const wood = new THREE.MeshPhysicalMaterial({ color: '#b4b4b4', map: boardTex, bumpMap: boardTex, bumpScale: 0.6, roughness: 0.62, specularIntensity: 0.3, envMapIntensity: 0.35 });
  if (!boardTex) wood.color.set('#7a5a40');
  const board = new THREE.Mesh(new RoundedBoxGeometry(0.44, GROUND, 0.14, 4, 0.004), wood);
  board.position.set(0, GROUND / 2, z0);
  board.receiveShadow = true;
  board.castShadow = true;
  add(board);

  // ── Restos de cumpleaños en capas: detrás de la arena (bollo de servilleta, carozos, caramelos) y delante, contra la cámara
  //    (desenfocados por la profundidad de campo). Dan escala y profundidad: los luchadores miden lo que un caramelo. ──
  add(
    litter(
      [
        { kind: 'napkin', x: -0.17, z: z0 - 0.14, rot: 0.6 },
        { kind: 'pit', x: -0.115, z: z0 - 0.105, rot: 0.4 },
        { kind: 'pit', x: -0.1, z: z0 - 0.125, rot: 2.1 },
        { kind: 'candy', x: 0.15, z: z0 - 0.125, rot: 0.35, flavor: 2 },
        { kind: 'candy', x: 0.178, z: z0 - 0.16, rot: -0.5, flavor: 0 },
        { kind: 'candy', x: 0.125, z: z0 - 0.175, rot: 1.1, flavor: 4 },
        { kind: 'napkin', x: 0.3, z: z0 - 0.24, rot: 2.4, size: 0.05 },
        { kind: 'candy', x: -0.3, z: z0 - 0.2, rot: 0.9, flavor: 3 },
        // Delante de la tabla, contra la cámara.
        { kind: 'candy', x: -0.11, z: z0 + 0.1, rot: 0.25, flavor: 1 },
        { kind: 'pit', x: 0.06, z: z0 + 0.092, rot: 1.3 },
        { kind: 'candy', x: 0.21, z: z0 + 0.105, rot: -0.7, flavor: 2 },
        { kind: 'napkin', x: -0.26, z: z0 + 0.11, rot: 0.2, size: 0.035 },
      ],
      11,
    ),
  );
  // Sobre el borde delantero de la tabla, entre la cámara y los pies: tapan apenas a los luchadores al pasar.
  const onBoard = litter(
    [
      { kind: 'pit', x: -0.045, z: z0 + 0.054, rot: 0.8 },
      { kind: 'candy', x: 0.185, z: z0 + 0.05, rot: 0.3, flavor: 0 },
      { kind: 'napkin', x: -0.19, z: z0 + 0.048, rot: 1.7, size: 0.03 },
    ],
    23,
  );
  onBoard.position.y = GROUND;
  add(onBoard);

  // ── Guirnaldas de lucecitas detrás de la mesa: de lejos, con el desenfoque, son círculos de luz. ──
  const bulbsGeo = new THREE.SphereGeometry(1, 10, 8);
  const wireMat = new THREE.MeshStandardMaterial({ color: '#2b2420', roughness: 0.7 });
  const warm = [new THREE.Color(5, 3.6, 1.6), new THREE.Color(5, 2.8, 1.1), new THREE.Color(4.2, 3.9, 3.2)];
  const party = [new THREE.Color(4.5, 1.4, 2.2), new THREE.Color(1.4, 3.6, 3.4), new THREE.Color(4.6, 3.4, 0.9)];
  const bulbs: { m: THREE.Mesh; base: THREE.Color; ph: number }[] = [];
  const strand = (a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number, r: number, colorful: boolean): void => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, r * 0.12, 4), wireMat));
    for (let i = 0; i < n; i++) {
      const base = (colorful && i % 3 === 1 ? party : warm)[i % 3].clone();
      const mat = new THREE.MeshBasicMaterial({ color: base.clone(), toneMapped: false });
      const m = new THREE.Mesh(bulbsGeo, mat);
      m.scale.set(r, r * 1.3, r);
      m.position.copy(curve.getPointAt((i + 0.5) / n)).add(new THREE.Vector3(0, -r * 1.4, 0));
      add(m);
      bulbs.push({ m, base, ph: i * 1.7 });
    }
  };
  strand(new THREE.Vector3(-0.7, 0.2, z0 - 0.55), new THREE.Vector3(0.7, 0.19, z0 - 0.6), 0.07, 34, 0.0042, true);
  strand(new THREE.Vector3(-1.0, 0.42, -1.18), new THREE.Vector3(1.0, 0.4, -1.18), 0.12, 46, 0.007, false);
  strand(new THREE.Vector3(-0.9, 0.3, -1.05), new THREE.Vector3(0.6, 0.28, -1.1), 0.08, 30, 0.006, true);

  // ── Color y postprocesado: más contraste y profundidad, negros sin lavar, brillo en las luces. ──
  const u = s.look.uniforms;
  const lookWas = { sat: u.get('saturation')!.value as number, con: u.get('contrast')!.value as number, lift: (u.get('lift')!.value as THREE.Vector3).clone() };
  u.get('saturation')!.value = lookWas.sat + 0.06;
  u.get('contrast')!.value = lookWas.con + 0.1;
  (u.get('lift')!.value as THREE.Vector3).set(0, 0, 0);
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
      // Titileo leve, como lucecitas reales.
      for (const b of bulbs) b.m.scale.y = b.m.scale.x * (1.3 + 0.04 * Math.sin(t * 3 + b.ph));
      for (const b of bulbs) (b.m.material as THREE.MeshBasicMaterial).color.copy(b.base).multiplyScalar(0.9 + 0.1 * Math.sin(t * 2.3 + b.ph));
    },
    degrade(lv) {
      if (lv >= 1 && ao) ao.enabled = false;
      if (lv >= 2) s.dof.enabled = false;
      if (lv >= 3) setPR(Math.min(0.8, prWas));
    },
    restore() {
      for (const o of added) {
        o.removeFromParent();
        o.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.geometry?.dispose();
            if (m.material !== wireMat && m.material !== wood) (m.material as THREE.Material).dispose();
          }
        });
        if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
      }
      wireMat.dispose();
      wood.dispose(); // la foto de la tabla queda en caché para la próxima pelea
      bulbsGeo.dispose();
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
