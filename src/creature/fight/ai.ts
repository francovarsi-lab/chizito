import type { FightInput, Match } from './engine';
import { AI_LEVELS, FIGHT, POWERS } from './tuning';

/** Memoria del rival (determinista: azar con semilla). */
export interface AiMem {
  seed: number;
  level: number;
  /** Cuadros hasta poder reaccionar a lo que hace el otro. */
  react: number;
  /** Acción en curso y cuadros que le quedan. */
  doing: 'none' | 'guard' | 'retreat' | 'crouch' | 'step';
  /** Hacia dónde va el paso de acomodarse (+1 adelante, −1 atrás). */
  stepDir: 1 | -1;
  left: number;
  seenStrike: boolean;
  wasAttack: boolean;
}

export const newAi = (seed = 1, level = 1): AiMem => ({ seed, level: Math.max(1, Math.min(AI_LEVELS.length, level)), react: 0, doing: 'none', stepDir: 1, left: 0, seenStrike: false, wasAttack: false });

/** Azar chico y determinista (mulberry32). */
function rnd(m: AiMem): number {
  m.seed = (m.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(m.seed ^ (m.seed >>> 15), 1 | m.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Entrada del luchador `who` manejado por la máquina: se acerca hasta su alcance, pega con cadencia según el nivel, a veces se
 * guarda al ver venir un golpe (con tiempo de reacción), patea si el otro se agacha y se aleja un poco después de pegar.
 */
export function aiInput(s: Match, mem: AiMem, who: 0 | 1 = 1): FightInput {
  const L = AI_LEVELS[mem.level - 1];
  const me = s.f[who];
  const foe = s.f[1 - who];
  if (s.phase !== 'fight' || me.ko) return { x: 0 };
  const dx = foe.x - me.x;
  const dir: -1 | 1 = dx >= 0 ? 1 : -1;
  const near = Math.abs(dx);
  const reach = Math.max(0.02, ...me.model.limbs.filter((l) => l.role === 'arm').map((l) => l.reach + Math.max(0, l.pivot[0] * 0.5))) + 0.012;
  const foeStriking = foe.limbs.some((q) => q.phase === 'windup' || q.phase === 'strike');
  // Reacción: cuando el otro arranca un golpe, recién `reaction` cuadros después se puede guardar.
  // Si el otro aprieta siempre el mismo botón, lo ve venir: reacciona antes y se cubre casi siempre (y después contraataca).
  const readable = foe.repeat >= 1;
  if (foeStriking && !mem.seenStrike) {
    mem.seenStrike = true;
    mem.react = readable ? Math.max(3, Math.round(L.reaction * 0.45)) : L.reaction;
  }
  if (!foeStriking) mem.seenStrike = false;
  if (mem.react > 0) {
    mem.react--;
    const guardP = readable ? Math.min(0.95, Math.max(L.guard, 0.55 + 0.15 * foe.repeat)) : L.guard;
    if (mem.react === 0 && foeStriking && near < reach * 1.8 && rnd(mem) < guardP) {
      mem.doing = 'guard';
      mem.left = 18 + Math.floor(rnd(mem) * 14);
    }
  }
  // Le leyó el ritmo (pega sin parar): se anticipa y espera el próximo golpe con la guardia arriba, para atajarlo y contraatacar.
  if (readable && mem.left <= 0 && me.stun <= 0 && near < reach * 1.8 && rnd(mem) < (mem.level === 1 ? 0.14 : 0.18 + 0.05 * mem.level)) {
    mem.doing = 'guard';
    mem.left = 22 + Math.floor(rnd(mem) * 16);
  }
  if (mem.left > 0) {
    mem.left--;
    if (mem.doing === 'guard') return { x: 0, guard: true };
    if (mem.doing === 'retreat') return { x: (-dir) as -1 | 1 };
    if (mem.doing === 'crouch') return { x: 0, down: true };
    if (mem.doing === 'step') return { x: (mem.stepDir * dir) as -1 | 1 };
  }
  mem.doing = 'none';
  // El poder, cuando conviene (cada uno con su lógica): vapor si lo tiene encima, rodar si está a media distancia y en el piso,
  // granos de lejos, queso de cerca. Más nivel = lo usa mejor (con menos azar).
  if (me.meter >= FIGHT.power.max && me.model.power && me.stun <= 0) {
    const k = me.model.power;
    const good = k === 'vapor' ? near < POWERS.vapor.reach * 0.8 : k === 'rodada' ? near > 0.05 && near < 0.2 && foe.grounded : k === 'metralla' ? near > 0.06 : near < POWERS.queso.reach;
    if (good && rnd(mem) < 0.02 + 0.02 * mem.level) return { x: 0, power: true };
  }
  const attackPrev = mem.wasAttack;
  mem.wasAttack = false;
  if (me.stun > 0) return { x: 0 };
  // El otro quedó trabado (pegó contra la guardia o pifió): es el momento de castigarlo.
  if (foe.lock > 4 && near < reach * 1.15 && rnd(mem) < 0.3 + 0.12 * mem.level) return { x: 0, punch: true };
  // Acaba de atajar: contraataca enseguida (la CONTRA pega más).
  if (me.counter > 0 && me.block <= 0 && near < reach * 1.2 && rnd(mem) < 0.35 + 0.15 * mem.level) return { x: 0, punch: true };
  // Desde el nivel 2 encadena: si acaba de acertar, a veces sigue con otra piña (o una patada) mientras dura el impulso.
  if (me.chain && rnd(mem) < L.chain) {
    const kick = me.legs.length >= 2 && rnd(mem) < 0.3;
    return { x: 0, punch: !kick, kick };
  }
  if (near > reach) {
    const jump = rnd(mem) < L.jump && near < reach * 3;
    return { x: dir, up: jump };
  }
  if (!attackPrev && rnd(mem) < L.aggression) {
    mem.wasAttack = true;
    const kick = me.legs.length > 0 && (foe.crouch > 0.5 || rnd(mem) < 0.22);
    if (rnd(mem) < L.retreat) {
      mem.doing = 'retreat';
      mem.left = 10 + Math.floor(rnd(mem) * 20);
    }
    return { x: 0, punch: !kick, kick };
  }
  // A veces se acomoda: un PASO decidido adelante o atrás (varios cuadros). Antes eran toques de un cuadro al azar que lo hacían
  // temblar en el lugar, como una marioneta.
  const r = rnd(mem);
  if (r < 0.025) {
    mem.doing = 'step';
    mem.stepDir = rnd(mem) < 0.6 ? 1 : -1;
    mem.left = 12 + Math.floor(rnd(mem) * 10);
  }
  return { x: 0 };
}
