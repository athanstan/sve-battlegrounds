import { scriptOf } from '../define';

const mercenaryEnters = {
  kind: 'triggered' as const,
  key: 'mercenary',
  on: {
    whenever: {
      type: 'moved' as const,
      to: { zone: 'field' as const, who: 'you' as const },
      filter: { kind: ['follower'] as const, trait: 'Mercenary' },
    },
  },
  effect: [
    { op: 'buff' as const, cards: 'entered', attack: 1, defense: 1 },
    { op: 'grant' as const, cards: 'entered', keywords: ['rush'] as const },
  ],
};

export const chipperSkipper = scriptOf('chipper-skipper', [mercenaryEnters]);

export const chipperSkipperEvolved = scriptOf('chipper-skipper@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'lookTop',
        n: 4,
        pick: {
          filter: { kind: ['follower'], costAtMost: 2 },
          upTo: 1,
          reveal: false,
          then: 'ex',
          costDeltaThisTurn: -2,
        },
        rest: 'bottom',
      },
    ],
  },
  mercenaryEnters,
]);
