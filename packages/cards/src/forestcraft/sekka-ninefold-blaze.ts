import { scriptOf } from '../define';

export const sekkaNinefoldBlaze = scriptOf('sekka-ninefold-blaze@advanced', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Add a Resolve of the Nine-Tailed Fox from your deck',
            effect: [
              {
                op: 'search',
                as: 'fox',
                filter: { name: 'Resolve of the Nine-Tailed Fox' },
                count: 1,
                reveal: true,
                then: 'hand',
              },
            ],
          },
          {
            label: 'Return a Resolve of the Nine-Tailed Fox from your cemetery',
            effect: [
              {
                op: 'select',
                as: 'fox',
                from: [{ zone: 'cemetery', who: 'you' }],
                filter: { name: 'Resolve of the Nine-Tailed Fox' },
                count: 1,
              },
              { op: 'move', cards: 'fox', to: 'hand' },
            ],
          },
        ],
      },
    ],
  },
]);
