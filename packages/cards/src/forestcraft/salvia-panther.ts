import { scriptOf } from '../define';

const beastReturned = {
  returnedFromField: {
    kind: ['follower'] as const,
    trait: 'Beast',
    nameNot: 'Salvia Panther',
  },
};

export const salviaPanther = scriptOf('salvia-panther', [
  {
    kind: 'static',
    key: 'discount',
    validIn: ['hand', 'ex'],
    costDelta: { filter: { self: true }, amount: -2, if: beastReturned },
  },
]);

export const salviaPantherEvolved = scriptOf('salvia-panther@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'back',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'], costAtMost: 3 },
        count: 1,
      },
      { op: 'returnToHand', cards: 'back' },
    ],
  },
]);
