import { pixieFollower } from '../shared';
import { scriptOf } from '../define';

export const fairySlugger = scriptOf('fairy-slugger', []);

export const fairySluggerEvolved = scriptOf(
  'fairy-slugger@evolved',
  [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [
        { op: 'token', name: 'Fairy Wisp', n: 1, to: 'ex' },
        { op: 'token', name: 'Fairy', n: 1, to: 'ex' },
        {
          op: 'if',
          cond: {
            atLeast: 3,
            value: { count: { zone: 'ex', who: 'you' }, filter: pixieFollower },
          },
          then: [{ op: 'leaderDefense', who: 'you', delta: 2 }],
        },
      ],
    },
  ],
  { allPrintings: true },
);
