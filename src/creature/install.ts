import { ALL_DEFINITIONS } from '../pieces/definitions';
import { PieceRegistry } from '../pieces/PieceRegistry';
import { mountCreaturePanel, mountProber, type PanelController } from './ui';

/** Lo que el juego deja en `window.__chizito` (src/main.ts): lo único que el intérprete necesita de él. */
interface GameHandle {
  construction: Parameters<typeof mountCreaturePanel>[0]['construction'];
  interaction: Parameters<typeof mountCreaturePanel>[0]['interaction'];
  persistence: Parameters<typeof mountCreaturePanel>[0]['persistence'];
}

declare global {
  interface Window {
    /** Controlador del panel (sólo existe con `?creature`). */
    __creature?: PanelController;
  }
}

/** Espera a que el juego termine de arrancar (`body.dataset.ready`) y devuelve su manija de depuración. */
function whenReady(timeoutMs = 120000): Promise<GameHandle> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      const g = (window as unknown as { __chizito?: GameHandle }).__chizito;
      if (document.body.dataset.ready && g) return resolve(g);
      if (document.body.dataset.error || performance.now() - t0 > timeoutMs) return reject(new Error('el juego no arrancó'));
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Activa el intérprete de criaturas sobre el juego (`?creature`): monta el panel "ESTRUCTURA DETECTADA", que lee la
 * criatura viva, la interpreta y se actualiza al clavar, sacar, deshacer y rehacer. No modifica el juego: sólo lee la
 * construcción y encadena `interaction.onChange`. Usa su propio registro de piezas con las mismas definiciones.
 */
export async function installCreature(): Promise<PanelController> {
  const game = await whenReady();
  const pieces = new PieceRegistry();
  ALL_DEFINITIONS.forEach((d) => pieces.register(d));
  const panel = mountCreaturePanel({ construction: game.construction, interaction: game.interaction, persistence: game.persistence, pieces });
  window.__creature = panel;
  // Probador (MVP 1): botón "▶ Probador" abajo a la izquierda; con `?creature&probador` arranca abierto.
  window.__prober = mountProber({ panel, startOpen: new URLSearchParams(location.search).has('probador') });
  return panel;
}
