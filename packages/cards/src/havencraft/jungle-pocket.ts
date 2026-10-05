import { scriptOf } from '../define';

const umaOnField = {
  count: { zone: 'field' as const, who: 'you' as const },
  filter: { universe: 'Umamusume' },
};

export const junglePocket = scriptOf('jungle-pocket', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'discard',
        who: 'you',
        n: 1,
        filter: { universe: 'Umamusume' },
        as: 'fed',
      },
      {
        op: 'if',
        cond: { did: 'fed' },
        then: [
          {
            op: 'if',
            cond: { matches: 'fed', filter: { costAtLeast: 7 } },
            then: [{ op: 'draw', n: 2 }],
            else: [{ op: 'draw', n: 1 }],
          },
        ],
      },
    ],
  },
  {
    kind: 'activated',
    key: 'shot',
    label: 'Damage an enemy follower',
    cost: { engage: true },
    effect: [
      {
        op: 'select',
        as: 'foe',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      {
        op: 'if',
        cond: { atLeast: 3, value: umaOnField },
        then: [
          { op: 'damage', to: 'foe', amount: 2 },
          {
            op: 'if',
            cond: { atLeast: 5, value: umaOnField },
            then: [{ op: 'damage', to: 'enemyLeader', amount: 2 }],
          },
        ],
      },
    ],
  },
]);
