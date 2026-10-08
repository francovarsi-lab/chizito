import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

// ponytail: usamos solo los módulos que ya vienen con el paquete `three`
// (examples/jsm) en vez de sumar `postprocessing` + `n8ao` como dependencias
// nuevas que no pude compilar ni probar en este entorno. El AO real se
// reemplaza por una sombra de contacto suave bajo el chizito; si después
// hace falta AO verdadero, ahí es donde se agregaría N8AOPostPass.

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export const CHIZITO_Y = 0.07; // altura del chizito sobre la mesa

export function createCamera() {
  // ~50mm equivalente en full-frame: fov vertical ≈ 27°
  const camera = new THREE.PerspectiveCamera(27, window.innerWidth / window.innerHeight, 0.01, 10);
  camera.position.set(0, CHIZITO_Y + 0.05, 0.20);
  camera.lookAt(0, CHIZITO_Y, 0);
  return camera;
}

export async function setupEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    const hdrTex = await new RGBELoader().loadAsync('/assets/hdri/interior.hdr');
    scene.environment = pmrem.fromEquirectangular(hdrTex).texture;
    hdrTex.dispose();
  } catch {
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  pmrem.dispose();
}

export function addLights(scene: THREE.Scene) {
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
  sun.position.set(-0.4, 0.6, 0.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.05;
  sun.shadow.camera.far = 1.5;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xfff4e8, 0.5));
}

export function addTable(scene: THREE.Scene) {
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.85 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  // mantel de cumpleaños: franja de color encimada, simple y desenfocada
  const cloth = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 1.2, 32),
    new THREE.MeshStandardMaterial({ color: 0xcf5a4a, roughness: 0.9, transparent: true, opacity: 0.35 }),
  );
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.y = 0.0005;
  scene.add(cloth);

  // contact shadow falso bajo el chizito (el AO real queda pendiente)
  const blobTex = new THREE.CanvasTexture(radialGradientCanvas());
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 24),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.001;
  scene.add(blob);

  return table;
}

function radialGradientCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

export function addBackdrop(scene: THREE.Scene) {
  // Bowls/vasos de fondo desenfocados. Son simples: el desenfoque hace el trabajo.
  const group = new THREE.Group();
  const mk = (color: number, x: number, z: number, r: number, h: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, h, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    group.add(m);
  };
  mk(0xd8d8d8, 0.18, -0.25, 0.05, 0.09); // vaso descartable
  mk(0xe8a33c, -0.3, -0.3, 0.07, 0.04);  // bowl chizitos fondo
  mk(0xcc3333, 0.32, -0.22, 0.03, 0.08); // gaseosa
  scene.add(group);
  return group;
}

export function createComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 0.205, aperture: 0.00055, maxblur: 0.01 });
  composer.addPass(bokeh);
  return { composer, bokeh };
}

export function onResize(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, composer: EffectComposer) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });
}
