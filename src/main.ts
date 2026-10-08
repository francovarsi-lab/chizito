import * as THREE from 'three';
import { createRenderer, createCamera, setupEnvironment, addLights, addTable, addBackdrop, createComposer, onResize, CHIZITO_Y } from './scene';
import { Construction, PieceNode } from './construction';
import { Interaction } from './interaction';
import { loadAutosave, setupDragDropImport } from './save';

const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const renderer = createRenderer(canvas);
const camera = createCamera();
const scene = new THREE.Scene();

addLights(scene);
addTable(scene);
addBackdrop(scene);
setupEnvironment(renderer, scene);

let construction = new Construction();
construction.group.position.set(0, CHIZITO_Y, 0);
// tag cada mesh con su nodo para raycasting/selección
for (const node of construction.nodes.values()) node.mesh.userData.node = node;
scene.add(construction.group);

const saved = loadAutosave();
if (saved && saved.pieces && saved.pieces.length > 1) {
  const restored = Construction.fromJSON(saved);
  restored.group.position.copy(construction.group.position);
  for (const node of restored.nodes.values()) node.mesh.userData.node = node;
  scene.remove(construction.group);
  construction = restored;
  scene.add(construction.group);
}

const interaction = new Interaction(construction, scene, camera, canvas);
interaction.init();

// cuando el estado de construction cambia por undo/redo o import, retaguear meshes
const retag = () => { for (const node of interaction.construction.nodes.values()) node.mesh.userData.node = node; };
const origRestore = interaction.restoreFromSnapshot.bind(interaction);
interaction.restoreFromSnapshot = (snap: string) => { origRestore(snap); retag(); };

setupDragDropImport((json) => {
  const fresh = Construction.fromJSON(json);
  fresh.group.position.set(0, CHIZITO_Y, 0);
  scene.remove(interaction.construction.group);
  (interaction as any).construction = fresh;
  scene.add(fresh.group);
  retag();
  interaction.pushHistory();
});

const { composer, bokeh } = createComposer(renderer, scene, camera);
onResize(camera, renderer, composer);

let last = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  interaction.update(dt);
  composer.render();
  requestAnimationFrame(loop);
}
loop();
