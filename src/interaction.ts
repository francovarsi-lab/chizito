import * as THREE from 'three';
import { Construction, PieceNode, nextId } from './construction';
import { PIECE_DEFS, PieceType } from './pieces';
import { AudioManager, Shaker, Crumbs } from './fx';
import { autosave } from './save';

type State = 'IDLE' | 'HOLDING' | 'AIMING' | 'SELECTED';

const INSERT_SPEED = 0.05; // m/s
const MAX_ANGLE = (85 * Math.PI) / 180;

export class Interaction {
  state: State = 'IDLE';
  construction: Construction;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  raycaster = new THREE.Raycaster();
  mouseNDC = new THREE.Vector2();
  audio = new AudioManager();
  shaker = new Shaker();
  crumbs = new Crumbs();
  chizitoBasePos: THREE.Vector3;

  // rotación (trackball)
  rotating = false;
  rotVel = new THREE.Quaternion();
  lastMouse = new THREE.Vector2();

  // holding / aiming
  heldType: PieceType | null = null;
  heldGhost: THREE.Object3D | null = null;
  aimingNode: PieceNode | null = null;
  aimParent: PieceNode | null = null;
  aimPitch = 0; aimYaw = 0;
  inserting = false;
  insertDir = 1;

  selectedNode: PieceNode | null = null;

  history: any[] = [];
  future: any[] = [];

  cupPalito: THREE.Mesh;
  cupPapita: THREE.Mesh;

  helpEl = document.getElementById('help')!;
  angleEl = document.getElementById('angle')!;
  anglesHidden = false;
  helpShown = true;
  lastR = 0;

  constructor(construction: Construction, scene: THREE.Scene, camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.construction = construction;
    this.scene = scene;
    this.camera = camera;
    this.dom = dom;
    this.chizitoBasePos = construction.group.position.clone();

    this.cupPalito = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.045, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, side: THREE.DoubleSide }));
    this.cupPalito.position.set(0.065, 0.02, 0.155);
    this.cupPalito.rotation.z = 0.15;
    scene.add(this.cupPalito);

    this.cupPapita = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 16),
      new THREE.MeshStandardMaterial({ color: 0xe0d8c8, roughness: 0.6 }));
    this.cupPapita.position.set(-0.07, 0.01, 0.15);
    scene.add(this.cupPapita);

    dom.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.pushHistory();
  }

  async init() { await this.audio.init(); }

  dismissHelp() {
    if (!this.helpShown) return;
    this.helpShown = false;
    this.helpEl.style.opacity = '0';
  }

  setNDC(e: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    this.mouseNDC.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  pierceableMeshes(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const node of this.construction.nodes.values()) {
      if (PIECE_DEFS[node.data.type].canBePierced) out.push(node.mesh);
    }
    return out;
  }

  placedMeshes(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const node of this.construction.nodes.values()) if (node !== this.construction.root) out.push(node.mesh);
    return out;
  }

  onDown(e: PointerEvent) {
    this.dismissHelp();
    this.setNDC(e);
    this.lastMouse.set(e.clientX, e.clientY);

    if (e.button === 2) { this.rotating = true; return; }
    if (e.button !== 0) return;

    if (this.state === 'IDLE') {
      this.raycaster.setFromCamera(this.mouseNDC, this.camera);
      const cupHit = this.raycaster.intersectObjects([this.cupPalito, this.cupPapita])[0];
      if (cupHit) { this.grab(cupHit.object === this.cupPalito ? 'palito' : 'papita'); return; }

      const placedHit = this.raycaster.intersectObjects(this.placedMeshes())[0];
      if (placedHit) { this.select(placedHit.object.userData.node as PieceNode); return; }

      this.rotating = true;
      return;
    }

    if (this.state === 'HOLDING') {
      const hit = this.surfaceHit();
      if (hit) this.fixEntry(hit);
      return;
    }

    if (this.state === 'AIMING' && this.aimingNode) {
      this.inserting = true; this.insertDir = 1;
      this.shaker.trigger();
      this.audio.play('crack', 0.6);
      return;
    }

    if (this.state === 'SELECTED' && this.selectedNode) {
      this.raycaster.setFromCamera(this.mouseNDC, this.camera);
      const hit = this.raycaster.intersectObjects(this.placedMeshes())[0];
      if (hit && hit.object.userData.node !== this.selectedNode) { this.select(hit.object.userData.node as PieceNode); return; }
      if (!hit) { this.deselect(); return; }
      this.inserting = true; this.insertDir = e.shiftKey ? -1 : 1;
      return;
    }
  }

  onMove(e: PointerEvent) {
    this.setNDC(e);
    if (this.rotating) {
      const dx = e.clientX - this.lastMouse.x, dy = e.clientY - this.lastMouse.y;
      this.lastMouse.set(e.clientX, e.clientY);
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.006);
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.006);
      this.rotVel.multiply(qx).multiply(qy);
      return;
    }
    if (this.state === 'HOLDING' && this.heldGhost) {
      const hit = this.surfaceHit();
      if (hit) {
        this.heldGhost.position.copy(hit.point);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal);
        this.heldGhost.quaternion.copy(q);
        const def = PIECE_DEFS[this.heldType!];
        this.heldGhost.position.addScaledVector(hit.normal, -def.length / 2);
      } else {
        const p = new THREE.Vector3(this.mouseNDC.x, this.mouseNDC.y, 0.5).unproject(this.camera);
        const dir = p.sub(this.camera.position).normalize();
        this.heldGhost.position.copy(this.camera.position).addScaledVector(dir, 0.17);
      }
      return;
    }
    if (this.state === 'AIMING' && this.aimingNode && !this.inserting) {
      const dx = e.movementX || 0, dy = e.movementY || 0;
      this.adjustAim(dx * 0.004, dy * 0.004);
    }
  }

  onUp(e: PointerEvent) {
    if (e.button === 2) { this.rotating = false; return; }
    this.rotating = false;
    if (this.inserting) {
      this.inserting = false;
      if (this.state === 'AIMING' && this.aimingNode) {
        if (this.aimingNode.data.depth > 0) { this.state = 'IDLE'; this.aimingNode = null; this.pushHistory(); autosave(this.construction); }
      } else if (this.state === 'SELECTED') {
        autosave(this.construction);
      }
    }
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.state === 'HOLDING') { this.dropHeld(); }
      else if (this.state === 'AIMING' && this.aimingNode) {
        this.construction.remove(this.aimingNode); this.aimingNode = null; this.state = 'IDLE';
      } else if (this.state === 'SELECTED') { this.deselect(); }
      return;
    }
    if (this.state === 'AIMING' && this.aimingNode) {
      const step = e.shiftKey ? 0.09 : 0.018;
      if (e.key === 'ArrowLeft') this.adjustAim(-step, 0);
      if (e.key === 'ArrowRight') this.adjustAim(step, 0);
      if (e.key === 'ArrowUp') this.adjustAim(0, -step);
      if (e.key === 'ArrowDown') this.adjustAim(0, step);
      if (e.key === 'q' || e.key === 'Q') { this.aimingNode.data.spin -= 0.15; this.aimingNode.applyTransform(); }
      if (e.key === 'e' || e.key === 'E') { this.aimingNode.data.spin += 0.15; this.aimingNode.applyTransform(); }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.state === 'SELECTED' && this.selectedNode) {
      this.construction.remove(this.selectedNode);
      this.selectedNode = null; this.state = 'IDLE';
      this.pushHistory(); autosave(this.construction);
    }
    if (e.key === 'h' || e.key === 'H') { this.anglesHidden = !this.anglesHidden; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo(); else this.undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
    if (e.key === 'r' || e.key === 'R') {
      const now = performance.now();
      if (now - this.lastR < 600) { this.doReset(); this.lastR = 0; } else this.lastR = now;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      import('./save').then(m => m.exportJSON(this.construction));
    }
  }

  surfaceHit(): { point: THREE.Vector3; normal: THREE.Vector3; node: PieceNode } | null {
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.pierceableMeshes());
    if (!hits.length || !hits[0].face) return null;
    const hit = hits[0];
    const node = hit.object.userData.node as PieceNode;
    const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    return { point: hit.point, normal, node };
  }

  grab(type: PieceType) {
    this.heldType = type;
    const def = PIECE_DEFS[type];
    this.heldGhost = def.buildMesh(Math.random() * 100);
    (this.heldGhost as THREE.Mesh).material = ((this.heldGhost as THREE.Mesh).material as THREE.Material).clone();
    ((this.heldGhost as THREE.Mesh).material as THREE.MeshStandardMaterial).transparent = true;
    ((this.heldGhost as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.85;
    this.scene.add(this.heldGhost);
    this.state = 'HOLDING';
    this.audio.play('pick', 0.5);
  }

  dropHeld() {
    if (this.heldGhost) this.scene.remove(this.heldGhost);
    this.heldGhost = null; this.heldType = null; this.state = 'IDLE';
    this.audio.play('drop', 0.3);
  }

  fixEntry(hit: { point: THREE.Vector3; normal: THREE.Vector3; node: PieceNode }) {
    if (!this.heldType) return;
    const parent = hit.node;
    const local = parent.pivot.worldToLocal(hit.point.clone());
    const dirLocal = hit.normal.clone().transformDirection(new THREE.Matrix4().copy(parent.pivot.matrixWorld).invert()).normalize();
    const seed = ((this.heldGhost as THREE.Mesh)?.geometry as any)?.seed ?? Math.random() * 100;
    const node = this.construction.add(parent, this.heldType, local, dirLocal, seed);
    this.dropHeldSilent();
    this.aimingNode = node; this.aimParent = parent; this.aimPitch = 0; this.aimYaw = 0;
    this.state = 'AIMING';
  }

  dropHeldSilent() {
    if (this.heldGhost) this.scene.remove(this.heldGhost);
    this.heldGhost = null; this.heldType = null;
  }

  adjustAim(dYaw: number, dPitch: number) {
    if (!this.aimingNode) return;
    this.aimYaw += dYaw; this.aimPitch += dPitch;
    const maxA = MAX_ANGLE;
    const mag = Math.sqrt(this.aimYaw * this.aimYaw + this.aimPitch * this.aimPitch);
    if (mag > maxA) { const s = maxA / mag; this.aimYaw *= s; this.aimPitch *= s; }
    if (!this.aimingNode.data.dir0) this.aimingNode.data.dir0 = [...this.aimingNode.data.dir] as [number, number, number];
    const baseDir = new THREE.Vector3(...this.aimingNode.data.dir0).normalize();
    const basis1 = new THREE.Vector3().crossVectors(baseDir, Math.abs(baseDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const basis2 = new THREE.Vector3().crossVectors(baseDir, basis1).normalize();
    const newDir = baseDir.clone()
      .applyAxisAngle(basis1, this.aimPitch)
      .applyAxisAngle(basis2, this.aimYaw)
      .normalize();
    this.aimingNode.data.dir = [newDir.x, newDir.y, newDir.z];
    this.aimingNode.applyTransform();
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    this.angleEl.textContent = `X ${deg(this.aimPitch) + 90}° · Y ${deg(this.aimYaw)}°`;
  }

  select(node: PieceNode) {
    this.selectedNode?.setHighlight(false);
    this.selectedNode = node;
    node.setHighlight(true);
    this.state = 'SELECTED';
  }

  deselect() {
    this.selectedNode?.setHighlight(false);
    this.selectedNode = null;
    this.state = 'IDLE';
  }

  doReset() {
    this.construction.reset();
    this.pushHistory();
    autosave(this.construction);
  }

  pushHistory() {
    this.history.push(JSON.stringify(this.construction.serialize()));
    if (this.history.length > 50) this.history.shift();
    this.future = [];
  }

  restoreFromSnapshot(snap: string) {
    const json = JSON.parse(snap);
    const fresh = Construction.fromJSON(json);
    this.scene.remove(this.construction.group);
    this.construction = fresh;
    this.scene.add(this.construction.group);
    this.selectedNode = null; this.aimingNode = null; this.state = 'IDLE';
  }

  undo() {
    if (this.history.length < 2) return;
    this.future.push(this.history.pop()!);
    this.restoreFromSnapshot(this.history[this.history.length - 1]);
    autosave(this.construction);
  }

  redo() {
    if (!this.future.length) return;
    const snap = this.future.pop()!;
    this.history.push(snap);
    this.restoreFromSnapshot(snap);
    autosave(this.construction);
  }

  update(dt: number) {
    this.rotVel.slerp(new THREE.Quaternion(), 0.08);
    if (!this.rotVel.equals(new THREE.Quaternion())) {
      this.construction.group.quaternion.multiply(this.rotVel);
    }
    this.shaker.update(this.construction.group, dt, this.chizitoBasePos);
    this.crumbs.update(dt);

    if (this.inserting) {
      const target = this.state === 'AIMING' ? this.aimingNode : this.selectedNode;
      if (target) {
        const max = target.maxDepth();
        const prevDepth = target.data.depth;
        target.data.depth = Math.min(max, Math.max(0, target.data.depth + this.insertDir * INSERT_SPEED * dt));
        target.applyTransform();
        if (Math.floor(target.data.depth * 50) !== Math.floor(prevDepth * 50) && Math.random() < 0.4) {
          const worldPos = new THREE.Vector3();
          target.mesh.getWorldPosition(worldPos);
          this.crumbs.spawn(this.scene, worldPos, 1);
        }
      }
    }

    this.angleEl.style.display = this.state === 'AIMING' && !this.anglesHidden ? 'block' : 'none';
    if (this.state === 'AIMING' && this.angleEl.style.display === 'block') {
      const r = this.dom.getBoundingClientRect();
      this.angleEl.style.left = `${r.width / 2 + 60}px`;
      this.angleEl.style.top = `${r.height / 2 - 40}px`;
    }
  }
}
