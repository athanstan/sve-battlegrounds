import { scriptOf } from '../define';

export const feyboltArcher = scriptOf('feybolt-archer', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      { op: 'token', name: 'Fairy', n: 1, to: 'field' },
      {
        op: 'lookTop',
        n: 3,
        pick: { filter: { pixie: true }, upTo: 1, reveal: true, then: 'hand' },
        rest: 'bottom',
      },
    ],
  },
]);
