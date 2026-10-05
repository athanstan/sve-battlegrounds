import { scriptOf } from '../define';

export const minamiNittaWaterSEdgeBride = scriptOf('minami-nitta-water-s-edge-bride', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'search',
        as: 'bride',
        filter: { kind: ['follower'], nameIncludes: 'Anastasia' },
        count: 1,
        reveal: false,
        then: 'ex',
        costDeltaThisTurn: -3,
      },
    ],
  },
  {
    kind: 'activated',
    key: 'lesson',
    label: 'Engage an enemy follower',
    cost: { list: [{ lesson: 1 }, { engage: true }] },
    effect: [
      {
        op: 'select',
        as: 'foe',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      { op: 'engage', cards: 'foe' },
      { op: 'skipRefresh', cards: 'foe' },
    ],
  },
]);
