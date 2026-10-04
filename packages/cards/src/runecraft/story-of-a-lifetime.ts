import { scriptOf } from '../define';

export const storyOfALifetime = scriptOf('story-of-a-lifetime', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'lookTop',
        n: 4,
        pick: { n: 2, reveal: true, then: 'hand' },
        rest: 'bury',
      },
      {
        op: 'if',
        cond: {
          exists: { zone: 'field', who: 'you' },
          filter: { name: 'Yukishima, Master Biographer' },
        },
        then: [{ op: 'recoverPlayPoints', n: 1 }],
      },
    ],
  },
]);
