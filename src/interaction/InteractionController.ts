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

/** Velocidades del clavado (m/s), proporcionales al largo del palito (3,5 cm). */
const PUSH_SPEED = 0.02;
const PULL_SPEED = 0.024;
/** Sensibilidad del ángulo con el mouse (rad/px). */
const TILT_PER_PX = THREE.MathUtils.degToRad(0.32);
/** Giro propio con Q / E (rad por pulsación); sirve sobre todo para orientar la papita. */
const SPIN_STEP = THREE.MathUtils.degToRad(15);
/** Rueda del mouse: metros de profundidad por píxel de scroll (un "clic" típico ≈ 100 px ≈ 3 mm). */
const WHEEL_M_PER_PX = 0.00003;

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
  /** Tiempo desde que salió del vaso/bowl (animación de "pop"). */
  popT?: number;
  /** Parámetros de forma elegidos por el jugador (mordiscos de la papita, variante…). */
  params: Record<string, unknown>;
  /**
   * Pieza larga (palito) en cuya cola se está ensartando esta (chizito extra). Mientras está en la
   * mano (HOLDING) se "presenta" sobre la punta; desde AIMING, `aim` vive en el marco de ESTA pieza.
   */
  mount?: PieceNode;
}

export type FeedbackEvent = 'pick' | 'drop' | 'contact' | 'inserting' | 'out' | 'remove' | 'break';

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
  private wheelTarget: number | null = null;
  private wheelBefore: Snapshot | null = null;
  private wheelIdle = 0;
  /** Semillas distintas en cada sesión: no hay dos piezas iguales ni entre partidas. */
  private seedCounter = Math.floor(Math.random() * 1e6);
  /** Última variante elegida por tipo (al volver a agarrar se ofrece la misma). */
  private lastVariant = new Map<string, string>();
  private hover: SurfaceHit | null = null;
  /** Punto del chizito presentado (para ensartar) bajo el cursor, en mundo. */
  private mountHover: { point: THREE.Vector3; normal: THREE.Vector3 } | null = null;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpM2 = new THREE.Matrix4();
  private resetArmedUntil = 0;
  /** Objetos de piezas quitadas, para reutilizarlos al deshacer sin regenerar la malla. */
  private readonly graveyard = new Map<string, THREE.Object3D>();
  /** Piezas devueltas que se están achicando antes de desaparecer. */
  private readonly leaving: { obj: THREE.Object3D; t: number; from: number }[] = [];
  private time = 0;
  /** true mientras el jugador tiene algo en la mano (la flotación del chizito se calma). */
  get busy(): boolean {
    return this.active !== null && this.state !== InteractionState.IDLE;
  }
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
    // Ctrl + rueda = profundidad (la rueda sola es el zoom de la cámara).
    input.onWheel((e) => {
      if (e.ctrl) this.onWheel(e.dy);
    });
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
        if (this.active && this.mountOnly(this.active)) {
          // Chizito extra: primero se elige el palito; después, sobre el chizito, por dónde entra.
          const a = this.active;
          const spot = a.mount ? picker.pickObject(p.ndcX, p.ndcY, a.object) : null;
          if (spot) {
            this.beginMountAim(spot);
            break;
          }
          const tail = this.pickFreeTail();
          if (tail) this.presentMount(tail);
          else if (a.mount) this.cancelMount();
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
      // La pieza pivota alrededor de la punta: la cola sigue al mouse. Ensartando un chizito, lo que
      // se mueve es el chizito (el palito queda quieto), así que el gesto se invierte.
      const k = this.active.mount ? -TILT_PER_PX : TILT_PER_PX;
      this.active.aim.addTilt(dx * k, -dy * k);
    }
  }

  /**
   * Ctrl + rueda = profundidad: alejarla clava, acercarla saca (ir "hacia atrás"). Funciona al
   * apuntar y con una pieza clavada o seleccionada. Cada giro se anima suave hacia el objetivo.
   */
  private onWheel(dy: number): void {
    const a = this.active;
    const s = this.state;
    const ok = s === InteractionState.AIMING || s === InteractionState.PLACED || s === InteractionState.SELECTED_PLACED_PIECE;
    if (!a || !ok || this.press) return;
    if (this.wheelTarget === null) {
      this.wheelTarget = a.aim.depth;
      this.wheelBefore = this.snapshot();
    }
    this.wheelTarget = THREE.MathUtils.clamp(this.wheelTarget - dy * WHEEL_M_PER_PX, -AIM_GAP * 2, this.maxDepth(a));
    this.wheelIdle = 0;
    this.d.overlay.dismissHint(300);
  }

  /** Avanza la profundidad hacia el objetivo de la rueda (con los mismos eventos que mantener). */
  private updateWheel(a: ActivePiece, dt: number): void {
    if (this.wheelTarget === null) return;
    const aim = a.aim;
    const before = aim.depth;
    const step = PUSH_SPEED * 1.6 * dt;
    aim.depth += THREE.MathUtils.clamp(this.wheelTarget - aim.depth, -step, step);
    if (before <= 0 && aim.depth > 0 && !a.node) {
      this.commit(a);
      this.state = a.selected ? InteractionState.SELECTED_PLACED_PIECE : InteractionState.PLACED;
    } else if (aim.depth > before && aim.depth > 0) {
      this.emit('inserting', this.info(a, dt));
    }
    if (aim.depth <= 0 && a.node) {
      // Salió del todo: vuelve a la mano, como con Shift + mantener.
      const info = this.info(a, dt);
      aim.depth = 0;
      const wb = this.wheelBefore;
      this.wheelTarget = null;
      this.wheelBefore = null;
      this.backToHand();
      this.emit('out', info);
      if (wb) this.record('sacar', wb);
      return;
    }
    this.pose(a);
    if (a.node) aim.writeData(a.node.data, a.object);
    if (Math.abs(this.wheelTarget - aim.depth) < 1e-5) {
      this.wheelIdle += dt;
      if (this.wheelIdle > 0.35) {
        const wb = this.wheelBefore;
        this.wheelTarget = null;
        this.wheelBefore = null;
        if (wb) this.record('rueda', wb);
      }
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
      if (this.state === InteractionState.HOLDING && this.active?.mount) this.cancelMount();
      else if (this.state === InteractionState.HOLDING) this.returnToBowl();
      else if (this.state === InteractionState.AIMING && this.active?.mount && !this.active.node) {
        // Ensartando: vuelve a la presentación sobre la punta para elegir otro punto.
        this.active.parent = null;
        this.active.aim.tiltX = this.active.aim.tiltY = 0;
        this.state = InteractionState.HOLDING;
      } else if (this.state === InteractionState.AIMING) this.backToHand();
      else if (this.state === InteractionState.PLACED || this.state === InteractionState.SELECTED_PLACED_PIECE) this.release();
      return;
    }
    if ((e.code === 'Delete' || e.code === 'Backspace') && this.active?.node && !this.press) {
      e.preventDefault();
      this.removeActive();
      return;
    }
    // Q / E: girar la pieza sobre su eje en cualquier momento (en la mano, apuntando, clavándola o ya clavada).
    if (this.active && (e.code === 'KeyQ' || e.code === 'KeyE')) {
      const a = this.active;
      const settled = this.state === InteractionState.PLACED || this.state === InteractionState.SELECTED_PLACED_PIECE;
      const before = settled ? this.snapshot() : null;
      a.aim.spin += e.code === 'KeyQ' ? -SPIN_STEP : SPIN_STEP;
      if (a.node && this.state !== InteractionState.HOLDING) {
        this.pose(a);
        a.aim.writeData(a.node.data, a.object);
      }
      if (before) this.record('girar', before);
      return;
    }
    // B: partir la pieza en la mano (le saca un pedazo irregular del borde). Repetible.
    if (e.code === 'KeyB' && this.state === InteractionState.HOLDING && this.active) {
      this.breakActive();
      return;
    }
    // V: elegir variante de la pieza en la mano.
    if (e.code === 'KeyV' && this.state === InteractionState.HOLDING && this.active) {
      this.cycleVariant();
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
    return def.canPierce || !!def.mountsOnTail;
  }

  private grab(type: string): void {
    const { assets, pieces, scene, picker, overlay } = this.d;
    const def = pieces.get(type);
    const seed = this.seedCounter++ * 7 + 100;
    const params: Record<string, unknown> = {};
    if (def.variants?.length) params.variant = this.lastVariant.get(type) ?? def.variants[0].id;
    const object = assets.create(type, seed, 'hero', params);
    markHero(object);
    const aim = new Aim();
    aim.spin = Math.random() * Math.PI * 2;
    scene.add(object);
    picker.ignore.add(object);
    this.active = { def, object, aim, parent: null, node: null, seed, popT: 0, params };
    object.scale.setScalar(0.001);
    // Arranca saliendo del vaso / bowl.
    object.position.copy(this.bowlWorldPos(type));
    object.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(0.3, 1, 0.4).normalize());
    this.hover = null;
    this.state = InteractionState.HOLDING;
    this.emit('pick', null);
    if (def.holdHint) overlay.hint(`holding-${type}`, def.holdHint);
    else overlay.hint('holding', 'tocá el chizito donde lo quieras clavar · Esc lo devuelve');
  }

  private returnToBowl(): void {
    const a = this.active;
    if (!a) return;
    if (a.node) this.d.construction.remove(a.node.data.id);
    setGhost(a.object, null);
    // Se encoge suave de vuelta al vaso y recién ahí se descarta.
    this.leaving.push({ obj: a.object, t: 0, from: a.object.scale.x });
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
    this.d.overlay.hint('aiming', 'mové el mouse para elegir el ángulo · mantené apretado (o Ctrl + rueda) para clavar');
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
    this.active = {
      def,
      object: node.object,
      aim,
      parent: node.parent,
      node,
      seed: node.data.seed,
      selected: true,
      params: node.data.params ? structuredClone(node.data.params) : {},
      mount: node.data.mount === 'tail' && node.parent ? node.parent : undefined,
    };
    this.d.picker.ignore.add(node.object);
    setHighlight(node.object, true);
    this.state = InteractionState.SELECTED_PLACED_PIECE;
    this.d.overlay.hint('selected', 'mantené para hundirla · Shift + mantener para sacarla · Supr la quita · Esc la suelta', 6500);
  }

  /** Parte la pieza en la mano: suma un mordisco y regenera su forma (determinista por semilla). */
  private breakActive(): void {
    const a = this.active!;
    if (!a.def.breakable) return;
    if (this.d.assets.hasGlb(a.def.type)) {
      this.d.overlay.flash('esta pieza viene de un modelo .glb: no se puede partir', 1800);
      return;
    }
    const bites = ((a.params.bites as number[] | undefined) ?? []).slice();
    if (bites.length >= 7) {
      this.d.overlay.flash('ya no se puede achicar más', 1200);
      return;
    }
    bites.push(Math.floor(Math.random() * 1e9));
    a.params.bites = bites;
    const fresh = this.regenerate();
    const p = fresh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, a.def.dimensions.length * 0.5, 0));
    this.emit('break', { def: a.def, point: p, normal: new THREE.Vector3(0, 1, 0), dir: new THREE.Vector3(0, -1, 0), depth: 0, dt: 0, parent: null, localPoint: p, localNormal: new THREE.Vector3(0, 1, 0) });
    this.d.overlay.hint('break', 'B la sigue partiendo · cada pieza queda única');
  }

  /** V en la mano: pasa a la siguiente variante de la pieza (escarbadientes ↔ espadita…). */
  private cycleVariant(): void {
    const a = this.active!;
    const vs = a.def.variants;
    if (!vs || vs.length < 2) return;
    const i = vs.findIndex((v) => v.id === a.params.variant);
    const next = vs[(i + 1) % vs.length];
    a.params.variant = next.id;
    this.lastVariant.set(a.def.type, next.id);
    this.regenerate();
    this.emit('pick', null);
    this.d.overlay.flash(next.label, 1100);
  }

  /** Rehace la malla de la pieza en la mano con sus params actuales (misma pose y semilla). */
  private regenerate(): THREE.Object3D {
    const a = this.active!;
    const old = a.object;
    const fresh = this.d.assets.create(a.def.type, a.seed, 'hero', a.params);
    markHero(fresh);
    fresh.position.copy(old.position);
    fresh.quaternion.copy(old.quaternion);
    fresh.scale.copy(old.scale);
    old.parent?.add(fresh);
    old.removeFromParent();
    old.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.d.picker.ignore.delete(old);
    this.d.picker.ignore.add(fresh);
    a.object = fresh;
    a.popT = 0.18; // pequeño rebote al cambiar de forma
    return fresh;
  }

  // ───────────────────────────── ensartar en la cola ─────────────────────────────

  /** Pieza que no se clava sino que se ensarta en la cola de un palito (chizito extra). */
  private mountOnly(a: ActivePiece): boolean {
    return !!a.def.mountsOnTail && !a.def.canPierce;
  }

  /** Palito (u otra pieza `tailMount`) clavado bajo el cursor con la cola libre, o null. */
  private pickFreeTail(): PieceNode | null {
    const p = this.d.input.pointer;
    const node = this.d.picker.pickPlaced(p.ndcX, p.ndcY);
    if (!node || !this.d.pieces.get(node.data.type).tailMount) return null;
    return node.children.some((c) => c.data.mount === 'tail') ? null : node;
  }

  /** Presenta el chizito en la mano sobre la punta libre del palito, para elegir por dónde entra. */
  private presentMount(node: PieceNode): void {
    const a = this.active!;
    tailFrame(node.object); // se calcula antes de colgarle nada
    a.mount = node;
    node.object.attach(a.object);
    setGhost(a.object, null);
    this.hover = null;
    this.mountHover = null;
    this.d.overlay.hint('mount', 'tocá el chizito donde quieras que le entre el palito · Esc cancela');
  }

  private cancelMount(): void {
    const a = this.active!;
    this.d.scene.attach(a.object);
    a.mount = undefined;
    this.mountHover = null;
  }

  /** Pose de presentación (local al palito): el chizito acostado sobre la punta, de cara a la cámara. */
  private presentPose(a: ActivePiece, k: number): void {
    const P = a.mount!.object;
    const tail = this.tmpV.setFromMatrixPosition(tailFrame(P));
    const r = a.def.dimensions.thickness / 2;
    this.targetPos.copy(tail).add(this.tmpV2.set(0, r + 0.007, 0));
    P.updateMatrixWorld(true);
    const inv = P.getWorldQuaternion(this.tmpQ).invert();
    const y = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(this.d.camera.quaternion).applyQuaternion(inv);
    x.addScaledVector(y, -x.dot(y));
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    this.targetQuat.setFromRotationMatrix(this.tmpM.makeBasis(x, y, z));
    a.object.position.lerp(this.targetPos, k);
    a.object.quaternion.slerp(this.targetQuat, k);
  }

  /** Clic sobre el chizito presentado: ese punto es la "superficie" donde entra la cola del palito. */
  private beginMountAim(spot: { point: THREE.Vector3; normal: THREE.Vector3 }): void {
    const a = this.active!;
    const obj = a.object;
    obj.updateMatrixWorld(true);
    const inv = this.tmpM.copy(obj.matrixWorld).invert();
    const entry = spot.point.clone().applyMatrix4(inv);
    const normal = spot.normal.clone().transformDirection(inv);
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.d.camera.quaternion).transformDirection(inv);
    a.aim.setFrame(entry, normal, camRight);
    a.aim.tiltX = a.aim.tiltY = 0;
    a.aim.depth = -AIM_GAP;
    a.aim.spin = 0;
    a.parent = a.mount!;
    this.mountHover = null;
    this.state = InteractionState.AIMING;
    this.d.overlay.hint('aiming-mount', 'mové el mouse para inclinarlo · mantené apretado (o Ctrl + rueda) para ensartarlo');
  }

  /**
   * Pose de la pieza activa según su apuntado. Ensartando, `aim` describe una "punta virtual" (la cola
   * del palito, mirando hacia el palito) clavada en el chizito; el chizito queda en
   * cola · inversa(punta en el chizito), en coordenadas del palito. Con `smooth` se acerca suave.
   */
  private pose(a: ActivePiece, smooth = 0): void {
    if (!a.mount) {
      a.aim.pose(a.object.position, a.object.quaternion);
      return;
    }
    a.aim.pose(this.tmpV, this.tmpQ);
    const tipInPiece = this.tmpM2.compose(this.tmpV, this.tmpQ, ONE).invert();
    this.tmpM.copy(tailFrame(a.mount.object)).multiply(tipInPiece);
    this.tmpM.decompose(this.targetPos, this.targetQuat, this.tmpV2);
    if (smooth > 0) {
      a.object.position.lerp(this.targetPos, smooth);
      a.object.quaternion.slerp(this.targetQuat, smooth);
    } else {
      a.object.position.copy(this.targetPos);
      a.object.quaternion.copy(this.targetQuat);
    }
  }

  /** Profundidad máxima: la propia de la pieza o, ensartando, lo que queda del palito afuera. */
  private maxDepth(a: ActivePiece): number {
    if (!a.mount) return a.def.maxDepth;
    const tailY = new THREE.Vector3().setFromMatrixPosition(tailFrame(a.mount.object)).y;
    return Math.max(0.004, tailY - a.mount.data.depth - 0.003);
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
    a.mount = undefined;
    this.mountHover = null;
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
    if (this.wheelTarget !== null) {
      const wb = this.wheelBefore;
      this.wheelTarget = null;
      this.wheelBefore = null;
      if (wb) this.record('rueda', wb);
    }
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
        this.d.overlay.hint('placed', 'mantené para hundirlo · Shift + mantener (o Ctrl + rueda hacia vos) para sacarlo · Esc lo suelta', 6500);
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
      params: Object.keys(a.params).length ? structuredClone(a.params) : undefined,
    };
    if (a.mount) data.mount = 'tail';
    a.aim.writeData(data, a.object);
    a.node = this.d.construction.add(data, a.object);
    this.emit('contact', this.info(a, 0));
  }

  private bowlWorldPos(type: string): THREE.Vector3 {
    const bowl = this.d.picker.bowls.get(type);
    return bowl ? bowl.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.04, 0)) : this.d.center.clone();
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
    this.wheelTarget = null;
    this.wheelBefore = null;
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
      const obj = this.d.assets.create(d.type, d.seed, 'hero', d.params);
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
    this.time += dt;
    this.d.rotator.update(dt);
    this.updateLeaving(dt);
    const a = this.active;
    if (a && a.popT !== undefined) {
      // "Pop" al salir del vaso: crece con un rebote elástico (easeOutBack).
      a.popT += dt;
      const t = Math.min(1, a.popT / 0.42);
      const c = 2.2;
      const k = 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
      a.object.scale.setScalar(Math.max(0.001, k));
      if (t >= 1) {
        a.object.scale.setScalar(1);
        a.popT = undefined;
      }
    }
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
        if (this.wheelTarget !== null) this.updateWheel(a, dt);
        // El chizito que se ensarta se acomoda suave al cambiar el punto o el ángulo.
        else this.pose(a, a.mount && this.state === InteractionState.AIMING ? 1 - Math.exp(-dt * 14) : 0);
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
    const k = 1 - Math.exp(-dt * 16);
    if (a.mount) {
      // Presentado sobre la punta del palito: el anillo muestra por dónde le entraría.
      this.presentPose(a, k);
      if (!this.rotating) this.mountHover = picker.pickObject(p.ndcX, p.ndcY, a.object);
      return;
    }
    const hit = this.mountOnly(a) || this.rotating ? (this.mountOnly(a) ? null : this.hover) : picker.pickSurface(p.ndcX, p.ndcY);
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
      this.pose(a);
      return;
    }
    this.pressTime += dt;
    // Arranque suave: primero "encuentra" resistencia y después cede.
    const accel = 0.22 + 0.78 * THREE.MathUtils.smoothstep(this.pressTime, 0, 0.32);
    const aim = a.aim;
    if (this.press === 'push') {
      const crust = aim.depth < 0 ? 1 : 0.3 + 0.7 * THREE.MathUtils.smoothstep(aim.depth, 0.0005, 0.0045);
      const before = aim.depth;
      aim.depth = Math.min(this.maxDepth(a), aim.depth + PUSH_SPEED * accel * crust * dt);
      if (before <= 0 && aim.depth > 0) this.commit(a);
      else if (aim.depth > 0 && aim.depth > before) this.emit('inserting', this.info(a, dt));
    } else if (this.press === 'pull') {
      aim.depth -= PULL_SPEED * accel * dt;
      if (aim.depth <= 0) {
        const info = this.info(a, dt);
        aim.depth = 0;
        this.pose(a);
        const before = this.pressBefore;
        this.press = null;
        this.pressBefore = null;
        this.backToHand();
        this.emit('out', info);
        if (before) this.record('sacar', before);
        return;
      }
    }
    this.pose(a);
    if (a.node) aim.writeData(a.node.data, a.object);
  }

  /** Punto de entrada, normal y dirección de avance en mundo, para el feedback. */
  private info(a: ActivePiece, dt: number): FeedbackInfo {
    // Ensartando, el punto de entrada está sobre la propia pieza (el chizito nuevo).
    const target = a.mount ? a.object : a.parent?.object ?? null;
    const obj = target ?? a.object.parent ?? this.d.scene;
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
      parent: target,
      localPoint: a.aim.entry.clone(),
      localNormal: a.aim.normal.clone(),
    };
  }

  private emit(e: FeedbackEvent, info: FeedbackInfo | null): void {
    this.onEvent?.(e, info);
  }

  private updateLeaving(dt: number): void {
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      l.t += dt;
      const t = Math.min(1, l.t / 0.22);
      l.obj.scale.setScalar(Math.max(0.001, l.from * (1 - t * t)));
      if (t >= 1) {
        l.obj.removeFromParent();
        l.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        this.leaving.splice(i, 1);
      }
    }
  }

  private updateRing(a: ActivePiece): void {
    // Late suave, como una respiración.
    const breath = 0.5 + 0.5 * Math.sin(this.time * 4.2);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.26 + 0.16 * breath;
    this.ring.scale.setScalar(1 + 0.12 * breath);
    const show =
      (this.state === InteractionState.HOLDING && (this.hover !== null || (!!a.mount && this.mountHover !== null))) ||
      (this.state === InteractionState.AIMING && a.parent !== null);
    this.ring.visible = show;
    if (!show) return;
    if (this.state === InteractionState.HOLDING && a.mount && this.mountHover) {
      this.ring.position.copy(this.mountHover.point).addScaledVector(this.mountHover.normal, 0.0003);
      this.ring.quaternion.setFromUnitVectors(Z_UP, this.mountHover.normal);
    } else if (this.state === InteractionState.HOLDING && this.hover) {
      this.ring.position.copy(this.hover.point).addScaledVector(this.hoverNormal, 0.0003);
      this.ring.quaternion.setFromUnitVectors(Z_UP, this.hoverNormal);
    } else if (a.parent) {
      const obj = a.mount ? a.object : a.parent.object;
      const n = this.tmpV.copy(a.aim.normal).transformDirection(obj.matrixWorld);
      this.ring.position.copy(a.aim.entry).applyMatrix4(obj.matrixWorld).addScaledVector(n, 0.0003);
      this.ring.quaternion.setFromUnitVectors(Z_UP, n);
    }
  }

  private updateAngleLabel(a: ActivePiece): void {
    const s = this.state;
    const showing =
      (s === InteractionState.HOLDING && (this.hover || (a.mount && this.mountHover))) || s === InteractionState.AIMING || (s === InteractionState.INSERTING && !a.node);
    if (!showing) {
      this.d.overlay.setAngle(null);
      return;
    }
    const [x, y] = s === InteractionState.HOLDING ? [90, 90] : a.aim.displayAngles();
    // Junto a la pieza, sobre su eje, hacia la cola.
    a.object.updateMatrixWorld(true);
    const p = a.mount
      ? this.tmpV.setFromMatrixPosition(tailFrame(a.mount.object)).applyMatrix4(a.mount.object.matrixWorld).project(this.d.camera)
      : this.tmpV.set(0, a.def.dimensions.length * 0.85, 0).applyMatrix4(a.object.matrixWorld).project(this.d.camera);
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
    const a = this.active;
    const mounting = this.state === InteractionState.HOLDING && !!a && this.mountOnly(a);
    const overPiece =
      !busy &&
      !overBowl &&
      ((canSelect && this.d.picker.pickPlaced(p.ndcX, p.ndcY) !== null) ||
        (mounting && (this.pickFreeTail() !== null || (!!a.mount && this.mountHover !== null))));
    document.body.classList.toggle('over-bowl', overBowl || overPiece);
  }
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const Z_UP = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * Marco de la cola de una pieza larga, local a la pieza: origen en el centro del corte de la cola y
 * +Y mirando de vuelta hacia el cuerpo (como la punta de una pieza que se clava). Se calcula una vez
 * a partir de la malla (sirve igual para el procedural y para un GLB).
 */
function tailFrame(obj: THREE.Object3D): THREE.Matrix4 {
  const cached = obj.userData.tailFrame as THREE.Matrix4 | undefined;
  if (cached) return cached;
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert();
  const meshes: { m: THREE.Mesh; toLocal: THREE.Matrix4 }[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // Sólo la malla propia: nada de lo que tenga colgado (otras piezas).
    for (let cur: THREE.Object3D | null = m; cur && cur !== obj; cur = cur.parent) if (cur.userData.pieceId) return;
    meshes.push({ m, toLocal: inv.clone().multiply(m.matrixWorld) });
  });
  const v = new THREE.Vector3();
  let maxY = -Infinity;
  for (const { m, toLocal } of meshes) {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, v.fromBufferAttribute(pos, i).applyMatrix4(toLocal).y);
  }
  const acc = new THREE.Vector3();
  let n = 0;
  for (const { m, toLocal } of meshes) {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
      if (v.y > maxY - 0.0004) {
        acc.add(v);
        n++;
      }
    }
  }
  acc.divideScalar(Math.max(1, n));
  const frame = new THREE.Matrix4().makeRotationX(Math.PI).setPosition(acc.x, maxY, acc.z);
  obj.userData.tailFrame = frame;
  return frame;
}
