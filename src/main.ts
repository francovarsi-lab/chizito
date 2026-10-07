import * as THREE from 'three';
import { AssetRegistry } from './assets/AssetRegistry';
import { CONFIG } from './config';
import { Input } from './input/Input';
import { InteractionController } from './interaction/InteractionController';
import { TrackballRotator } from './interaction/TrackballRotator';
import { Construction } from './model/Construction';
import { ALL_DEFINITIONS, CHIZITO } from './pieces/definitions';
import { PieceRegistry } from './pieces/PieceRegistry';
import { buildBackdrop } from './render/Backdrop';
import { setupEnvironment } from './render/Environment';
import { Stage } from './render/Stage';
import { ContactShadow, markHero } from './render/ContactShadow';
import { addPhotoFade, loadPhotoBackdrop, updatePhotoResolution } from './render/PhotoBackdrop';

async function main() {
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  document.body.prepend(canvas);
  const params = new URLSearchParams(location.search);

  const stage = new Stage(canvas);
  const pieces = new PieceRegistry();
  ALL_DEFINITIONS.forEach((d) => pieces.register(d));
  const assets = new AssetRegistry(pieces);
  await assets.init();
  const envKind = await setupEnvironment(stage.renderer, stage.scene);

  const backdrop = buildBackdrop(assets);
  stage.scene.add(backdrop.root);

  // Telón fotográfico opcional (public/assets/backdrop.jpg): reemplaza la pared y el fondo modelado.
  const photo = await loadPhotoBackdrop(stage.camera);
  if (photo) {
    stage.scene.add(photo.mesh);
    backdrop.farProps.visible = false;
    for (const m of backdrop.surfaces) addPhotoFade(m.material as THREE.Material, photo, CONFIG.photoBackdrop.fadeStart, CONFIG.photoBackdrop.fadeEnd);
    stage.dof.photoDistance = CONFIG.photoBackdrop.distance;
    updatePhotoResolution(photo, stage.renderer);
    window.addEventListener('resize', () => {
      photo.layout();
      updatePhotoResolution(photo, stage.renderer);
    });
  }

  // Chizito central: raíz del árbol de piezas. El pivote es el objeto que rota.
  const rootSeed = Number(params.get('seed') ?? 3);
  const pivot = new THREE.Group();
  pivot.name = 'chizito-root';
  pivot.position.copy(CONFIG.chizitoCenter);
  const chizitoModel = assets.create(CHIZITO.type, rootSeed, 'hero');
  pivot.add(chizitoModel);
  // Orientación inicial: levemente girado, como si lo hubieran dejado así.
  pivot.quaternion.setFromEuler(new THREE.Euler(0.18, -0.38, 0.06));
  stage.scene.add(pivot);
  markHero(pivot);
  const contactShadow = new ContactShadow(stage.scene, CONFIG.chizitoCenter);
  stage.scene.add(contactShadow.decal);
  const construction = new Construction(CHIZITO.type, rootSeed, pivot);

  const input = new Input(canvas);
  const rotator = new TrackballRotator(pivot, stage.camera);
  const interaction = new InteractionController(input, rotator);

  const help = document.getElementById('help')!;
  interaction.onFirstInteraction = () => setTimeout(() => help.classList.add('hidden'), 1200);
  input.onKey((e) => {
    if (e.code === 'KeyH') help.classList.toggle('hidden');
  });

  // Exponer para depuración y capturas automáticas.
  Object.assign(window as unknown as Record<string, unknown>, {
    __chizito: { stage, construction, pivot, rotator, envKind, THREE, contactShadow },
  });

  const timer = new THREE.Timer();
  const frame = (dt: number) => {
    interaction.update(dt);
    stage.focusTarget.copy(CONFIG.chizitoCenter);
    contactShadow.update(stage.renderer);
    stage.render(dt);
  };

  if (params.has('capture')) {
    // Modo captura (Playwright con WebGL por software): se renderiza bajo demanda.
    Object.assign((window as unknown as { __chizito: object }).__chizito, {
      renderFrames: (n: number, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) frame(dt);
        return canvas.toDataURL('image/png');
      },
    });
    frame(1 / 60);
    document.body.dataset.ready = '1';
    return;
  }

  let frames = 0;
  const loop = (t: number) => {
    timer.update(t);
    frame(Math.min(timer.getDelta(), 1 / 20));
    if (++frames === 3) document.body.dataset.ready = '1';
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((err) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
