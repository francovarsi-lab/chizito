import * as THREE from 'three';

// --- Audio: sonidos sintetizados de reemplazo. Si existen archivos en
// public/assets/sounds/<name>.(ogg|mp3|wav) se usan en su lugar. ---
type SoundName = 'pick' | 'drop' | 'crack' | 'crunch' | 'out';
export class AudioManager {
  ctx = new AudioContext();
  buffers = new Map<SoundName, AudioBuffer>();

  async init() {
    for (const name of ['pick', 'drop', 'crack', 'crunch', 'out'] as SoundName[]) {
      const buf = await this.tryLoadFile(name) ?? this.synth(name);
      this.buffers.set(name, buf);
    }
  }

  async tryLoadFile(name: SoundName): Promise<AudioBuffer | null> {
    for (const ext of ['ogg', 'mp3', 'wav']) {
      try {
        const res = await fetch(`/assets/sounds/${name}.${ext}`);
        if (!res.ok) continue;
        const arr = await res.arrayBuffer();
        return await this.ctx.decodeAudioData(arr);
      } catch { /* probar siguiente extensión */ }
    }
    return null;
  }

  synth(name: SoundName): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const dur = name === 'crack' ? 0.08 : name === 'crunch' ? 0.1 : 0.15;
    const buf = this.ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * (name === 'pick' || name === 'drop' ? 18 : 30));
      if (name === 'pick' || name === 'drop') {
        const f = name === 'pick' ? 700 : 300;
        d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.25;
      } else {
        d[i] = (Math.random() * 2 - 1) * env * (name === 'crack' ? 0.35 : 0.12);
      }
    }
    return buf;
  }

  play(name: SoundName, vol = 1) {
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }
}

// --- Sacudida amortiguada del chizito al primer contacto ---
export class Shaker {
  t = -1;
  update(group: THREE.Group, dt: number, basePos: THREE.Vector3) {
    if (this.t < 0) return;
    this.t += dt;
    const amp = 0.003 * Math.exp(-this.t * 18);
    group.position.copy(basePos).add(new THREE.Vector3((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, 0));
    if (this.t > 0.3) { this.t = -1; group.position.copy(basePos); }
  }
  trigger() { this.t = 0; }
}

// --- Migas que caen cerca del punto de inserción ---
export class Crumbs {
  particles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  geo = new THREE.BoxGeometry(0.0015, 0.0015, 0.0015);
  mat = new THREE.MeshStandardMaterial({ color: 0xcc8844, roughness: 0.9, transparent: true });

  spawn(scene: THREE.Scene, worldPos: THREE.Vector3, count = 2) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.position.copy(worldPos);
      scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 0.05, Math.random() * 0.04, (Math.random() - 0.5) * 0.05), life: 0.6 });
    }
  }

  update(dt: number) {
    for (const p of [...this.particles]) {
      p.vel.y -= 0.3 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, p.life / 0.6);
      if (p.life <= 0) {
        p.mesh.parent?.remove(p.mesh);
        this.particles.splice(this.particles.indexOf(p), 1);
      }
    }
  }
}
