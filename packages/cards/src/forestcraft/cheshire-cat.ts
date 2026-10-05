import { scriptOf } from '../define';

const enemy = [
  { zone: 'field' as const, who: 'opponent' as const },
  { zone: 'leader' as const, who: 'opponent' as const },
];

export const cheshireCat = scriptOf('cheshire-cat', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'ping',
        from: enemy,
        filter: { kind: ['follower', 'leader'] },
        count: 1,
        target: true,
      },
      {
        op: 'if',
        cond: { playedFrom: 'hand' },
        then: [{ op: 'damage', to: 'ping', amount: 1 }],
        else: [{ op: 'damage', to: 'ping', amount: 2 }],
      },
    ],
  },
  {
    kind: 'activated',
    key: 'fable',
    label: 'Place 2 Fable counters',
    cost: { engage: true },
    effect: [
      { op: 'returnToDeck', cards: 'self', position: 'bottom' },
      {
        op: 'select',
        as: 'fable',
        from: [
          { zone: 'field', who: 'you' },
          { zone: 'ex', who: 'you' },
        ],
        filter: { kind: ['follower'], trait: 'Fable' },
        count: 1,
      },
      { op: 'placeCounters', cards: 'fable', name: 'Fable', n: 2 },
    ],
  },
]);
