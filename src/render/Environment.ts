import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { CONFIG } from '../config';
import { probeFile } from '../assets/probe';

/**
 * Iluminación por imagen. Si existe public/assets/hdri/interior.hdr se usa como entorno y fondo;
 * si no, se genera un living cálido procedural (ventana de tarde, lámpara, muebles, banderines)
 * y se procesa con PMREM. En ambos casos la luz direccional de "ventana" sigue activa.
 */
export async function setupEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<'hdri' | 'procedural'> {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = CONFIG.environment;
  const url = `${import.meta.env.BASE_URL}${env.hdriUrl}`;
  const buf = await probeFile(url, '#?');
  if (buf) {
    try {
      const blobUrl = URL.createObjectURL(new Blob([buf]));
      const tex = await new HDRLoader().setDataType(THREE.HalfFloatType).loadAsync(blobUrl);
      URL.revokeObjectURL(blobUrl);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      scene.background = tex;
      scene.environmentIntensity = env.hdriIntensity;
      scene.backgroundIntensity = env.hdriBackgroundIntensity;
      scene.backgroundBlurriness = env.backgroundBlurriness;
      scene.environmentRotation.set(0, env.hdriRotationY, 0);
      scene.backgroundRotation.set(0, env.hdriRotationY, 0);
      pmrem.dispose();
      console.info('[env] usando HDRI', env.hdriUrl);
      return 'hdri';
    } catch (err) {
      console.warn('[env] no se pudo leer el HDRI, uso el entorno procedural', err);
    }
  }

  const room = buildRoom();
  scene.environment = pmrem.fromScene(room, 0.02, 0.05, 30).texture;
  scene.environmentIntensity = env.proceduralIntensity;
  // Fondo nítido aparte (la profundidad de campo se encarga del desenfoque).
  const rt = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.05, 30, rt);
  cubeCam.position.copy(CONFIG.camera.position);
  room.add(cubeCam);
  cubeCam.update(renderer, room);
  scene.background = rt.texture;
  scene.backgroundBlurriness = 0;
  scene.backgroundIntensity = 1;
  pmrem.dispose();
  return 'procedural';
}

/** Radiancia lineal (los valores > 1 son fuentes de luz). */
function rad(hex: string, k = 1): THREE.MeshBasicMaterial {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, toneMapped: false });
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * Living/comedor de cumpleaños visto desde la mesa. Origen = tablero de la mesa bajo el chizito.
 * Paredes a ~2,5 m; todo se ve muy desenfocado, importa la distribución de luz y color.
 */
function buildRoom(): THREE.Scene {
  const s = new THREE.Scene();
  const floorY = -0.78;
  const ceilY = 1.85;
  const W = 2.3;
  const back = -2.7;
  const front = 2.2;
  const H = ceilY - floorY;
  const midY = (ceilY + floorY) / 2;

  const wall = rad('#f7e6e2', 0.85);
  const wallShade = rad('#efdcd9', 0.68);
  // Paredes
  s.add(box(0.02, H, front - back, wall, -W, midY, (front + back) / 2));
  s.add(box(0.02, H, front - back, wallShade, W, midY, (front + back) / 2));
  s.add(box(2 * W, H, 0.02, wall, 0, midY, back));
  s.add(box(2 * W, H, 0.02, wallShade, 0, midY, front));
  // Piso de madera y techo
  s.add(box(2 * W, 0.02, front - back, rad('#e8d2bf', 0.6), 0, floorY, (front + back) / 2));
  s.add(box(2 * W, 0.02, front - back, rad('#efe6da', 0.42), 0, ceilY, (front + back) / 2));
  // Zócalo
  s.add(box(2 * W, 0.1, 0.03, rad('#e9e1d4', 0.4), 0, floorY + 0.05, back + 0.02));

  // Ventana grande adelante a la izquierda (detrás del espectador): luz de tarde,
  // coherente con la luz direccional (CONFIG.light.direction).
  const winMat = rad('#fff4e6', 11);
  s.add(box(1.5, 1.35, 0.03, winMat, -0.55, 1.05, front - 0.02));
  const frameMat = rad('#d9cbb8', 0.6);
  s.add(box(0.05, 1.45, 0.05, frameMat, -0.55, 1.05, front - 0.04));
  s.add(box(1.6, 0.05, 0.05, frameMat, -0.55, 1.05, front - 0.04));
  // Cielo más frío en la parte alta de la ventana.
  s.add(box(1.5, 0.35, 0.025, rad('#bcd4f0', 6), -0.55, 1.55, front - 0.035));
  // Cortinas
  s.add(box(0.35, 1.9, 0.06, rad('#b4553d', 0.35), -1.45, 0.75, front - 0.08));
  s.add(box(0.35, 1.9, 0.06, rad('#b4553d', 0.35), 0.35, 0.75, front - 0.08));
  // Manchas de sol en el piso y en la pared del fondo a la derecha
  s.add(box(1.0, 0.01, 1.3, rad('#ffe9cc', 2.2), 0.3, floorY + 0.015, 0.2));
  s.add(box(0.9, 0.8, 0.01, rad('#ffe9cc', 1.4), 1.6, 0.5, back + 0.02));

  // Lámpara de techo cálida
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 24), rad('#ffd9a6', 7));
  lamp.position.set(0.1, ceilY - 0.25, -0.6);
  s.add(lamp);

  // Pared del fondo: aparador, cuadros, puerta, planta.
  s.add(box(1.7, 0.85, 0.45, rad('#a97c57', 0.5), -0.5, floorY + 0.425, back + 0.25));
  s.add(box(1.7, 0.03, 0.47, rad('#c09670', 0.55), -0.5, floorY + 0.86, back + 0.25));
  s.add(box(0.5, 0.38, 0.02, rad('#7d8c96', 0.6), -0.85, 0.75, back + 0.03));
  s.add(box(0.42, 0.3, 0.025, rad('#e8d9b5', 0.7), -0.85, 0.75, back + 0.04));
  s.add(box(0.35, 0.45, 0.02, rad('#c0705c', 0.6), -0.2, 0.8, back + 0.03));
  s.add(box(0.9, 2.05, 0.03, rad('#d8c6ae', 0.6), 1.35, floorY + 1.025, back + 0.03));
  // Lámpara de pie en el rincón (punto cálido de bokeh)
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 20), rad('#ffd7a0', 4.5));
  shade.position.set(2.0, 0.85, -2.3);
  s.add(shade);
  // Abanico de papel de cumpleaños colgado en la pared (antes una planta: una mancha oscura enorme
  // detrás de las guirnaldas en el plano general de la intro).
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), rad('#ffc9d6', 0.85));
  fan.position.set(0.45, floorY + 1.3, back + 0.06);
  s.add(fan);
  const fanCenter = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), rad('#fff1c9', 0.95));
  fanCenter.position.set(0.45, floorY + 1.3, back + 0.07);
  s.add(fanCenter);

  // Banderines de cumpleaños cruzando la pared del fondo.
  const colors = ['#ffb7c8', '#ffe29a', '#b8dcf5', '#bfe8cf', '#d8c8f5', '#ffd0b0'];
  const tri = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.09, 0, 0),
    new THREE.Vector3(0.09, 0, 0),
    new THREE.Vector3(0, -0.2, 0),
  ]);
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const x = -W + 0.3 + t * (2 * W - 0.6);
    const y = 1.55 - Math.sin(t * Math.PI) * 0.35;
    const m = new THREE.Mesh(tri, rad(colors[i % colors.length], 0.75));
    m.position.set(x, y, back + 0.08);
    s.add(m);
  }
  // Globos
  const balloons: [string, number, number, number][] = [
    ['#ffb3c6', 1.15, 1.1, -2.35],
    ['#ffe08f', 1.45, 1.25, -2.4],
    ['#a9d4f5', 1.3, 0.85, -2.2],
    ['#d6c4f7', -1.7, 1.2, -2.3],
    ['#b5e6c8', -1.95, 1.0, -2.1],
  ];
  for (const [c, x, y, z] of balloons) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), rad(c, 0.85));
    b.scale.set(1, 1.2, 1);
    b.position.set(x, y, z);
    s.add(b);
  }
  // Silla y sillón a la derecha
  s.add(box(0.5, 0.9, 1.6, rad('#b49a84', 0.5), W - 0.35, floorY + 0.45, -1.2));
  s.add(box(0.45, 0.06, 0.45, rad('#7a5236', 0.35), 0.9, floorY + 0.45, -1.4));
  return s;
}
