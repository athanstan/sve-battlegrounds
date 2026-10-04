import { scriptOf } from '../define';

export const spinariaWaveringWill = scriptOf(
  'spinaria-wavering-will',
  [
    {
      kind: 'triggered',
      key: 'onAnyEvolve',
      on: { followerOnYourFieldEvolves: true },
      effect: [{ op: 'leaderDefense', who: 'you', delta: 2 }],
    },
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        {
          op: 'select',
          as: 'picked',
          from: [{ zone: 'cemetery', who: 'you' }],
          filter: { kind: ['follower'], cardClass: 'forestcraft', costAtMost: 2 },
          count: { upTo: 1 },
        },
        { op: 'move', cards: 'picked', to: 'ex', costDeltaThisTurn: -2 },
      ],
    },
  ],
  { allPrintings: true },
);
