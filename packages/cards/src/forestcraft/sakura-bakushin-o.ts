import { scriptOf } from '../define';

const umaOnField = {
  count: { zone: 'field' as const, who: 'you' as const },
  filter: { universe: 'Umamusume' },
};

export const sakuraBakushinO = scriptOf('sakura-bakushin-o', [
  {
    kind: 'triggered',
    key: 'strike',
    on: 'strike',
    effect: [
      {
        op: 'if',
        cond: { equal: [umaOnField, 5] },
        then: [{ op: 'draw', n: 1 }],
        else: [
          {
            op: 'if',
            cond: { atLeast: 3, value: umaOnField },
            then: [
              {
                op: 'if',
                cond: { atMost: 4, value: umaOnField },
                then: [
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
