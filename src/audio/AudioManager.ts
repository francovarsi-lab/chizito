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
 *
 * Pelea (para reemplazar por grabaciones propias con el mismo nombre de archivo):
 *  golpe, golpe-pesado, bloqueo, zumbido (algo pesado que corta el aire), pifio, escudo (se rompe),
 *  ko, round (cartel ROUND), pelea (¡A PELEAR!), combo (sale una combinación: UNO-DOS, RÁFAGA…), japish (el grito ¡JAPISH!), pimba (¡PIMBA!, patada que entra), soplamoco (¡SOPLAMOCO!, piña a la cara), risa (EL BROCOLOCO se ríe en su presentación),
 *  musica-pelea (música de la pelea, en loop; si no está, suena una base sintetizada), apagon (se cortan las luces), vela
 *  (se enciende la vela), rugido (EL BROCOLOCO ruge), brocoloco-frase1/2/3, huevo-frase1/2/3,
 *  quinoa-frase1/2/3 (la voz de cada rival en su presentación: ver los subtítulos en `RIVALS` de mount.ts),
 *  sin-aire (se quedó sin aire), poder-carga (carga un poder), poder-queso, poder-vapor, poder-rodada, poder-metralla
 */
export type SoundId = 'pick' | 'drop' | 'crack' | 'crunch' | 'out' | 'golpe' | 'golpe-pesado' | 'bloqueo' | 'zumbido' | 'pifio' | 'escudo' | 'ko' | 'round' | 'pelea' | 'combo' | 'japish' | 'pimba' | 'soplamoco' | 'risa' | 'musica-pelea' | 'apagon' | 'vela' | 'rugido' | 'brocoloco-frase1' | 'brocoloco-frase2' | 'brocoloco-frase3' | 'huevo-frase1' | 'huevo-frase2' | 'huevo-frase3' | 'quinoa-frase1' | 'quinoa-frase2' | 'quinoa-frase3' | 'sin-aire' | 'poder-carga' | 'poder-queso' | 'poder-vapor' | 'poder-rodada' | 'poder-metralla';
const IDS: SoundId[] = ['pick', 'drop', 'crack', 'crunch', 'out', 'golpe', 'golpe-pesado', 'bloqueo', 'zumbido', 'pifio', 'escudo', 'ko', 'round', 'pelea', 'combo', 'japish', 'pimba', 'soplamoco', 'risa', 'musica-pelea', 'apagon', 'vela', 'rugido', 'brocoloco-frase1', 'brocoloco-frase2', 'brocoloco-frase3', 'huevo-frase1', 'huevo-frase2', 'huevo-frase3', 'quinoa-frase1', 'quinoa-frase2', 'quinoa-frase3', 'sin-aire', 'poder-carga', 'poder-queso', 'poder-vapor', 'poder-rodada', 'poder-metralla'];

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
  private music: { stop: () => void } | null = null;
  volume = 1;

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
      // Compresor: los sonidos suenan presentes sin saturar cuando se pisan varios a la vez.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      void this.loadFiles();
    }
    return this.ctx;
  }

  private async loadFiles(): Promise<void> {
    await Promise.all(
      IDS.map(async (id) => {
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
      // ── Pelea: sintetizados (con cuerpo) hasta que estén las grabaciones ──
      case 'golpe':
        // Piña: golpe sordo (cuerpo) + chasquido + crujido de chizito.
        this.tone({ f0: 190, f1: 55, dur: 0.13, gain: 0.75 * intensity });
        this.burst({ freq: 2400, q: 1.1, dur: 0.05, gain: 0.5 * intensity });
        this.crackle(4, 0.06, 0.22 * intensity);
        break;
      case 'golpe-pesado':
        this.tone({ f0: 130, f1: 38, dur: 0.28, gain: 1 * intensity });
        this.burst({ freq: 900, q: 0.8, dur: 0.12, gain: 0.6 * intensity, type: 'lowpass' });
        this.burst({ freq: 3000, q: 1.4, dur: 0.06, gain: 0.45 * intensity, delay: 0.008 });
        this.crackle(8, 0.12, 0.3 * intensity);
        break;
      case 'bloqueo':
        // Toc de madera (palito contra palito).
        this.tone({ f0: 520, f1: 380, dur: 0.07, gain: 0.5 * intensity, type: 'triangle' });
        this.tone({ f0: 1270, f1: 1100, dur: 0.04, gain: 0.25 * intensity, type: 'triangle' });
        this.burst({ freq: 1800, q: 3, dur: 0.03, gain: 0.3 * intensity });
        break;
      case 'zumbido':
        // Algo pesado que corta el aire: ¡fuuum!
        this.burst({ freq: 300, sweep: 1500, q: 2, dur: 0.3, gain: 0.45 * intensity, attack: 0.12 });
        break;
      case 'pifio':
        // Golpe al aire: ¡fiuuu! y un "boing" de dibujito.
        this.burst({ freq: 1800, sweep: 350, q: 2.5, dur: 0.28, gain: 0.4 * intensity, attack: 0.05 });
        this.tone({ f0: 620, f1: 180, dur: 0.35, gain: 0.25 * intensity, delay: 0.12, vibrato: 18 });
        break;
      case 'escudo':
        for (let k = 0; k < 7; k++) this.burst({ freq: 2000 + Math.random() * 3000, q: 2.5, dur: 0.04, gain: 0.42 * intensity, delay: k * 0.022 });
        this.tone({ f0: 300, f1: 90, dur: 0.2, gain: 0.5 * intensity });
        break;
      case 'ko':
        this.tone({ f0: 110, f1: 30, dur: 0.7, gain: 1 });
        this.burst({ freq: 600, q: 0.6, dur: 0.5, gain: 0.7, type: 'lowpass' });
        // Silbato que cae: el que pierde se desploma.
        this.tone({ f0: 1700, f1: 300, dur: 0.9, gain: 0.22, delay: 0.25, type: 'triangle', vibrato: 7 });
        break;
      case 'risa':
        this.voice(['ja', 'ja', 'ja', 'ja'], 0.9, 0, 0.16);
        break;
      case 'japish':
        this.voice(['ja'], 1.1, 0, 0.12);
        this.burst({ freq: 5200, q: 1.2, dur: 0.22, gain: 0.4 * intensity, delay: 0.12, attack: 0.03 });
        break;
      case 'pimba':
        this.voice(['pi', 'ba'], 1.25, 0, 0.12);
        this.tone({ f0: 160, f1: 50, dur: 0.15, gain: 0.5 * intensity, delay: 0.12 });
        break;
      case 'soplamoco':
        this.burst({ freq: 2600, q: 0.7, dur: 0.3, gain: 0.35 * intensity, attack: 0.1 });
        this.voice(['so', 'pla', 'mo', 'co'], 1.1, 0.12, 0.1);
        break;
      case 'apagon':
        this.burst({ freq: 3000, q: 3, dur: 0.04, gain: 0.7 });
        this.tone({ f0: 120, f1: 40, dur: 0.9, gain: 0.45, type: 'sawtooth', lp: 400, delay: 0.02 });
        break;
      case 'vela':
        this.burst({ freq: 4200, q: 0.8, dur: 0.15, gain: 0.4 });
        this.burst({ freq: 700, q: 0.5, dur: 0.6, gain: 0.25, delay: 0.1, type: 'lowpass', attack: 0.08 });
        break;
      case 'rugido':
        for (let k = 0; k < 4; k++) this.tone({ f0: 95 + k * 23, f1: 70 + k * 15, dur: 1.1, gain: 0.3 * intensity, type: 'sawtooth', lp: 700, vibrato: 9 + k, attack: 0.08 });
        this.burst({ freq: 500, q: 0.7, dur: 1.1, gain: 0.5 * intensity, type: 'lowpass', attack: 0.1 });
        break;
      case 'brocoloco-frase1':
      case 'brocoloco-frase2':
      case 'brocoloco-frase3':
      case 'huevo-frase1':
      case 'huevo-frase2':
      case 'huevo-frase3':
      case 'quinoa-frase1':
      case 'quinoa-frase2':
      case 'quinoa-frase3': {
        // Voz de dibujito (formantes) hasta que esté la grabación: el huevo más agudo, la quinoa más grave.
        const pitch = id.startsWith('huevo') ? 1.45 : id.startsWith('quinoa') ? 0.62 : 0.95;
        const n = id.endsWith('3') ? 4 : 7;
        const syl = ['ma', 'mo', 'te', 'vo', 'la', 'chi', 'ja', 'po', 'ro'];
        this.voice(Array.from({ length: n }, (_, k) => syl[(k * 5 + id.length) % syl.length]), pitch, 0, id.endsWith('3') ? 0.16 : 0.13, id.endsWith('3'));
        break;
      }
      case 'combo':
        this.tone({ f0: 660, f1: 660, dur: 0.1, gain: 0.3 * intensity, type: 'square', lp: 2500 });
        this.tone({ f0: 990, f1: 990, dur: 0.18, gain: 0.3 * intensity, type: 'square', lp: 2500, delay: 0.09 });
        break;
      case 'round':
        // Campana del ring.
        for (const [f, gn] of [[880, 0.45], [1760, 0.2], [2640, 0.1], [1320, 0.12]] as const) this.tone({ f0: f, f1: f, dur: 1.4, gain: gn, attack: 0.002 });
        break;
      case 'pelea':
        // ¡Ta-dáaa! de bronces.
        for (const f of [261.6, 329.6, 392]) this.tone({ f0: f, f1: f, dur: 0.12, gain: 0.18, type: 'sawtooth', lp: 1800 });
        for (const f of [349.2, 440, 523.3]) this.tone({ f0: f, f1: f, dur: 0.6, gain: 0.2, type: 'sawtooth', lp: 2200, delay: 0.14, vibrato: 5 });
        break;
      case 'sin-aire':
        // Boquea: dos resoplidos.
        this.burst({ freq: 1200, q: 0.6, dur: 0.35, gain: 0.45, attack: 0.15, type: 'lowpass' });
        this.burst({ freq: 900, q: 0.6, dur: 0.4, gain: 0.4, attack: 0.18, type: 'lowpass', delay: 0.45 });
        break;
      case 'poder-carga':
        this.tone({ f0: 180, f1: 1100, dur: 0.4, gain: 0.3, type: 'sawtooth', lp: 2500, vibrato: 22 });
        break;
      case 'poder-queso':
        // ¡Puf! de polvito y unos brillitos.
        this.burst({ freq: 800, q: 0.5, dur: 0.5, gain: 0.7, type: 'lowpass', attack: 0.02 });
        for (let k = 0; k < 5; k++) this.tone({ f0: 2000 + k * 380, f1: 2400 + k * 380, dur: 0.12, gain: 0.08, delay: 0.1 + k * 0.05 });
        break;
      case 'poder-vapor':
        // Silbido de olla a presión.
        this.burst({ freq: 3500, q: 0.4, dur: 0.9, gain: 0.55, type: 'highpass', attack: 0.06 });
        this.tone({ f0: 1900, f1: 2300, dur: 0.7, gain: 0.12, vibrato: 30 });
        break;
      case 'poder-rodada':
        for (let k = 0; k < 6; k++) this.tone({ f0: 70, f1: 55, dur: 0.18, gain: 0.45, delay: k * 0.12, type: 'triangle' });
        this.burst({ freq: 300, q: 0.7, dur: 0.8, gain: 0.4, type: 'lowpass', attack: 0.1 });
        break;
      case 'poder-metralla':
        // Ráfaga de granitos: muchos tic-tic.
        for (let k = 0; k < 18; k++) this.burst({ freq: 2500 + Math.random() * 3500, q: 4, dur: 0.015, gain: 0.3, delay: k * 0.018 + Math.random() * 0.01 });
        this.burst({ freq: 600, sweep: 2400, q: 1.5, dur: 0.25, gain: 0.35, attack: 0.02 });
        break;
    }
  }

  /** Oscilador con caída de tono (cuerpo de un golpe, campana, voz): de `f0` a `f1` Hz en `dur` s. */
  private tone(o: { f0: number; f1: number; dur: number; gain: number; delay?: number; type?: OscillatorType; attack?: number; vibrato?: number; lp?: number }): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibrato;
      lg.gain.value = o.f0 * 0.03;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + o.dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node: AudioNode = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      node = node.connect(f);
    }
    node.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  /** Crujido de chizito: `n` granitos de ruido agudo repartidos en `span` s. */
  private crackle(n: number, span: number, gain: number): void {
    for (let k = 0; k < n; k++) this.burst({ freq: 2500 + Math.random() * 4000, q: 3, dur: 0.008 + Math.random() * 0.012, gain: gain * (0.5 + Math.random() * 0.5), delay: Math.random() * span });
  }

  /**
   * Voz de dibujito: cada sílaba es una consonante de ruido + una vocal con sus formantes (filtros) sobre un diente de sierra,
   * con la entonación que sube y baja. `shout` = gritado (más fuerte y más agudo al final).
   */
  private voice(syllables: string[], pitch: number, delay: number, len: number, shout = false): void {
    const ctx = this.ctx!;
    const F: Record<string, [number, number]> = { a: [800, 1200], e: [500, 1900], i: [300, 2300], o: [500, 900], u: [330, 800] };
    syllables.forEach((sy, k) => {
      const t = ctx.currentTime + delay + k * len * 1.15;
      const vowel = sy[sy.length - 1];
      const [f1, f2] = F[vowel] ?? F.a;
      const base = 150 * pitch * (1 + 0.12 * Math.sin(k * 1.7) + (shout ? k * 0.06 : 0));
      if ('pjtcsch'.includes(sy[0])) this.burst({ freq: sy[0] === 's' || sy[0] === 'c' ? 5000 : 2500, q: 1, dur: 0.035, gain: shout ? 0.3 : 0.18, at: t });
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.linearRampToValueAtTime(base * (shout ? 1.15 : 0.92), t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + 0.02);
      g.gain.exponentialRampToValueAtTime(shout ? 0.5 : 0.32, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      for (const [f, q, gn] of [[f1, 8, 1], [f2, 10, 0.6]] as const) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f * (pitch > 1.2 ? 1.15 : pitch < 0.8 ? 0.85 : 1);
        bp.Q.value = q;
        const fg = ctx.createGain();
        fg.gain.value = gn * 2.2;
        osc.connect(bp).connect(fg).connect(g);
      }
      g.connect(this.master!);
      osc.start(t + 0.02);
      osc.stop(t + len + 0.05);
    });
  }

  /**
   * Música de la pelea: `assets/sounds/musica-pelea.(ogg|mp3|wav)` en loop si está; si no, una base sintetizada (bombo, caja,
   * platillo y un bajo en menor a 132 BPM) hasta que esté la de verdad. Entra y sale con fundido.
   */
  musicOn(on: boolean): void {
    const ctx = this.ctx;
    if (!on || !ctx || ctx.state !== 'running') {
      this.music?.stop();
      this.music = null;
      return;
    }
    if (this.music) return;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1.5);
    out.connect(this.master!);
    const fadeOut = (): number => {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      return ctx.currentTime + 1.2;
    };
    const file = this.files.get('musica-pelea');
    if (file) {
      const src = ctx.createBufferSource();
      src.buffer = file;
      src.loop = true;
      src.connect(out);
      src.start();
      this.music = { stop: () => src.stop(fadeOut()) };
      return;
    }
    const eighth = 60 / 132 / 2;
    const BASS = [0, 0, 12, 0, 3, 0, 10, 7, 0, 0, 12, 0, 5, 3, 0, -2]; // semitonos sobre La 1
    let next = ctx.currentTime + 0.1;
    let i = 0;
    const note = (t: number, semis: number): void => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 55 * Math.pow(2, semis / 12);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + eighth);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + eighth * 0.95);
      o.connect(lp).connect(g).connect(out);
      o.start(t);
      o.stop(t + eighth);
    };
    const kick = (t: number): void => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.22);
    };
    const timer = window.setInterval(() => {
      while (next < ctx.currentTime + 0.25) {
        const b = i % 16;
        if (b % 4 === 0) kick(next);
        if (b % 8 === 4) this.burst({ freq: 1800, q: 0.7, dur: 0.14, gain: 0.35, lowFreq: 190, at: next, out });
        if (b % 2 === 1) this.burst({ freq: 8000, q: 1.5, dur: 0.035, gain: 0.12, at: next, out });
        note(next, BASS[b]);
        next += eighth;
        i++;
      }
    }, 60);
    this.music = {
      stop: () => {
        window.clearInterval(timer);
        fadeOut();
      },
    };
  }

  /** Ráfaga de ruido filtrado con envolvente percusiva (+ un "golpe" grave opcional). */
  private burst(o: { freq: number; q: number; dur: number; gain: number; delay?: number; lowFreq?: number; at?: number; out?: AudioNode; type?: BiquadFilterType; sweep?: number; attack?: number }): void {
    const ctx = this.ctx!;
    const t = o.at ?? ctx.currentTime + (o.delay ?? 0);
    const dest = o.out ?? this.master!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = o.type ?? 'bandpass';
    bp.frequency.setValueAtTime(o.freq, t);
    if (o.sweep) bp.frequency.exponentialRampToValueAtTime(o.sweep, t + o.dur);
    bp.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(bp).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5, o.dur + 0.02);
    if (o.lowFreq) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(o.lowFreq, t);
      osc.frequency.exponentialRampToValueAtTime(o.lowFreq * 0.6, t + o.dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(o.gain * 0.5, t + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, t + o.dur * 1.2);
      osc.connect(og).connect(dest);
      osc.start(t);
      osc.stop(t + o.dur * 1.3);
    }
  }
}
