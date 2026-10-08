import * as THREE from 'three';
import type { AssetRegistry } from '../assets/AssetRegistry';
import type { Input } from '../input/Input';
import { newPieceId, type Construction, type PieceNode } from '../model/Construction';
import type { PieceDefinition } from '../pieces/PieceDefinition';
import type { PieceRegistry } from '../pieces/PieceRegistry';
import { markHero } from '../render/ContactShadow';
import type { Overlay } from '../ui/Overlay';
import { setGhost } from './Ghost';
import type { Picker, SurfaceHit } from './Picker';
import { AIM_GAP, Aim } from './Placement';
import type { TrackballRotator } from './TrackballRotator';

/**
 * Máquina de estados explícita de la interacción.
 *
 *   IDLE ──(clic en bowl)──▶ HOLDING ──(clic en superficie)──▶ AIMING ──(mantener)──▶ INSERTING
 *     ▲                        ▲  │ Esc / bowl                    │ Esc                  │ soltar
 *     │                        │  ▼                               ▼                      ▼
 *     └──────────────── Esc ◀─────────────────────────────── PLACED ◀────────────────────┘
 *                              ▲                                 │ Shift+mantener hasta sacarlo
 *                              └─────────────────────────────────┘
 *   SELECTED_PLACED_PIECE: edición de piezas ya colocadas (fase 3).
 *
 * Rotar el chizito: clic derecho o Espacio + arrastrar en cualquier estado; en IDLE también el
 * clic izquierdo. Sacar: sólo Shift + mantener clic izquierdo.
 */
export enum InteractionState {
  IDLE = 'IDLE',
  HOLDING = 'HOLDING',
  AIMING = 'AIMING',
  INSERTING = 'INSERTING',
  PLACED = 'PLACED',
  SELECTED_PLACED_PIECE = 'SELECTED_PLACED_PIECE',
}

/** Velocidades del clavado (m/s). */
const PUSH_SPEED = 0.02;
const PULL_SPEED = 0.024;
/** Sensibilidad del ángulo con el mouse (rad/px). */
const TILT_PER_PX = THREE.MathUtils.degToRad(0.32);

interface ActivePiece {
  def: PieceDefinition;
  object: THREE.Object3D;
  aim: Aim;
  /** Pieza en la que se está clavando (definida desde AIMING). */
  parent: PieceNode | null;
  /** Nodo en la construcción, una vez que la punta entró. */
  node: PieceNode | null;
  seed: number;
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
  /** Disparado ante eventos de feedback (fase 3: sonido, sacudida, migas). */
  onEvent: ((e: 'pick' | 'drop' | 'contact' | 'inserting' | 'out', piece?: ActivePiece) => void) | null = null;

  private active: ActivePiece | null = null;
  private rotating = false;
  private press: 'push' | 'pull' | null = null;
  private pressTime = 0;
  private seedCounter = 1;
  private hover: SurfaceHit | null = null;
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
      case InteractionState.IDLE:
        if (bowl && this.canGrab(bowl)) this.grab(bowl);
        else this.startRotate();
        break;
      case InteractionState.HOLDING: {
        if (bowl) {
          this.returnToBowl();
          if (bowl !== this.active?.def.type && this.canGrab(bowl)) this.grab(bowl);
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
        // Mantener siempre actúa sobre el palito recién clavado (el cursor suele haber quedado lejos
        // después de apuntar). Para soltarlo: Esc o agarrar otro del bowl.
        if (bowl) {
          this.release();
          if (this.canGrab(bowl)) this.grab(bowl);
        } else {
          this.startPress(input.shift ? 'pull' : 'push');
        }
        break;
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
      // El palito pivota alrededor de la punta: la cola sigue al mouse.
      this.active.aim.addTilt(dx * TILT_PER_PX, -dy * TILT_PER_PX);
    }
  }

  private onKey(e: KeyboardEvent): void {
    const { overlay } = this.d;
    if (e.code === 'KeyH') {
      overlay.toggle();
      return;
    }
    if (e.code === 'Escape') {
      if (this.state === InteractionState.HOLDING) this.returnToBowl();
      else if (this.state === InteractionState.AIMING) this.backToHand();
      else if (this.state === InteractionState.PLACED) this.release();
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

  /** Fase 2: sólo palitos (las papitas llegan en la fase 3). */
  private canGrab(type: string): boolean {
    return type === 'palito';
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
    // Arranca saliendo del bowl.
    const bowl = this.bowlWorldPos(type);
    object.position.copy(bowl);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.3, 1, 0.4).normalize());
    this.hover = null;
    this.state = InteractionState.HOLDING;
    this.onEvent?.('pick', this.active);
    overlay.hint('holding', 'tocá el chizito donde lo quieras clavar · Esc lo devuelve');
  }

  private returnToBowl(): void {
    const a = this.active;
    if (!a) return;
    if (a.node) this.d.construction.remove(a.node.data.id);
    a.object.removeFromParent();
    a.object.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    setGhost(a.object, null);
    this.d.picker.ignore.delete(a.object);
    this.active = null;
    this.ring.visible = false;
    this.state = InteractionState.IDLE;
    this.onEvent?.('drop');
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

  /** De AIMING (o al sacarlo del todo) vuelve a la mano. */
  private backToHand(): void {
    const a = this.active;
    if (!a) return;
    if (a.node) {
      a.object.updateMatrixWorld(true);
      const world = a.object.matrixWorld.clone();
      this.d.construction.remove(a.node.data.id);
      a.node = null;
      this.d.scene.add(a.object);
      world.decompose(a.object.position, a.object.quaternion, a.object.scale);
    } else {
      this.d.scene.attach(a.object);
    }
    a.parent = null;
    a.aim.depth = -AIM_GAP;
    a.aim.tiltX = a.aim.tiltY = 0;
    this.stopPress();
    this.state = InteractionState.HOLDING;
  }

  /** Suelta la pieza activa (queda clavada) y vuelve a IDLE. */
  private release(): void {
    const a = this.active;
    if (a) {
      this.d.picker.ignore.delete(a.object);
      if (!a.node) this.returnToBowl();
    }
    this.active = null;
    this.ring.visible = false;
    this.state = InteractionState.IDLE;
  }

  private startPress(kind: 'push' | 'pull'): void {
    const a = this.active;
    if (!a) return;
    if (kind === 'pull' && a.aim.depth <= 0) return;
    this.press = kind;
    this.pressTime = 0;
    this.state = InteractionState.INSERTING;
  }

  private stopPress(): void {
    if (!this.press) return;
    this.press = null;
    if (this.state !== InteractionState.INSERTING) return;
    const a = this.active;
    if (a && a.aim.depth > 0) {
      this.state = InteractionState.PLACED;
      this.d.overlay.hint('placed', 'mantené para hundirlo más · Shift + mantener para sacarlo · Esc lo suelta', 6500);
    } else {
      this.state = InteractionState.AIMING;
    }
  }

  private commit(a: ActivePiece): void {
    const parent = a.parent!;
    const data = {
      id: newPieceId(a.def.type),
      type: a.def.type,
      parentId: parent.data.id,
      seed: a.seed,
      entryPoint: [0, 0, 0] as [number, number, number],
      direction: [0, -1, 0] as [number, number, number],
      depth: 0,
      spin: a.aim.spin,
      localMatrix: [] as number[],
    };
    a.aim.writeData(data, a.object);
    a.node = this.d.construction.add(data, a.object);
    this.onEvent?.('contact', a);
  }

  private bowlWorldPos(type: string): THREE.Vector3 {
    const bowl = this.d.picker.bowls.get(type);
    return bowl ? bowl.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.05, 0)) : this.d.center.clone();
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
      else if (aim.depth > 0) this.onEvent?.('inserting', a);
    } else if (this.press === 'pull') {
      aim.depth -= PULL_SPEED * accel * dt;
      if (aim.depth <= 0) {
        this.onEvent?.('out', a);
        aim.pose(a.object.position, a.object.quaternion);
        this.backToHand();
        return;
      }
    }
    aim.pose(a.object.position, a.object.quaternion);
    if (a.node) aim.writeData(a.node.data, a.object);
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
      (s === InteractionState.HOLDING && this.hover) || s === InteractionState.AIMING || s === InteractionState.INSERTING;
    if (!showing) {
      this.d.overlay.setAngle(null);
      return;
    }
    const [x, y] = s === InteractionState.HOLDING ? [90, 90] : a.aim.displayAngles();
    // Junto al palito, sobre su eje, hacia la cola.
    a.object.updateMatrixWorld(true);
    const p = this.tmpV.set(0, a.def.dimensions.length * 0.85, 0).applyMatrix4(a.object.matrixWorld).project(this.d.camera);
    const sx = (p.x * 0.5 + 0.5) * window.innerWidth + 14;
    const sy = (-p.y * 0.5 + 0.5) * window.innerHeight - 6;
    this.d.overlay.setAngle(`X ${x}° · Y ${y}°`, sx, sy);
  }

  private updateCursor(): void {
    if (this.rotating) return;
    const p = this.d.input.pointer;
    const overBowl = this.state !== InteractionState.INSERTING && this.d.picker.pickBowl(p.ndcX, p.ndcY) !== null;
    document.body.classList.toggle('over-bowl', overBowl);
  }
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const Z_UP = new THREE.Vector3(0, 0, 1);
