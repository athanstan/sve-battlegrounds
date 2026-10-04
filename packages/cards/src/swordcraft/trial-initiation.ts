import { scriptOf } from '../define';

export const trialInitiation = scriptOf('trial-initiation', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Look at the top 2',
            effect: [
              {
                op: 'lookTop',
                n: 2,
                pick: { filter: { universe: 'Umamusume' }, upTo: 1, reveal: true, then: 'hand' },
                rest: 'bottom',
              },
            ],
          },
          {
            label: 'Return a BNW follower',
            effect: [
              {
                op: 'select',
                as: 'bnw',
                from: [{ zone: 'cemetery', who: 'you' }],
                filter: { kind: ['follower'], trait: 'BNW' },
                count: { upTo: 1 },
              },
              { op: 'move', cards: 'bnw', to: 'hand' },
            ],
          },
        ],
      },
    ],
  },
]);
