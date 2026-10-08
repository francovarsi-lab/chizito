import * as THREE from 'three';

/**
 * Migas diminutas que se desprenden del punto de entrada y caen a la mesa (y = 0), con un rebote
 * mínimo. Quedan sobre el mantel (como en la vida real) hasta un máximo; las más viejas se van.
 */
interface Crumb {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  resting: boolean;
}

const MAX_CRUMBS = 70;
const GRAVITY = -9.8;

export class Crumbs {
  private readonly crumbs: Crumb[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mat: THREE.MeshStandardMaterial;

  constructor(
    private readonly scene: THREE.Scene,
    color = '#f2c95a',
  ) {
    // Unas pocas formas irregulares reutilizables.
    for (let k = 0; k < 4; k++) {
      const g = new THREE.IcosahedronGeometry(0.5, 0);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const f = 0.65 + Math.random() * 0.6;
        pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.8, pos.getZ(i) * f);
      }
      g.computeVertexNormals();
      this.geos.push(g);
    }
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  }

  /** Suelta `n` migas desde `point` (mundo), empujadas levemente hacia `away` (normal saliente). */
  emit(point: THREE.Vector3, away: THREE.Vector3, n = 2): void {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.geos[Math.floor(Math.random() * this.geos.length)], this.mat);
      mesh.scale.setScalar(0.0009 + Math.random() * 0.0009);
      mesh.position.copy(point).addScaledVector(away, 0.0012);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const vel = away
        .clone()
        .multiplyScalar(0.03 + Math.random() * 0.04)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.04, Math.random() * 0.02, (Math.random() - 0.5) * 0.04));
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30);
      this.scene.add(mesh);
      this.crumbs.push({ mesh, vel, spin, resting: false });
    }
    while (this.crumbs.length > MAX_CRUMBS) {
      const old = this.crumbs.shift()!;
      old.mesh.removeFromParent();
    }
  }

  private readonly stuck: THREE.Mesh[] = [];
  private stuckMat: THREE.MeshStandardMaterial | null = null;
  private dentMat: THREE.MeshBasicMaterial | null = null;
  private dentGeo: THREE.PlaneGeometry | null = null;

  /** Sombra hundida alrededor del agujero (gradiente radial suave). */
  private dent(): { geo: THREE.PlaneGeometry; mat: THREE.MeshBasicMaterial } {
    if (!this.dentMat || !this.dentGeo) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, 'rgba(90,50,10,0.9)');
      g.addColorStop(0.35, 'rgba(110,65,15,0.55)');
      g.addColorStop(1, 'rgba(120,70,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.dentMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      this.dentGeo = new THREE.PlaneGeometry(1, 1);
    }
    return { geo: this.dentGeo, mat: this.dentMat };
  }

  /**
   * Miguitas que quedan pegadas alrededor del agujero (hijas de la pieza, así giran con ella).
   * `point` y `normal` en coordenadas locales de `parent`.
   */
  stick(parent: THREE.Object3D, point: THREE.Vector3, normal: THREE.Vector3, n = 2): void {
    const t1 = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(normal, t1);
    // Leve hundimiento oscuro alrededor del agujero.
    const { geo, mat } = this.dent();
    const dent = new THREE.Mesh(geo, mat);
    dent.position.copy(point).addScaledVector(normal, 0.0004);
    dent.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    dent.scale.setScalar(0.0085);
    dent.userData.noPick = true;
    dent.renderOrder = 1;
    parent.add(dent);
    this.stuck.push(dent);
    // Miga del interior inflado: más clara que la superficie.
    this.stuckMat ??= new THREE.MeshStandardMaterial({ color: '#fff0c4', roughness: 0.95, flatShading: true });
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.geos[Math.floor(Math.random() * this.geos.length)], this.stuckMat);
      const a = Math.random() * Math.PI * 2;
      const r = 0.0026 + Math.random() * 0.0018;
      mesh.position.copy(point).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).addScaledVector(normal, 0.0002);
      mesh.scale.setScalar(0.0011 + Math.random() * 0.0008);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      mesh.receiveShadow = true;
      mesh.userData.noPick = true; // decoración: no cuenta para apuntar ni seleccionar
      parent.add(mesh);
      this.stuck.push(mesh);
    }
    while (this.stuck.length > MAX_CRUMBS) this.stuck.shift()!.removeFromParent();
  }

  update(dt: number): void {
    for (const c of this.crumbs) {
      if (c.resting) continue;
      c.vel.y += GRAVITY * dt;
      c.vel.multiplyScalar(Math.exp(-dt * 1.5)); // algo de arrastre del aire
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      const floor = 0.0008 + c.mesh.scale.x * 0.35;
      if (c.mesh.position.y <= floor) {
        c.mesh.position.y = floor;
        if (Math.abs(c.vel.y) > 0.15) {
          c.vel.y *= -0.25;
          c.vel.x *= 0.5;
          c.vel.z *= 0.5;
          c.spin.multiplyScalar(0.4);
        } else {
          c.resting = true;
        }
      }
    }
  }

  clear(): void {
    for (const c of this.crumbs) c.mesh.removeFromParent();
    this.crumbs.length = 0;
    for (const m of this.stuck) m.removeFromParent();
    this.stuck.length = 0;
  }
}
