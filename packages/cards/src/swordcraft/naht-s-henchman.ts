import { scriptOf } from '../define';
import { nahtnaught } from '../shared';

export const nahtSHenchman = scriptOf('naht-s-henchman', [
  {
    kind: 'static',
    key: 'exDiscount',
    validIn: ['ex'],
    costDelta: {
      filter: { self: true },
      amount: -1,
      if: { exists: { zone: 'field', who: 'you' }, filter: nahtnaught },
    },
  },
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: { exists: { zone: 'field', who: 'you' }, filter: nahtnaught },
        then: [{ op: 'draw', n: 1 }],
      },
    ],
  },
]);
