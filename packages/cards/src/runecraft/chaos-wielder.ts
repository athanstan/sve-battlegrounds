import { mageGrave } from '../shared';
import { scriptOf } from '../define';

export const chaosWielder = scriptOf('chaos-wielder', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: { spellchain: 5 },
        then: [{ op: 'recoverPlayPoints', n: 2 }],
      },
    ],
  },
]);

export const chaosWielderEvolved = scriptOf('chaos-wielder@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      { op: 'damage', to: 'target', amount: 2 },
      {
        op: 'if',
        cond: mageGrave(5),
        then: [{ op: 'draw', n: 1 }],
      },
    ],
  },
]);
