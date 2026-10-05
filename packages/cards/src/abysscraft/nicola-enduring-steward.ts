import { scriptOf } from '../define';

const otherMachina = {
  exists: { zone: 'field' as const, who: 'you' as const },
  filter: { kind: ['follower'] as const, trait: 'Machina', other: true as const },
};

export const nicolaEnduringSteward = scriptOf('nicola-enduring-steward', [
  {
    kind: 'static',
    key: 'rushBane',
    validIn: ['field'],
    activeIf: otherMachina,
    grant: { filter: { self: true }, keywords: ['rush', 'bane'] },
  },
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: { not: { playedFrom: 'hand' } },
        then: [{ op: 'grant', cards: 'self', keywords: ['assail'] }],
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'lastWords',
    on: 'lastWords',
    effect: [
      {
        op: 'optional',
        label: 'Discard 2 Machina',
        cost: [
          {
            op: 'discard',
            who: 'you',
            n: 2,
            filter: { trait: 'Machina' },
            as: 'paid',
          },
        ],
        then: [
          {
            op: 'if',
            cond: { atLeast: 2, value: { var: 'paid' } },
            then: [
              {
                op: 'move',
                cards: 'self',
                to: 'ex',
                whose: 'owner',
                costDeltaThisTurn: -1,
                costUntil: null,
              },
            ],
          },
        ],
      },
    ],
  },
]);
