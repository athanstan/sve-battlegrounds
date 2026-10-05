import { scriptOf } from '../define';

const droid = { op: 'token' as const, name: 'Assembly Droid', n: 1 };

export const garnetWaltz = scriptOf('garnet-waltz', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Deal 2 to the enemy leader and 1 to yours',
            effect: [
              { op: 'damage', to: 'enemyLeader', amount: 2 },
              { op: 'damage', to: 'yourLeader', amount: 1 },
            ],
          },
          {
            label: 'Summon Assembly Droids',
            effect: [
              { ...droid, to: 'field' },
              {
                op: 'if',
                cond: {
                  exists: { zone: 'field', who: 'you' },
                  filter: { name: 'Mono, Garnet Rebel' },
                },
                then: [{ ...droid, to: 'field' }],
                else: [{ ...droid, to: 'ex' }],
              },
            ],
          },
        ],
      },
    ],
  },
]);
