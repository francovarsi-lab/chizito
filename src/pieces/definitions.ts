import { createChizito } from '../assets/procedural/chizito';
import { CHIZITO_REF_LENGTH, createPalito, PALITO_LENGTH, PALITO_RADIUS } from '../assets/procedural/palito';
import { createPapita, PAPITA_RADIUS, PAPITA_THICKNESS, type PapitaParams } from '../assets/procedural/papita';
import { ACEITUNA_DIAMETER, ACEITUNA_LENGTH, createAceituna } from '../assets/procedural/aceituna';
import { createNacho, NACHO_RADIUS, NACHO_THICKNESS } from '../assets/procedural/nacho';
import { createEscarbadientes, ESCARBADIENTES_LENGTH, ESCARBADIENTES_RADIUS, type EscarbadientesParams } from '../assets/procedural/escarbadientes';
import { createKetchupStroke, KETCHUP_RADIUS, type KetchupParams } from '../assets/procedural/ketchup';
import type { PieceDefinition } from './PieceDefinition';

const CRUNCHY = { pick: 'pick', drop: 'drop', contact: 'crack', insert: 'crunch' };

export const CHIZITO: PieceDefinition = {
  type: 'chizito',
  displayName: 'Chizito',
  dimensions: { length: CHIZITO_REF_LENGTH, thickness: 0.0205 },
  frame: 'centered',
  procedural: (seed, detail) => createChizito(seed, detail),
  canPierce: false,
  canBePierced: true,
  // Los chizitos extra del bowl se ensartan en la punta libre de un palito (chizito + palito + chizito).
  mountsOnTail: true,
  maxDepth: 0,
  holdHint: 'tocá un palito clavado para ensartarle este chizito en la punta',
  sounds: { pick: 'pick', drop: 'drop', contact: 'crack', insert: 'crunch' },
};

export const PALITO: PieceDefinition = {
  type: 'palito',
  displayName: 'Palito salado',
  dimensions: { length: PALITO_LENGTH, thickness: PALITO_RADIUS * 2 },
  frame: 'tip',
  procedural: (seed, detail) => createPalito(seed, detail),
  canPierce: true,
  canBePierced: false,
  tailMount: true,
  // Siempre queda afuera ~20 % del largo (≈ 7 mm con 3,5 cm).
  maxDepth: PALITO_LENGTH * 0.8,
  sounds: CRUNCHY,
};

export const PAPITA: PieceDefinition = {
  type: 'papita',
  displayName: 'Papita',
  dimensions: { length: PAPITA_RADIUS * 2, thickness: PAPITA_THICKNESS },
  frame: 'tip',
  procedural: (seed, detail, params) => createPapita(seed, detail, params as PapitaParams),
  breakable: true,
  canPierce: true,
  canBePierced: true,
  maxDepth: 0.008,
  holdHint: 'la papita se clava de canto · Q / E la giran · B la parte',
  sounds: CRUNCHY,
};

export const ACEITUNA: PieceDefinition = {
  type: 'aceituna',
  displayName: 'Aceituna',
  dimensions: { length: ACEITUNA_LENGTH, thickness: ACEITUNA_DIAMETER },
  frame: 'tip',
  procedural: (seed, detail) => createAceituna(seed, detail),
  // No se clava en el chizito: se ensarta en la punta libre de un palito o escarbadientes.
  canPierce: false,
  mountsOnTail: true,
  canBePierced: true,
  maxDepth: 0,
  holdHint: 'tocá un palito o escarbadientes clavado para ensartarle la aceituna en la punta',
  sounds: { pick: 'pick', drop: 'drop', contact: 'crack', insert: 'crunch' },
};

export const NACHO: PieceDefinition = {
  type: 'nacho',
  displayName: 'Nacho',
  dimensions: { length: NACHO_RADIUS * 1.5, thickness: NACHO_THICKNESS },
  frame: 'tip',
  procedural: (seed, detail, params) => createNacho(seed, detail, params as { bites?: number[] }),
  keepOrientation: true,
  breakable: true,
  canPierce: true,
  canBePierced: true,
  maxDepth: 0.006,
  holdHint: 'el nacho se clava de canto · Q / E lo giran · B lo parte',
  sounds: CRUNCHY,
};

export const ESCARBADIENTES: PieceDefinition = {
  type: 'escarbadientes',
  displayName: 'Escarbadientes',
  dimensions: { length: ESCARBADIENTES_LENGTH, thickness: ESCARBADIENTES_RADIUS * 2 },
  frame: 'tip',
  procedural: (seed, detail, params) => createEscarbadientes(seed, detail, params as EscarbadientesParams),
  variants: [
    { id: 'liso', label: 'escarbadientes' },
    { id: 'espadita', label: 'espadita de cotillón' },
  ],
  canPierce: true,
  canBePierced: false,
  tailMount: true,
  maxDepth: ESCARBADIENTES_LENGTH * 0.8,
  sounds: CRUNCHY,
};

/**
 * Trazo de ketchup: no se agarra ni se clava; se dibuja con el sobrecito (modo DRAWING) y queda como
 * hijo de la pieza pintada, con los puntos en `params` (así deshacer y guardar lo reproducen).
 */
export const KETCHUP: PieceDefinition = {
  type: 'ketchup',
  displayName: 'Ketchup',
  dimensions: { length: 0.01, thickness: KETCHUP_RADIUS * 2 },
  frame: 'free',
  procedural: (seed, _detail, params) => createKetchupStroke(seed, params as KetchupParams),
  canPierce: false,
  canBePierced: false,
  maxDepth: 0,
  sounds: {},
};

export const ALL_DEFINITIONS: PieceDefinition[] = [CHIZITO, PALITO, PAPITA, ACEITUNA, NACHO, ESCARBADIENTES, KETCHUP];
