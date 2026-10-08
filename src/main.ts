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
import { Picker } from './interaction/Picker';
import { Overlay } from './ui/Overlay';
import { AudioManager } from './audio/AudioManager';
import { Crumbs } from './fx/Crumbs';
import { Shake } from './fx/Shake';
import { CameraRig } from './render/CameraRig';
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

  // Cámara casi fija con zoom (rueda): se acerca/aleja en línea recta hacia el chizito.
  const rig = new CameraRig(stage.camera, CONFIG.camera.target, CONFIG.camera.position, CONFIG.camera.minDistance, CONFIG.camera.maxDistance, CONFIG.camera.distance);
  photo?.layout();
  const input = new Input(canvas);
  input.onWheel((e) => {
    if (!e.ctrl) rig.zoom(e.dy);
  });
  const rotator = new TrackballRotator(pivot, stage.camera);
  const overlay = new Overlay();
  const picker = new Picker(stage.camera, construction, pieces, backdrop.bowls);
  const interaction = new InteractionController({
    input,
    rotator,
    camera: stage.camera,
    scene: stage.scene,
    picker,
    construction,
    pieces,
    assets,
    overlay,
    center: CONFIG.chizitoCenter,
  });

  // Feedback del clavado: micro-sacudida del chizito, crack + crujido, migas que caen a la mesa.
  const audio = new AudioManager();
  const crumbs = new Crumbs(stage.scene);
  const shake = new Shake(pivot, CONFIG.chizitoCenter);
  let crumbBudget = 0;
  interaction.onReset = () => crumbs.clear();
  interaction.onEvent = (e, info) => {
    switch (e) {
      case 'pick':
        audio.play('pick');
        break;
      case 'drop':
      case 'remove':
        audio.play('drop');
        break;
      case 'contact':
        if (!info) break;
        audio.play('crack', info.def.type === 'papita' ? 0.75 : 1);
        shake.kick(info.dir, info.def.type === 'papita' ? 0.07 : 0.1);
        shake.squash(info.def.type === 'papita' ? 0.012 : 0.018);
        crumbs.emit(info.point, info.normal, 2);
        if (info.parent) crumbs.stick(info.parent, info.localPoint, info.localNormal, 1 + Math.round(Math.random()));
        crumbBudget = 2; // "2 o 3 migas" por clavada: 2 al contacto y hasta 2 más mientras entra
        break;
      case 'inserting':
        if (!info) break;
        shake.tremble(0.7);
        if (Math.random() < info.dt * 16) audio.play('crunch', 0.7 + Math.random() * 0.3);
        if (crumbBudget > 0 && Math.random() < info.dt * 1.4) {
          crumbs.emit(info.point, info.normal, 1);
          crumbBudget--;
        }
        break;
      case 'break':
        audio.play('crack', 0.85);
        if (info) crumbs.emit(info.point, info.normal, 3);
        break;
      case 'out':
        audio.play('out');
        if (info) crumbs.emit(info.point, info.normal, 1);
        break;
    }
  };

  // Exponer para depuración y capturas automáticas.
  Object.assign(window as unknown as Record<string, unknown>, {
    __chizito: { stage, construction, pivot, rotator, envKind, THREE, contactShadow, interaction, input, picker, assets, crumbs, audio, rig },
  });

  const timer = new THREE.Timer();
  const frame = (dt: number) => {
    rig.update(dt);
    if (rig.moved && photo) photo.layout();
    interaction.update(dt);
    shake.busy = interaction.busy;
    shake.update(dt);
    crumbs.update(dt);
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

  // Entrada: el chizito cae desde arriba con un rebote y el velo blanco se disuelve.
  shake.intro(0.045);
  document.body.classList.add('ready');
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
