import type { FightInput, Match } from './engine';
import { AI_LEVELS } from './tuning';

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
  if (foeStriking && !mem.seenStrike) {
    mem.seenStrike = true;
    mem.react = L.reaction;
  }
  if (!foeStriking) mem.seenStrike = false;
  if (mem.react > 0) {
    mem.react--;
    if (mem.react === 0 && foeStriking && near < reach * 1.8 && rnd(mem) < L.guard) {
      mem.doing = 'guard';
      mem.left = 18 + Math.floor(rnd(mem) * 14);
    }
  }
  if (mem.left > 0) {
    mem.left--;
    if (mem.doing === 'guard') return { x: 0, guard: true };
    if (mem.doing === 'retreat') return { x: (-dir) as -1 | 1 };
    if (mem.doing === 'crouch') return { x: 0, down: true };
    if (mem.doing === 'step') return { x: (mem.stepDir * dir) as -1 | 1 };
  }
  mem.doing = 'none';
  const attackPrev = mem.wasAttack;
  mem.wasAttack = false;
  if (me.stun > 0) return { x: 0 };
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
