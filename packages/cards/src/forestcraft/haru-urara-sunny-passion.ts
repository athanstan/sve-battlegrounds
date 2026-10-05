import { scriptOf } from '../define';

export const haruUraraSunnyPassion = scriptOf('haru-urara-sunny-passion', [
  {
    kind: 'triggered',
    key: 'onRace',
    on: 'onRace',
    effect: [
      { op: 'buff', cards: 'self', attack: 1, defense: 1 },
      {
        op: 'lookTop',
        n: 5,
        pick: {
          filter: { kind: ['follower'], universe: 'Umamusume', costAtMost: 2 },
          upTo: 1,
          reveal: true,
          then: 'field',
        },
        rest: 'bottom',
      },
    ],
  },
]);
