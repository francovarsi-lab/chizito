import { ALL_DEFINITIONS } from '../../pieces/definitions';
import { PieceRegistry } from '../../pieces/PieceRegistry';
import { mountFight, type FightController, type Game } from './mount';

/** Espera a que el juego termine de arrancar (`body.dataset.ready`). */
function whenReady(timeoutMs = 120000): Promise<Game> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = (): void => {
      const g = (window as unknown as { __chizito?: Game }).__chizito;
      if (document.body.dataset.ready && g) return resolve(g);
      if (document.body.dataset.error || performance.now() - t0 > timeoutMs) return reject(new Error('el juego no arrancó'));
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

/** Monta la pelea sobre el juego (botón "PELEAR"). Siempre disponible; no necesita el panel del intérprete. */
export async function installFight(): Promise<FightController> {
  await whenReady();
  const pieces = new PieceRegistry();
  ALL_DEFINITIONS.forEach((d) => pieces.register(d));
  const fight = mountFight({ pieces, game: () => (window as unknown as { __chizito: Game }).__chizito });
  window.__fight = fight;
  return fight;
}
