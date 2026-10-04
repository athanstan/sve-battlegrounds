import { scriptOf } from '../define';

export const smartFalcon = scriptOf('smart-falcon', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'returned',
        from: [{ zone: 'field', who: 'you' }],
        filter: { universe: 'Umamusume', other: true },
        count: 'any',
      },
      { op: 'returnToHand', cards: 'returned' },
      {
        op: 'damage',
        to: { each: { zone: 'field', who: 'opponent' }, filter: { kind: ['follower'] } },
        amount: { forEvery: 1, of: { var: 'returned' }, each: 2 },
      },
    ],
  },
]);
