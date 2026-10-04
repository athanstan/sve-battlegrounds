import { scriptOf } from '../define';

const onAnyEvolve = {
  kind: 'triggered' as const,
  key: 'onAnyEvolve',
  on: { followerOnYourFieldEvolves: true as const },
  effect: [
    { op: 'damage' as const, to: 'enemyLeader', amount: 1 },
    {
      op: 'damage' as const,
      to: {
        each: { zone: 'field' as const, who: 'opponent' as const },
        filter: { kind: ['follower'] as const },
      },
      amount: 2,
    },
    { op: 'leaderDefense' as const, who: 'you' as const, delta: 1 },
  ],
};

export const piercyeQueenOfFrost = scriptOf('piercye-queen-of-frost', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: {
          atLeast: 3,
          value: {
            count: { zone: 'evolveDeckRevealed', who: 'you' },
            filter: { evolved: true },
          },
        },
        then: [{ op: 'evolveSelf' }],
      },
    ],
  },
  onAnyEvolve,
]);

export const piercyeQueenOfFrostEvolved = scriptOf('piercye-queen-of-frost@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'search',
        as: 'found',
        filter: { kind: ['follower'], costAtMost: 2 },
        count: 1,
        reveal: true,
        then: 'hand',
      },
    ],
  },
  onAnyEvolve,
]);
