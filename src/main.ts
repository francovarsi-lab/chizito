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
import { Persistence } from './persistence/Persistence';
import { Title, type TitleStyle } from './ui/Title';

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
  // Cada vez que se abre el juego, un chizito distinto (?seed=N lo fija; las capturas usan el 3).
  const rootSeed = Number(params.get('seed') ?? (params.has('capture') ? 3 : 1 + Math.floor(Math.random() * 1e5)));
  const pivot = new THREE.Group();
  pivot.name = 'chizito-root';
  pivot.position.copy(CONFIG.chizitoCenter);
  let chizitoModel = assets.create(CHIZITO.type, rootSeed, 'hero');
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
    // Al cargar una criatura con otro chizito raíz: se rehace sólo su malla (las piezas cuelgan del pivote).
    setRootSeed: (seed) => {
      chizitoModel.removeFromParent();
      chizitoModel.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      chizitoModel = assets.create(CHIZITO.type, seed, 'hero');
      markHero(chizitoModel);
      pivot.add(chizitoModel);
    },
  });
  const persistence = new Persistence(interaction, pieces, overlay, CHIZITO.type);
  persistence.install();

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
    __chizito: { stage, construction, pivot, rotator, envKind, THREE, contactShadow, interaction, input, picker, assets, crumbs, audio, rig, persistence },
  });

  const timer = new THREE.Timer();
  const frame = (dt: number) => {
    rig.update(dt);
    if (rig.moved && photo) photo.layout();
    backdrop.party.update(dt);
    interaction.update(dt);
    shake.busy = interaction.busy;
    shake.update(dt);
    crumbs.update(dt);
    stage.focusTarget.copy(rig.focus);
    contactShadow.update(stage.renderer);
    stage.render(dt);
  };

  // ── Intro: plano general de la mesa con el título; un clic o una tecla viaja hasta el chizito. ──
  const INTRO_SHOT = { position: new THREE.Vector3(0.06, 0.44, 0.92), target: new THREE.Vector3(0, 0.1, -0.42) };
  let title: Title | null = null;
  let started = false;
  const startIntro = () => {
    interaction.enabled = false;
    rig.startIntro(INTRO_SHOT);
    document.getElementById('help')?.classList.add('hidden');
    const style = (params.get('titulo') ?? 'arcade') as TitleStyle;
    title = new Title('Cumpleañitos', 'hombrecito de chizito', ['arcade', 'globo', 'neon'].includes(style) ? style : 'arcade');
  };
  const startGame = () => {
    if (started) return;
    started = true;
    audio.play('pick');
    void title?.hide();
    rig.flyIn(3.2, () => {
      interaction.enabled = true;
      // Al llegar, el chizito "salta" a escena y se muestra dónde está su frente.
      shake.intro(0.03);
      interaction.showFront();
      overlay.flash('tocá un recipiente para agarrar un snack · F muestra el frente', 3600);
    });
  };
  const wantsIntro = params.has('capture') ? params.has('intro') : !params.has('sinintro');

  if (params.has('capture')) {
    // Modo captura (Playwright con WebGL por software): se renderiza bajo demanda.
    if (wantsIntro) startIntro();
    Object.assign((window as unknown as { __chizito: object }).__chizito, {
      renderFrames: (n: number, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) frame(dt);
        return canvas.toDataURL('image/png');
      },
      startGame,
    });
    frame(1 / 60);
    document.body.dataset.ready = '1';
    return;
  }

  // Al abrir siempre se arranca con un chizito nuevo. La última criatura queda autoguardada en el
  // navegador y se recupera a pedido con ?recuperar (para guardarla de verdad: Ctrl+S).
  if (params.has('recuperar')) persistence.restoreAutosave();

  // Entrada: con intro, plano general + título hasta el primer clic o tecla (?sinintro la saltea);
  // sin intro, el chizito cae desde arriba con un rebote. El velo cremoso se disuelve.
  if (wantsIntro) {
    startIntro();
    const go = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.ctrlKey || e.metaKey)) return;
      window.removeEventListener('pointerdown', go, true);
      window.removeEventListener('keydown', go, true);
      startGame();
    };
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', go, true);
  } else {
    shake.intro(0.045);
  }
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
