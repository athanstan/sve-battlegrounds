import { scriptOf } from '../define';

export const intertwinedResolve = scriptOf('intertwined-resolve', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Put a Natura card into EX: deal 3',
            cost: [
              {
                op: 'select',
                as: 'natura',
                from: [{ zone: 'field', who: 'you' }],
                filter: { trait: 'Natura' },
                count: 1,
              },
              { op: 'move', cards: 'natura', to: 'ex' },
            ],
            effect: [
              {
                op: 'select',
                as: 'target',
                from: [{ zone: 'field', who: 'opponent' }],
                filter: { kind: ['follower'] },
                count: 1,
                target: true,
              },
              { op: 'damage', to: 'target', amount: 3 },
            ],
          },
          {
            label: 'Summon 2 Fairy tokens',
            effect: [{ op: 'token', name: 'Fairy', n: 2, to: 'field' }],
          },
        ],
      },
    ],
  },
]);
