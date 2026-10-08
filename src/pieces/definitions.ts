import { createChizito } from '../assets/procedural/chizito';
import { CHIZITO_REF_LENGTH, createPalito, PALITO_LENGTH, PALITO_RADIUS } from '../assets/procedural/palito';
import { createPapita, PAPITA_RADIUS, PAPITA_THICKNESS } from '../assets/procedural/papita';
import type { PieceDefinition } from './PieceDefinition';

export const CHIZITO: PieceDefinition = {
  type: 'chizito',
  displayName: 'Chizito',
  dimensions: { length: CHIZITO_REF_LENGTH, thickness: 0.0205 },
  frame: 'centered',
  procedural: (seed, detail) => createChizito(seed, detail),
  canPierce: false,
  canBePierced: true,
  maxDepth: 0,
  sounds: { pick: 'pick', drop: 'drop' },
};

export const PALITO: PieceDefinition = {
  type: 'palito',
  displayName: 'Palito salado',
  dimensions: { length: PALITO_LENGTH, thickness: PALITO_RADIUS * 2 },
  frame: 'tip',
  procedural: (seed, detail) => createPalito(seed, detail),
  canPierce: true,
  canBePierced: false,
  // Siempre queda afuera ~20 % del largo (≈ 1,4 cm con 7 cm), proporcional al 1,5 cm original.
  maxDepth: PALITO_LENGTH * 0.8,
  sounds: { pick: 'pick', drop: 'drop', contact: 'crack', insert: 'crunch' },
};

export const PAPITA: PieceDefinition = {
  type: 'papita',
  displayName: 'Papita',
  dimensions: { length: PAPITA_RADIUS * 2, thickness: PAPITA_THICKNESS },
  frame: 'tip',
  procedural: (seed, detail) => createPapita(seed, detail),
  canPierce: true,
  canBePierced: true,
  maxDepth: 0.008,
  sounds: { pick: 'pick', drop: 'drop', contact: 'crack', insert: 'crunch' },
};

export const ALL_DEFINITIONS: PieceDefinition[] = [CHIZITO, PALITO, PAPITA];
