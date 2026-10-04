import { scriptOf } from '../define';

export const luckyStarInTheSky = scriptOf('lucky-star-in-the-sky', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'lookTop',
        n: 1,
        pick: { filter: { universe: 'Umamusume' }, upTo: 1, reveal: true, then: 'hand' },
        rest: 'top',
      },
      {
        op: 'if',
        cond: {
          atLeast: 5,
          value: {
            count: { zone: 'cemetery', who: 'you' },
            filter: { kind: ['spell'], universe: 'Umamusume' },
          },
        },
        then: [{ op: 'leaderDefense', who: 'you', delta: 2 }],
      },
    ],
  },
]);
