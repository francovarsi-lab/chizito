import type { CreatureAnalysis, DecorativeReason } from '../types';

const REASON_TEXT: Record<DecorativeReason, string> = {
  'no-free-tip': 'sin punta libre',
  'too-short': 'sobresale muy poco',
  'weak-anchor': 'base floja (poco adentro o muy inclinada)',
  plate: 'placa pegada al cuerpo',
  stroke: 'ketchup',
  broken: 'unión rota',
  'unknown-type': 'tipo de pieza desconocido',
  'second-level': 'clavada en un chizito ensartado',
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Avisos legibles para el panel. */
export function buildWarnings(a: Pick<CreatureAnalysis, 'limbs' | 'decorative' | 'locomotion' | 'support'>): string[] {
  const w: string[] = [];
  const deep = a.limbs.filter((l) => l.profile.inDepth).length;
  if (deep > 0) {
    w.push(
      `${deep} ${plural(deep, 'extremidad en profundidad', 'extremidades en profundidad')}: ${plural(deep, 'se ve corta', 'se ven cortas')} en reposo, ${plural(deep, 'ataca', 'atacan')} con su largo real al girar al plano`,
    );
  }
  const second = a.decorative.filter((d) => d.reason === 'second-level').length;
  if (second > 0) {
    w.push(`${second} ${plural(second, 'palito clavado', 'palitos clavados')} en un chizito ensartado: en el MVP 0 no ${plural(second, 'cuenta', 'cuentan')} como ${plural(second, 'extremidad propia', 'extremidades propias')} (se ${plural(second, 'mueve', 'mueven')} con su extremidad)`);
  }
  const others = a.decorative.filter((d) => d.reason !== 'second-level' && d.reason !== 'stroke');
  for (const reason of new Set(others.map((d) => d.reason))) {
    const n = others.filter((d) => d.reason === reason).length;
    w.push(`${n} ${plural(n, 'pieza decorativa', 'piezas decorativas')} (${REASON_TEXT[reason]}): ${plural(n, 'suma', 'suman')} masa, no ${plural(n, 'es extremidad', 'son extremidades')}`);
  }
  const drooping = a.limbs.filter((l) => l.mobility.droops).length;
  if (drooping > 0) w.push(`${drooping} ${plural(drooping, 'extremidad cuelga', 'extremidades cuelgan')} por el peso de su punta: solo ${plural(drooping, 'puede', 'pueden')} bajar`);
  if (a.locomotion.mode === 'roll') w.push('muchas extremidades en todas direcciones: rueda, casi no golpea y casi no frena');
  if (a.locomotion.mode === 'immobile') w.push('pesa más de lo que aguantan sus apoyos: casi inmóvil');
  if (a.support.feet.length === 0 && a.locomotion.mode === 'drag') w.push('sin apoyos hacia abajo: se arrastra');
  return w;
}
