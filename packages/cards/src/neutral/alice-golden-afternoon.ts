import { scriptOf } from '../define';

export const aliceGoldenAfternoon = scriptOf('alice-golden-afternoon', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      { op: 'draw', n: 1 },
      {
        op: 'select',
        as: 'stolen',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'], costAtMost: 4 },
        count: 1,
        target: true,
      },
      {
        op: 'if',
        cond: { not: { playedFrom: 'hand' } },
        then: [{ op: 'move', cards: 'stolen', to: 'ex', whose: 'owner' }],
      },
    ],
  },
]);
