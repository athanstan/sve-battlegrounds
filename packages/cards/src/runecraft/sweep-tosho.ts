import { scriptOf } from '../define';

export const sweepTosho = scriptOf('sweep-tosho', [
  {
    kind: 'static',
    key: 'discount',
    validIn: ['hand', 'ex'],
    costDelta: {
      filter: { self: true },
      amount: -2,
      if: {
        atLeast: 5,
        value: {
          count: { zone: 'cemetery', who: 'you' },
          filter: { kind: ['spell'], universe: 'Umamusume' },
        },
      },
    },
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
        filter: { kind: ['spell'], universe: 'Umamusume', costIs: 1 },
        count: { upTo: 1 },
      },
      { op: 'move', cards: 'picked', to: 'ex', costDeltaThisTurn: -1 },
    ],
  },
]);
