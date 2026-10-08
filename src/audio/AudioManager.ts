import { probeFile } from '../assets/probe';

/**
 * Sonidos del juego. Para cada id busca public/assets/sounds/<id>.(ogg|mp3|wav); si no existe, usa un
 * placeholder sintetizado con Web Audio. Todo muy suave: es feedback, no protagonismo.
 *
 *  pick   — agarrar un snack (toque seco y suave)
 *  drop   — devolverlo (todavía más leve)
 *  crack  — primer contacto de la punta con el chizito (crack seco)
 *  crunch — crujido mínimo mientras entra (granos de ruido esporádicos)
 *  out    — la pieza sale del todo
 */
export type SoundId = 'pick' | 'drop' | 'crack' | 'crunch' | 'out';

const EXTENSIONS: [string, number[]][] = [
  ['ogg', [0x4f, 0x67, 0x67, 0x53]], // OggS
  ['mp3', [0x49, 0x44, 0x33]], // ID3 (mp3 con etiqueta)
  ['wav', [0x52, 0x49, 0x46, 0x46]], // RIFF
];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private files = new Map<SoundId, AudioBuffer>();
  private noise: AudioBuffer | null = null;
  private lastCrunch = 0;
  volume = 0.8;

  constructor() {
    // Los navegadores sólo dejan arrancar el audio tras un gesto del usuario.
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      void this.loadFiles();
    }
    return this.ctx;
  }

  private async loadFiles(): Promise<void> {
    const ids: SoundId[] = ['pick', 'drop', 'crack', 'crunch', 'out'];
    await Promise.all(
      ids.map(async (id) => {
        for (const [ext, magic] of EXTENSIONS) {
          const buf = await probeFile(`${import.meta.env.BASE_URL}assets/sounds/${id}.${ext}`, magic);
          if (!buf) continue;
          try {
            this.files.set(id, await this.ctx!.decodeAudioData(buf));
            return;
          } catch {
            /* formato no soportado: probar el siguiente */
          }
        }
      }),
    );
  }

  /** `intensity` 0..1 modula volumen y brillo del sonido (p. ej. profundidad o velocidad). */
  play(id: SoundId, intensity = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const file = this.files.get(id);
    if (file) {
      const src = this.ctx.createBufferSource();
      src.buffer = file;
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = this.ctx.createGain();
      g.gain.value = 0.4 + 0.6 * intensity;
      src.connect(g).connect(this.master!);
      src.start();
      return;
    }
    switch (id) {
      case 'crack':
        this.burst({ freq: 2600, q: 1.4, dur: 0.05, gain: 0.5 * intensity, lowFreq: 180 });
        this.burst({ freq: 5200, q: 2, dur: 0.02, gain: 0.25 * intensity, delay: 0.004 });
        break;
      case 'crunch': {
        // Crujido muy leve: granos esporádicos, no más de ~25 por segundo.
        const now = this.ctx.currentTime;
        if (now - this.lastCrunch < 0.04) return;
        this.lastCrunch = now;
        this.burst({ freq: 1800 + Math.random() * 2400, q: 2.5, dur: 0.012 + Math.random() * 0.012, gain: 0.07 * intensity });
        break;
      }
      case 'pick':
        this.burst({ freq: 900, q: 0.9, dur: 0.06, gain: 0.18, lowFreq: 140 });
        break;
      case 'drop':
        this.burst({ freq: 700, q: 0.8, dur: 0.05, gain: 0.1, lowFreq: 110 });
        break;
      case 'out':
        this.burst({ freq: 1400, q: 1.2, dur: 0.04, gain: 0.16 });
        break;
    }
  }

  /** Ráfaga de ruido filtrado con envolvente percusiva (+ un "golpe" grave opcional). */
  private burst(o: { freq: number; q: number; dur: number; gain: number; delay?: number; lowFreq?: number }): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = o.freq;
    bp.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.8, o.dur + 0.02);
    if (o.lowFreq) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(o.lowFreq, t);
      osc.frequency.exponentialRampToValueAtTime(o.lowFreq * 0.6, t + o.dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(o.gain * 0.5, t + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, t + o.dur * 1.2);
      osc.connect(og).connect(this.master!);
      osc.start(t);
      osc.stop(t + o.dur * 1.3);
    }
  }
}
