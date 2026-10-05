import { scriptOf } from '../define';

export const feenaDynamiteDaredevil = scriptOf(
  'feena-dynamite-daredevil',
  [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Look at the top 5 for a 1-cost follower',
            effect: [
              {
                op: 'lookTop',
                n: 5,
                pick: {
                  filter: { kind: ['follower'], costIs: 1 },
                  upTo: 1,
                  reveal: true,
                  then: 'hand',
                },
                rest: 'bottom',
              },
            ],
          },
          {
            label: 'Destroy an enemy follower that costs 1',
            effect: [
              {
                op: 'select',
                as: 'foe',
                from: [{ zone: 'field', who: 'opponent' }],
                filter: { kind: ['follower'], costIs: 1 },
                count: 1,
              },
              { op: 'destroy', cards: 'foe' },
            ],
          },
        ],
      },
    ],
  },
  ],
  { allPrintings: true },
);
