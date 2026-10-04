import { scriptOf } from '../define';

export const marvelousSunday = scriptOf('marvelous-sunday', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'optional',
        label: "Return another card on your field to its owner's hand?",
        cost: [
          {
            op: 'select',
            as: 'bounced',
            from: [{ zone: 'field', who: 'you' }],
            filter: { other: true },
            count: 1,
          },
          { op: 'returnToHand', cards: 'bounced' },
        ],
        then: [{ op: 'leaderDefense', who: 'you', delta: 2 }],
      },
    ],
  },
]);
