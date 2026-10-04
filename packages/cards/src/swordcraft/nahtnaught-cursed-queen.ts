import { scriptOf } from '../define';

export const nahtnaughtCursedQueen = scriptOf('nahtnaught-cursed-queen', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'search',
        as: 'found',
        filter: { cardClass: 'swordcraft', costIs: 1 },
        count: 1,
        reveal: false,
        then: 'ex',
      },
    ],
  },
  {
    kind: 'activated',
    key: 'act',
    cost: { playPoints: 0 },
    perTurn: 1,
    label: 'Box an enemy follower',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
        target: true,
      },
      { op: 'engage', cards: 'target' },
      { op: 'box', cards: 'target' },
    ],
  },
]);
