import { createChizito } from '../assets/procedural/chizito';
import { createPalito, PALITO_LENGTH, PALITO_RADIUS } from '../assets/procedural/palito';
import { createPapita, PAPITA_RADIUS, PAPITA_THICKNESS } from '../assets/procedural/papita';
import type { PieceDefinition } from './PieceDefinition';

export const CHIZITO: PieceDefinition = {
  type: 'chizito',
  displayName: 'Chizito',
  dimensions: { length: 0.052, thickness: 0.014 },
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
  maxDepth: PALITO_LENGTH - 0.015,
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
