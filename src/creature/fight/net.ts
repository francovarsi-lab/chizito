/**
 * Pelea contra un amigo (O1 del plan): sala por link + sincronía por pasos (lockstep). El motor es puro y determinista, así
 * que por la red sólo viajan las ENTRADAS de cada cuadro; cada lado simula la misma pelea. Este archivo no usa three.js.
 */
import type { FightInput, Match } from './engine';
import type { FighterModel } from './fighter';

export type NetMsg =
  /** Mi criatura: el archivo (para dibujarla) y el modelo ya calculado (para simular con los MISMOS números en los dos lados). */
  | { t: 'me'; file: string; model: FighterModel }
  /** Entrada del cuadro `f` de la pelea número `g`. */
  | { t: 'in'; g: number; f: number; i: FightInput }
  /** Huella del estado al terminar el cuadro `f` (para detectar si los dos lados se separaron). */
  | { t: 'h'; g: number; f: number; h: number }
  /** Revancha: empieza la pelea número `g`. */
  | { t: 'again'; g: number };

export interface Link {
  send(o: NetMsg): void;
  on(fn: (o: NetMsg) => void): void;
  onClose(fn: () => void): void;
  close(): void;
}

const IDLE: FightInput = { x: 0 };

/**
 * Sincronía por pasos: mi entrada de ahora vale para el cuadro `delay` más adelante (3 cuadros = 50 ms: lo que tarda en
 * llegarle al otro); un cuadro se simula recién cuando están las entradas de los dos. Si la del otro no llegó, se espera.
 */
export class Lockstep {
  /** Próximo cuadro a simular. */
  next = 0;
  private sent: number;
  private readonly ins: [Map<number, FightInput>, Map<number, FightInput>] = [new Map(), new Map()];
  constructor(readonly me: 0 | 1, private readonly out: (f: number, i: FightInput) => void, readonly delay = 3) {
    this.sent = delay;
  }
  /** ¿Falta dar mi entrada para el cuadro `next + delay`? (Una sola por cuadro: los toques no se repiten.) */
  wants(): boolean {
    return this.sent <= this.next + this.delay;
  }
  push(i: FightInput): void {
    this.ins[this.me].set(this.sent, i);
    this.out(this.sent++, i);
  }
  recv(f: number, i: FightInput): void {
    this.ins[1 - this.me].set(f, i);
  }
  /** Entradas del próximo cuadro (jugador 0, jugador 1), o null si todavía falta alguna. */
  take(): [FightInput, FightInput] | null {
    const f = this.next;
    const a = f < this.delay ? IDLE : this.ins[0].get(f);
    const b = f < this.delay ? IDLE : this.ins[1].get(f);
    if (!a || !b) return null;
    this.ins[0].delete(f);
    this.ins[1].delete(f);
    this.next++;
    return [a, b];
  }
}

/** Huella barata del estado (posición, vida, inclinación y poder de los dos, bit a bit). */
export function hashMatch(m: Match): number {
  const v = new Float64Array(m.f.flatMap((f) => [f.x, f.y, f.tilt, f.hp, f.meter, f.stun]));
  let h = 2166136261 ^ m.frame;
  for (const w of new Uint32Array(v.buffer)) h = Math.imul(h ^ w, 16777619);
  return h >>> 0;
}

/** Código de sala corto y legible (sin 0/O ni 1/l). */
export const newRoom = (): string => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

/**
 * Abre la sala. `local-…` = dos pestañas del MISMO navegador (BroadcastChannel; sin internet, para probar). Si no, WebRTC con
 * PeerJS y su servidor público de presentación (sólo presenta a los dos; los datos van directo entre navegadores).
 * shortcut: el servidor público de PeerJS no tiene garantías; si la sala se usa en serio, pasar a uno propio.
 */
export async function openLink(room: string, host: boolean): Promise<Link> {
  const subs: ((o: NetMsg) => void)[] = [];
  const closers: (() => void)[] = [];
  if (room.startsWith('local')) {
    const ch = new BroadcastChannel(`chizito-${room}`);
    return new Promise((ok) => {
      let met = false;
      const link: Link = { send: (o) => ch.postMessage(o), on: (fn) => subs.push(fn), onClose: (fn) => closers.push(fn), close: () => { ch.postMessage({ t: 'bye' }); ch.close(); } };
      ch.onmessage = (e) => {
        const o = e.data as NetMsg | { t: 'hi' | 'hi2' | 'bye' };
        if (o.t === 'hi' || o.t === 'hi2') {
          if (o.t === 'hi') ch.postMessage({ t: 'hi2' });
          if (!met) { met = true; ok(link); }
        } else if (o.t === 'bye') closers.forEach((fn) => fn());
        else subs.forEach((fn) => fn(o as NetMsg));
      };
      ch.postMessage({ t: 'hi' });
    });
  }
  const { Peer } = await import('peerjs');
  const id = `chizito-fight-${room}`;
  return new Promise((ok, ko) => {
    const peer = host ? new Peer(id) : new Peer();
    const wrap = (c: import('peerjs').DataConnection): void => {
      c.on('open', () => ok({ send: (o) => c.send(o), on: (fn) => subs.push(fn), onClose: (fn) => closers.push(fn), close: () => peer.destroy() }));
      c.on('data', (o) => subs.forEach((fn) => fn(o as NetMsg)));
      c.on('close', () => closers.forEach((fn) => fn()));
      c.on('error', ko);
    };
    peer.on('error', ko);
    if (host) peer.on('connection', wrap);
    else peer.on('open', () => wrap(peer.connect(id, { reliable: true, serialization: 'json' })));
  });
}
