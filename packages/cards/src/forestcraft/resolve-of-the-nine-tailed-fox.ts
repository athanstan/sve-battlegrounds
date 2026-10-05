import { scriptOf } from '../define';

export const resolveOfTheNineTailedFox = scriptOf('resolve-of-the-nine-tailed-fox', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'chooseUpTo',
        n: 2,
        options: [
          {
            label: 'Buff Sekka, Ninefold Blaze if 9 cards are banished',
            effect: [
              {
                op: 'select',
                as: 'sekka',
                from: [{ zone: 'field', who: 'you' }],
                filter: { name: 'Sekka, Ninefold Blaze' },
                count: 1,
              },
              {
                op: 'if',
                cond: {
                  atLeast: 9,
                  value: { count: { zone: 'banished', who: 'you' } },
                },
                then: [
                  { op: 'buff', cards: 'sekka', attack: 2, defense: 2 },
                  { op: 'grant', cards: 'sekka', keywords: ['storm'] },
                ],
              },
            ],
          },
          {
            label: 'Buff a Sekka and strike with its attack',
            effect: [
              {
                op: 'select',
                as: 'named',
                from: [{ zone: 'field', who: 'you' }],
                filter: { kind: ['follower'], nameIncludes: 'Sekka' },
                count: 1,
              },
              {
                op: 'select',
                as: 'foe',
                from: [{ zone: 'field', who: 'opponent' }],
                filter: { kind: ['follower'] },
                count: 1,
              },
              { op: 'buff', cards: 'named', attack: 2, defense: 2 },
              { op: 'damage', to: 'foe', amount: { attr: 'attack', of: 'named' } },
            ],
          },
        ],
      },
    ],
  },
]);
