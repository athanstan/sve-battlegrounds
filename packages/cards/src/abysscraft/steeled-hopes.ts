import { scriptOf } from '../define';

const machinaFollower = { kind: ['follower'] as const, trait: 'Machina' as const };

export const steeledHopes = scriptOf('steeled-hopes', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Add a Machina follower to your hand',
            effect: [
              {
                op: 'search',
                as: 'found',
                filter: machinaFollower,
                count: 1,
                reveal: true,
                then: 'hand',
              },
            ],
          },
          {
            label: 'Pay 6: summon three Machina followers',
            effect: [
              { op: 'payPlayPoints', n: 6 },
              {
                op: 'search',
                as: 'four',
                filter: { ...machinaFollower, costAtMost: 4 },
                count: 1,
                reveal: true,
                then: 'field',
              },
              {
                op: 'search',
                as: 'three',
                filter: { ...machinaFollower, costAtMost: 3 },
                count: 1,
                reveal: true,
                then: 'field',
              },
              {
                op: 'search',
                as: 'two',
                filter: { ...machinaFollower, costAtMost: 2 },
                count: 1,
                reveal: true,
                then: 'field',
              },
            ],
          },
        ],
      },
    ],
  },
]);
