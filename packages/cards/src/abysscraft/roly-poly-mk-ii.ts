import { scriptOf } from '../define';

export const rolyPolyMkIi = scriptOf('roly-poly-mk-ii', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'lookTop',
        n: 2,
        pick: { filter: { trait: 'Machina' }, upTo: 1, reveal: true, then: 'hand' },
        rest: 'bury',
      },
    ],
  },
]);
