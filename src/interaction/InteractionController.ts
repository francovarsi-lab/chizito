import * as THREE from 'three';
import type { AssetRegistry } from '../assets/AssetRegistry';
import { CommandStack, cloneSnapshot, type Snapshot } from '../commands/CommandStack';
import type { Input } from '../input/Input';
import { newPieceId, type Construction, type PieceData, type PieceNode } from '../model/Construction';
import type { PieceDefinition } from '../pieces/PieceDefinition';
import type { PieceRegistry } from '../pieces/PieceRegistry';
import { markHero } from '../render/ContactShadow';
import type { Overlay } from '../ui/Overlay';
import { setGhost, setHighlight } from './Ghost';
import type { Picker, SurfaceHit } from './Picker';
import { AIM_GAP, Aim } from './Placement';
import type { TrackballRotator } from './TrackballRotator';

/**
 * Máquina de estados explícita de la interacción.
 *
 *   IDLE ──(clic en vaso/bowl)──▶ HOLDING ──(clic en superficie)──▶ AIMING ──(mantener)──▶ INSERTING
 *     ▲                             ▲  │ Esc / bowl                    │ Esc                  │ soltar
 *     │                             │  ▼                               ▼                      ▼
 *     ├─────────────────── Esc ◀────────────────────────────────── PLACED ◀───────────────────┘
 *     │                             ▲                                 │ Shift+mantener hasta sacarla
 *     │                             └─────────────────────────────────┘
 *     └──(clic en pieza colocada)──▶ SELECTED_PLACED_PIECE ──(mantener)──▶ INSERTING ──▶ SELECTED…
 *                                     Supr: quitar · Esc: soltar · Shift+mantener: sacar
 *
 * Rotar el chizito: clic derecho o Espacio + arrastrar en cualquier estado; en IDLE también el
 * clic izquierdo sobre el chizito o el vacío. Sacar: sólo Shift + mantener clic izquierdo.
 * Ctrl+Z / Ctrl+Shift+Z deshacen / rehacen; R (dos veces) reinicia.
 */
export enum InteractionState {
  IDLE = 'IDLE',
  HOLDING = 'HOLDING',
  AIMING = 'AIMING',
  INSERTING = 'INSERTING',
  PLACED = 'PLACED',
  SELECTED_PLACED_PIECE = 'SELECTED_PLACED_PIECE',
}

/** Velocidades del clavado (m/s), proporcionales al largo del palito (7 cm). */
const PUSH_SPEED = 0.04;
const PULL_SPEED = 0.048;
/** Sensibilidad del ángulo con el mouse (rad/px). */
const TILT_PER_PX = THREE.MathUtils.degToRad(0.32);
/** Giro propio con Q / E (rad por pulsación); sirve sobre todo para orientar la papita. */
const SPIN_STEP = THREE.MathUtils.degToRad(15);

export interface ActivePiece {
  def: PieceDefinition;
  object: THREE.Object3D;
  aim: Aim;
  /** Pieza en la que se está clavando (definida desde AIMING). */
  parent: PieceNode | null;
  /** Nodo en la construcción, una vez que la punta entró. */
  node: PieceNode | null;
  seed: number;
  /** Elegida con clic entre las ya colocadas (SELECTED_PLACED_PIECE). */
  selected?: boolean;
}

export type FeedbackEvent = 'pick' | 'drop' | 'contact' | 'inserting' | 'out' | 'remove';

export interface FeedbackInfo {
  def: PieceDefinition;
  /** Punto de entrada y normal saliente, en mundo. */
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** Dirección de avance (hacia adentro), en mundo. */
  dir: THREE.Vector3;
  depth: number;
  dt: number;
  /** Pieza en la que entra (para pegarle migas) y el punto/normal en SUS coordenadas locales. */
  parent: THREE.Object3D | null;
  localPoint: THREE.Vector3;
  localNormal: THREE.Vector3;
}

export interface InteractionDeps {
  input: Input;
  rotator: TrackballRotator;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  picker: Picker;
  construction: Construction;
  pieces: PieceRegistry;
  assets: AssetRegistry;
  overlay: Overlay;
  /** Centro del chizito raíz (para ubicar la pieza "en la mano"). */
  center: THREE.Vector3;
}

export class InteractionController {
  state = InteractionState.IDLE;
  /** Eventos de feedback (sonido, sacudida, migas). */
  onEvent: ((e: FeedbackEvent, info: FeedbackInfo | null) => void) | null = null;
  /** Se dispara después de cualquier cambio de la construcción (autoguardado). */
  onChange: (() => void) | null = null;
  /** Se dispara al reiniciar (para limpiar migas, etc.). */
  onReset: (() => void) | null = null;

  readonly commands: CommandStack;
  private active: ActivePiece | null = null;
  private rotating = false;
  private press: 'push' | 'pull' | null = null;
  private pressTime = 0;
  private pressBefore: Snapshot | null = null;
  private seedCounter = 1;
  private hover: SurfaceHit | null = null;
  private resetArmedUntil = 0;
  /** Objetos de piezas quitadas, para reutilizarlos al deshacer sin regenerar la malla. */
  private readonly graveyard = new Map<string, THREE.Object3D>();
  private readonly hoverNormal = new THREE.Vector3();
  private readonly ring: THREE.Mesh;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly targetPos = new THREE.Vector3();
  private readonly targetQuat = new THREE.Quaternion();

  constructor(private readonly d: InteractionDeps) {
    // Indicador muy sutil del punto de entrada.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.0022, 0.003, 40),
      new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false }),
    );
    this.ring.name = 'entry-ring';
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    d.scene.add(this.ring);
    d.picker.ignore.add(this.ring);

    this.commands = new CommandStack((s) => this.restore(s));

    const { input } = d;
    input.onDown((e) => this.onDown(e.button));
    input.onUp(() => this.onUp());
    input.onMove((e) => this.onMove(e.dx, e.dy));
    input.onKey((e) => this.onKey(e));
  }

  // ───────────────────────────── entrada ─────────────────────────────

  private onDown(button: number): void {
    const { input, picker, overlay } = this.d;
    overlay.dismissHint();
    if (button === 2 || (button === 0 && input.keys.has('Space'))) {
      this.startRotate();
      return;
    }
    if (button !== 0) return;
    const p = input.pointer;
    const bowl = picker.pickBowl(p.ndcX, p.ndcY);

    switch (this.state) {
      case InteractionState.IDLE: {
        if (bowl && this.canGrab(bowl)) {
          this.grab(bowl);
          break;
        }
        const placed = picker.pickPlaced(p.ndcX, p.ndcY);
        if (placed) this.select(placed);
        else this.startRotate();
        break;
      }
      case InteractionState.HOLDING: {
        if (bowl) {
          const was = this.active?.def.type;
          this.returnToBowl();
          if (bowl !== was && this.canGrab(bowl)) this.grab(bowl);
          break;
        }
        const hit = picker.pickSurface(p.ndcX, p.ndcY);
        if (hit) this.beginAim(hit);
        break;
      }
      case InteractionState.AIMING:
        if (bowl) this.returnToBowl();
        else this.startPress(input.shift ? 'pull' : 'push');
        break;
      case InteractionState.PLACED:
      case InteractionState.SELECTED_PLACED_PIECE: {
        if (bowl) {
          this.release();
          if (this.canGrab(bowl)) this.grab(bowl);
          break;
        }
        // Clic sobre OTRA pieza colocada: seleccionarla. Si no, mantener actúa sobre la activa
        // (el cursor suele haber quedado lejos después de apuntar).
        const placed = picker.pickPlaced(p.ndcX, p.ndcY);
        if (placed && placed !== this.active?.node) {
          this.release();
          this.select(placed);
        } else {
          this.startPress(input.shift ? 'pull' : 'push');
        }
        break;
      }
    }
  }

  private onUp(): void {
    const { input } = this.d;
    if (this.rotating && !input.buttons.left && !input.buttons.right) {
      this.rotating = false;
      this.d.rotator.end();
      document.body.classList.remove('grab');
    }
    if (this.press && !input.buttons.left) this.stopPress();
  }

  private onMove(dx: number, dy: number): void {
    if (this.rotating) {
      this.d.rotator.drag(dx, dy);
      return;
    }
    if (this.state === InteractionState.AIMING && this.active) {
      // La pieza pivota alrededor de la punta: la cola sigue al mouse.
      this.active.aim.addTilt(dx * TILT_PER_PX, -dy * TILT_PER_PX);
    }
  }

  private onKey(e: KeyboardEvent): void {
    const { overlay } = this.d;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (ctrl && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl) return;
    if (e.code === 'KeyH') {
      overlay.toggle();
      return;
    }
    if (e.code === 'KeyR') {
      this.requestReset();
      return;
    }
    if (e.code === 'Escape') {
      if (this.state === InteractionState.HOLDING) this.returnToBowl();
      else if (this.state === InteractionState.AIMING) this.backToHand();
      else if (this.state === InteractionState.PLACED || this.state === InteractionState.SELECTED_PLACED_PIECE) this.release();
      return;
    }
    if ((e.code === 'Delete' || e.code === 'Backspace') && this.active?.node && !this.press) {
      e.preventDefault();
      this.removeActive();
      return;
    }
    const aimingLike = this.state === InteractionState.AIMING || (this.state === InteractionState.HOLDING && this.hover);
    if (this.active && aimingLike && (e.code === 'KeyQ' || e.code === 'KeyE')) {
      this.active.aim.spin += e.code === 'KeyQ' ? -SPIN_STEP : SPIN_STEP;
      return;
    }
    if (this.state === InteractionState.AIMING && this.active && e.code.startsWith('Arrow')) {
      e.preventDefault();
      const step = THREE.MathUtils.degToRad(e.shiftKey ? 5 : 1);
      if (e.code === 'ArrowLeft') this.active.aim.addTilt(-step, 0);
      if (e.code === 'ArrowRight') this.active.aim.addTilt(step, 0);
      if (e.code === 'ArrowUp') this.active.aim.addTilt(0, step);
      if (e.code === 'ArrowDown') this.active.aim.addTilt(0, -step);
    }
  }

  // ───────────────────────────── acciones ─────────────────────────────

  private startRotate(): void {
    this.rotating = true;
    this.d.rotator.begin();
    document.body.classList.add('grab');
  }

  private canGrab(type: string): boolean {
    const def = this.d.pieces.get(type);
    return def.canPierce;
  }

  private grab(type: string): void {
    const { assets, pieces, scene, picker, overlay } = this.d;
    const def = pieces.get(type);
    const seed = this.seedCounter++ * 7 + 100;
    const object = assets.create(type, seed, 'hero');
    markHero(object);
    const aim = new Aim();
    aim.spin = Math.random() * Math.PI * 2;
    scene.add(object);
    picker.ignore.add(object);
    this.active = { def, object, aim, parent: null, node: null, seed };
    // Arranca saliendo del vaso / bowl.
    object.position.copy(this.bowlWorldPos(type));
    object.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(0.3, 1, 0.4).normalize());
    this.hover = null;
    this.state = InteractionState.HOLDING;
    this.emit('pick', null);
    if (type === 'papita') overlay.hint('holding-papita', 'la papita se clava de canto · Q / E la giran');
    else overlay.hint('holding', 'tocá el chizito donde lo quieras clavar · Esc lo devuelve');
  }

  private returnToBowl(): void {
    const a = this.active;
    if (!a) return;
    if (a.node) this.d.construction.remove(a.node.data.id);
    a.object.removeFromParent();
    a.object.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    setGhost(a.object, null);
    this.d.picker.ignore.delete(a.object);
    this.emit('drop', null);
    this.active = null;
    this.ring.visible = false;
    this.state = InteractionState.IDLE;
  }

  private beginAim(hit: SurfaceHit): void {
    const a = this.active!;
    const parentObj = hit.node.object;
    parentObj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(parentObj.matrixWorld).invert();
    const entry = hit.point.clone().applyMatrix4(inv);
    const normal = hit.normal.clone().transformDirection(inv);
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.d.camera.quaternion).transformDirection(inv);
    a.aim.setFrame(entry, normal, camRight);
    a.aim.tiltX = a.aim.tiltY = 0;
    a.aim.depth = -AIM_GAP;
    a.parent = hit.node;
    parentObj.attach(a.object);
    setGhost(a.object, null);
    this.state = InteractionState.AIMING;
    this.d.overlay.hint('aiming', 'mové el mouse para elegir el ángulo · mantené apretado para clavar');
  }

  /** Selecciona una pieza ya colocada para editarla (hundir, sacar, quitar). */
  private select(node: PieceNode): void {
    const def = this.d.pieces.get(node.data.type);
    const aim = new Aim();
    const axis = new THREE.Vector3().fromArray(node.data.direction).negate();
    // El marco se arma con la normal = eje actual (inclinación 0): el ángulo ya está trabado.
    aim.setFrame(new THREE.Vector3().fromArray(node.data.entryPoint), axis, new THREE.Vector3(1, 0, 0));
    aim.depth = node.data.depth;
    aim.spin = node.data.spin;
    this.active = { def, object: node.object, aim, parent: node.parent, node, seed: node.data.seed, selected: true };
    this.d.picker.ignore.add(node.object);
    setHighlight(node.object, true);
    this.state = InteractionState.SELECTED_PLACED_PIECE;
    this.d.overlay.hint('selected', 'mantené para hundirla · Shift + mantener para sacarla · Supr la quita · Esc la suelta', 6500);
  }

  /** De AIMING (o al sacarla del todo) vuelve a la mano. */
  private backToHand(): void {
    const a = this.active;
    if (!a) return;
    setHighlight(a.object, false);
    if (a.node) {
      a.object.updateMatrixWorld(true);
      const world = a.object.matrixWorld.clone();
      const removed = this.d.construction.remove(a.node.data.id);
      // Lo que estaba clavado en esta pieza se va con ella (deshacer lo recupera).
      for (const n of removed) {
        if (n === a.node) continue;
        n.object.removeFromParent();
        this.bury(n);
      }
      a.node = null;
      a.selected = false;
      this.d.scene.add(a.object);
      world.decompose(a.object.position, a.object.quaternion, a.object.scale);
    } else {
      this.d.scene.attach(a.object);
    }
    a.parent = null;
    a.aim.depth = -AIM_GAP;
    a.aim.tiltX = a.aim.tiltY = 0;
    this.state = InteractionState.HOLDING;
  }

  /** Suelta la pieza activa (queda clavada) y vuelve a IDLE. */
  private release(): void {
    const a = this.active;
    if (a) {
      setHighlight(a.object, false);
      this.d.picker.ignore.delete(a.object);
      if (!a.node) {
        this.returnToBowl();
        return;
      }
    }
    this.active = null;
    this.ring.visible = false;
    this.state = InteractionState.IDLE;
  }

  private removeActive(): void {
    const a = this.active;
    if (!a?.node) return;
    const before = this.snapshot();
    const info = this.info(a, 0);
    setHighlight(a.object, false);
    this.d.picker.ignore.delete(a.object);
    for (const n of this.d.construction.remove(a.node.data.id)) this.bury(n);
    this.active = null;
    this.ring.visible = false;
    this.state = InteractionState.IDLE;
    this.emit('remove', info);
    this.record('quitar', before);
  }

  private startPress(kind: 'push' | 'pull'): void {
    const a = this.active;
    if (!a) return;
    if (kind === 'pull' && a.aim.depth <= 0) return;
    this.press = kind;
    this.pressTime = 0;
    this.pressBefore = this.snapshot();
    this.state = InteractionState.INSERTING;
  }

  private stopPress(): void {
    if (!this.press) return;
    this.press = null;
    const before = this.pressBefore;
    this.pressBefore = null;
    if (this.state !== InteractionState.INSERTING) return;
    const a = this.active;
    if (a && a.aim.depth > 0) {
      this.state = a.selected ? InteractionState.SELECTED_PLACED_PIECE : InteractionState.PLACED;
      if (this.state === InteractionState.PLACED) {
        this.d.overlay.hint('placed', 'mantené para hundirlo más · Shift + mantener para sacarlo · Esc lo suelta', 6500);
      }
    } else {
      this.state = InteractionState.AIMING;
    }
    if (before) this.record('clavar', before);
  }

  private commit(a: ActivePiece): void {
    const parent = a.parent!;
    const data: PieceData = {
      id: newPieceId(a.def.type),
      type: a.def.type,
      parentId: parent.data.id,
      seed: a.seed,
      entryPoint: [0, 0, 0],
      direction: [0, -1, 0],
      depth: 0,
      spin: a.aim.spin,
      localMatrix: [],
    };
    a.aim.writeData(data, a.object);
    a.node = this.d.construction.add(data, a.object);
    this.emit('contact', this.info(a, 0));
  }

  private bowlWorldPos(type: string): THREE.Vector3 {
    const bowl = this.d.picker.bowls.get(type);
    return bowl ? bowl.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0)) : this.d.center.clone();
  }

  // ───────────────────────────── deshacer / reiniciar ─────────────────────────────

  private snapshot(): Snapshot {
    return cloneSnapshot(this.d.construction.list().filter((p) => p.parentId !== null));
  }

  private record(label: string, before: Snapshot): void {
    this.commands.record(label, before, this.snapshot());
    this.onChange?.();
  }

  /** Antes de deshacer / reiniciar: soltar o devolver lo que haya en la mano. */
  private settle(): void {
    if (this.press) {
      this.press = null;
      this.pressBefore = null;
    }
    if (!this.active) return;
    if (this.active.node) this.release();
    else this.returnToBowl();
  }

  undo(): void {
    this.settle();
    if (this.commands.undo()) this.d.overlay.flash('deshecho', 900);
    this.onChange?.();
  }

  redo(): void {
    this.settle();
    if (this.commands.redo()) this.d.overlay.flash('rehecho', 900);
    this.onChange?.();
  }

  /** Reinicio con confirmación mínima: R dos veces en menos de 2,5 s. */
  private requestReset(): void {
    const now = performance.now();
    if (now > this.resetArmedUntil) {
      this.resetArmedUntil = now + 2500;
      this.d.overlay.flash('apretá R otra vez para empezar de nuevo · Ctrl+Z lo deshace', 2500);
      return;
    }
    this.resetArmedUntil = 0;
    this.settle();
    const before = this.snapshot();
    this.restore([]);
    this.record('reiniciar', before);
    this.onReset?.();
    this.d.overlay.flash('chizito nuevo', 1200);
  }

  /** Lleva la construcción a un estado guardado (deshacer, rehacer, carga). */
  restore(s: Snapshot): void {
    const removed = this.d.construction.restore(s, (d) => {
      const reuse = this.graveyard.get(d.id);
      if (reuse) {
        this.graveyard.delete(d.id);
        return reuse;
      }
      const obj = this.d.assets.create(d.type, d.seed, 'hero');
      markHero(obj);
      return obj;
    });
    for (const o of removed) {
      const id = o.userData.pieceId as string | undefined;
      if (id) this.graveyard.set(id, o);
    }
  }

  /** Guarda el objeto de una pieza quitada para reutilizarlo si se deshace. */
  private bury(n: PieceNode): void {
    this.graveyard.set(n.data.id, n.object);
  }

  // ───────────────────────────── por frame ─────────────────────────────

  update(dt: number): void {
    this.d.rotator.update(dt);
    const a = this.active;
    if (!a) {
      this.d.overlay.setAngle(null);
      this.updateCursor();
      return;
    }
    switch (this.state) {
      case InteractionState.HOLDING:
        this.updateHolding(a, dt);
        break;
      case InteractionState.AIMING:
      case InteractionState.PLACED:
      case InteractionState.SELECTED_PLACED_PIECE:
        a.aim.pose(a.object.position, a.object.quaternion);
        break;
      case InteractionState.INSERTING:
        this.updateInserting(a, dt);
        break;
    }
    this.updateRing(a);
    this.updateAngleLabel(a);
    this.updateCursor();
  }

  private updateHolding(a: ActivePiece, dt: number): void {
    const { input, picker, camera, center } = this.d;
    const p = input.pointer;
    const hit = this.rotating ? this.hover : picker.pickSurface(p.ndcX, p.ndcY);
    const k = 1 - Math.exp(-dt * 16);
    if (hit) {
      // Previsualización: perpendicular a la superficie, la punta apenas afuera.
      if (!this.hover) this.hoverNormal.copy(hit.normal);
      else this.hoverNormal.lerp(hit.normal, 1 - Math.exp(-dt * 22)).normalize();
      this.hover = hit;
      this.targetPos.copy(hit.point).addScaledVector(this.hoverNormal, AIM_GAP);
      this.targetQuat.setFromUnitVectors(Y_UP, this.hoverNormal).multiply(this.tmpQ.setFromAxisAngle(Y_UP, a.aim.spin));
      setGhost(a.object, 0.5);
    } else {
      this.hover = null;
      // En la mano: flotando cerca del chizito, bajo el cursor, apuntando hacia él.
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(p.ndcX, p.ndcY), camera);
      const planeN = camera.getWorldDirection(this.tmpV).negate();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeN, center.clone().addScaledVector(planeN, 0.025));
      const tip = ray.ray.intersectPlane(plane, this.tmpV2) ?? center.clone();
      this.targetPos.copy(tip);
      const away = tip.clone().sub(center);
      if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
      away.normalize().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.35, 0)).add(planeN.clone().multiplyScalar(0.35)).normalize();
      this.targetQuat.setFromUnitVectors(Y_UP, away).multiply(this.tmpQ.setFromAxisAngle(Y_UP, a.aim.spin));
      setGhost(a.object, null);
    }
    a.object.position.lerp(this.targetPos, k);
    a.object.quaternion.slerp(this.targetQuat, k);
  }

  private updateInserting(a: ActivePiece, dt: number): void {
    const { input } = this.d;
    if (!input.buttons.left) {
      this.stopPress();
      a.aim.pose(a.object.position, a.object.quaternion);
      return;
    }
    this.pressTime += dt;
    // Arranque suave: primero "encuentra" resistencia y después cede.
    const accel = 0.22 + 0.78 * THREE.MathUtils.smoothstep(this.pressTime, 0, 0.32);
    const aim = a.aim;
    if (this.press === 'push') {
      const crust = aim.depth < 0 ? 1 : 0.3 + 0.7 * THREE.MathUtils.smoothstep(aim.depth, 0.0005, 0.0045);
      const before = aim.depth;
      aim.depth = Math.min(a.def.maxDepth, aim.depth + PUSH_SPEED * accel * crust * dt);
      if (before <= 0 && aim.depth > 0) this.commit(a);
      else if (aim.depth > 0 && aim.depth > before) this.emit('inserting', this.info(a, dt));
    } else if (this.press === 'pull') {
      aim.depth -= PULL_SPEED * accel * dt;
      if (aim.depth <= 0) {
        const info = this.info(a, dt);
        aim.depth = 0;
        aim.pose(a.object.position, a.object.quaternion);
        const before = this.pressBefore;
        this.press = null;
        this.pressBefore = null;
        this.backToHand();
        this.emit('out', info);
        if (before) this.record('sacar', before);
        return;
      }
    }
    aim.pose(a.object.position, a.object.quaternion);
    if (a.node) aim.writeData(a.node.data, a.object);
  }

  /** Punto de entrada, normal y dirección de avance en mundo, para el feedback. */
  private info(a: ActivePiece, dt: number): FeedbackInfo {
    const obj = a.parent?.object ?? a.object.parent ?? this.d.scene;
    obj.updateMatrixWorld(true);
    const point = a.aim.entry.clone().applyMatrix4(obj.matrixWorld);
    const normal = a.aim.normal.clone().transformDirection(obj.matrixWorld);
    const dir = a.aim.axis().negate().transformDirection(obj.matrixWorld);
    return {
      def: a.def,
      point,
      normal,
      dir,
      depth: a.aim.depth,
      dt,
      parent: a.parent?.object ?? null,
      localPoint: a.aim.entry.clone(),
      localNormal: a.aim.normal.clone(),
    };
  }

  private emit(e: FeedbackEvent, info: FeedbackInfo | null): void {
    this.onEvent?.(e, info);
  }

  private updateRing(a: ActivePiece): void {
    const show =
      (this.state === InteractionState.HOLDING && this.hover !== null) ||
      (this.state === InteractionState.AIMING && a.parent !== null);
    this.ring.visible = show;
    if (!show) return;
    if (this.state === InteractionState.HOLDING && this.hover) {
      this.ring.position.copy(this.hover.point).addScaledVector(this.hoverNormal, 0.0003);
      this.ring.quaternion.setFromUnitVectors(Z_UP, this.hoverNormal);
    } else if (a.parent) {
      const obj = a.parent.object;
      const n = this.tmpV.copy(a.aim.normal).transformDirection(obj.matrixWorld);
      this.ring.position.copy(a.aim.entry).applyMatrix4(obj.matrixWorld).addScaledVector(n, 0.0003);
      this.ring.quaternion.setFromUnitVectors(Z_UP, n);
    }
  }

  private updateAngleLabel(a: ActivePiece): void {
    const s = this.state;
    const showing =
      (s === InteractionState.HOLDING && this.hover) || s === InteractionState.AIMING || (s === InteractionState.INSERTING && !a.node);
    if (!showing) {
      this.d.overlay.setAngle(null);
      return;
    }
    const [x, y] = s === InteractionState.HOLDING ? [90, 90] : a.aim.displayAngles();
    // Junto a la pieza, sobre su eje, hacia la cola.
    a.object.updateMatrixWorld(true);
    const p = this.tmpV.set(0, a.def.dimensions.length * 0.85, 0).applyMatrix4(a.object.matrixWorld).project(this.d.camera);
    const sx = (p.x * 0.5 + 0.5) * window.innerWidth + 14;
    const sy = (-p.y * 0.5 + 0.5) * window.innerHeight - 6;
    this.d.overlay.setAngle(`X ${x}° · Y ${y}°`, sx, sy);
  }

  private updateCursor(): void {
    if (this.rotating) return;
    const p = this.d.input.pointer;
    const busy = this.state === InteractionState.INSERTING;
    const overBowl = !busy && this.d.picker.pickBowl(p.ndcX, p.ndcY) !== null;
    const canSelect = this.state === InteractionState.IDLE || this.state === InteractionState.PLACED || this.state === InteractionState.SELECTED_PLACED_PIECE;
    const overPiece = !busy && !overBowl && canSelect && this.d.picker.pickPlaced(p.ndcX, p.ndcY) !== null;
    document.body.classList.toggle('over-bowl', overBowl || overPiece);
  }
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const Z_UP = new THREE.Vector3(0, 0, 1);
