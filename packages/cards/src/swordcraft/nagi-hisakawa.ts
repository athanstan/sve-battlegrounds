import { scriptOf } from '../define';

export const nagiHisakawa = scriptOf('nagi-hisakawa', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: {
          atLeast: 2,
          value: { count: { zone: 'cemetery', who: 'you' }, filter: { costIs: 1 } },
        },
        then: [
          {
            op: 'select',
            as: 'paid',
            from: [{ zone: 'cemetery', who: 'you' }],
            filter: { costIs: 1 },
            count: 2,
          },
          { op: 'banish', cards: 'paid' },
          {
            op: 'chooseUpTo',
            n: 2,
            options: [
              {
                label: 'Destroy an enemy follower',
                effect: [
                  {
                    op: 'select',
                    as: 'target',
                    from: [{ zone: 'field', who: 'opponent' }],
                    filter: { kind: ['follower'] },
                    count: 1,
                    target: true,
                  },
                  { op: 'destroy', cards: 'target' },
                ],
              },
              {
                label: 'Deal 2 to each enemy leader',
                effect: [{ op: 'damage', to: 'enemyLeader', amount: 2 }],
              },
              {
                label: 'Draw a card, then discard a card',
                effect: [
                  { op: 'draw', n: 1 },
                  { op: 'discard', who: 'you', n: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
