import { scriptOf } from '../define';

export const vodka = scriptOf(
  'vodka',
  [
    {
      kind: 'static',
      key: 'discount',
      validIn: ['hand', 'ex'],
      costDelta: {
        filter: { self: true },
        amount: -2,
        if: {
          exists: { zone: 'field', who: 'you' },
          filter: { name: 'Daiwa Scarlet' },
        },
      },
    },
    {
      kind: 'triggered',
      key: 'spell',
      on: { youPlaySpell: {} },
      perTurn: 1,
      effect: [
        {
          op: 'buff',
          cards: {
            each: { zone: 'field', who: 'you' },
            filter: { kind: ['follower'], universe: 'Umamusume' },
          },
          attack: 1,
          defense: 1,
        },
        {
          op: 'grant',
          cards: {
            each: { zone: 'field', who: 'you' },
            filter: { kind: ['follower'], universe: 'Umamusume' },
          },
          keywords: ['rush'],
        },
      ],
    },
  ],
  { allPrintings: true },
);
