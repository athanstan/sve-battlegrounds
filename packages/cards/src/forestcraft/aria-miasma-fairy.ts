import { pixieToken } from '../shared';
import { scriptOf } from '../define';

const rushPixies = {
  kind: 'static' as const,
  key: 'rush',
  grant: { filter: { ...pixieToken, kind: ['follower'] as const }, keywords: ['rush' as const] },
};

const lastWordsEx = {
  kind: 'triggered' as const,
  key: 'lastWords',
  on: 'lastWords' as const,
  effect: [
    {
      op: 'optional' as const,
      label: "Put this card into its owner's EX area?",
      cost: [],
      then: [{ op: 'move' as const, cards: 'self', to: 'ex' as const }],
    },
  ],
};

export const ariaMiasmaFairy = scriptOf('aria-miasma-fairy', [
  { kind: 'static', key: 'notFromEx', validIn: ['ex'], notFromEx: true },
  { ...rushPixies, validIn: ['field', 'ex'] },
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'token', name: 'Fairy', n: 1, to: 'ex' }],
  },
  lastWordsEx,
]);

export const ariaMiasmaFairyEvolved = scriptOf('aria-miasma-fairy@evolved', [
  { ...rushPixies, validIn: ['field'] },
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'search',
        as: 'found',
        filter: { kind: ['amulet'], pixie: true, costAtMost: 2 },
        count: 1,
        reveal: false,
        then: 'field',
      },
    ],
  },
  lastWordsEx,
]);
