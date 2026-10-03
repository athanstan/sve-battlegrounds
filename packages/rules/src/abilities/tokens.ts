import type { CardDefinition } from '../model/cards';
import { asCardDefId } from '../model/ids';

/** Appendix A: token prototypes used by the two decks. Both carry the Pixie trait. */
export const DEFAULT_TOKENS: Readonly<Record<string, CardDefinition>> = {
  Fairy: {
    id: asCardDefId('token:Fairy'),
    name: 'Fairy',
    kind: 'follower',
    special: 'token',
    cardClass: 'forestcraft',
    universe: null,
    traits: ['Pixie'],
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: [],
    text: '',
    artUrl: null,
  },
  'Fairy Wisp': {
    id: asCardDefId('token:FairyWisp'),
    name: 'Fairy Wisp',
    kind: 'follower',
    special: 'token',
    cardClass: 'forestcraft',
    universe: null,
    traits: ['Pixie'],
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: [],
    text: '',
    artUrl: null,
  },
};
