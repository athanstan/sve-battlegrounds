import { mageFollower } from '../shared';
import { scriptOf } from '../define';

export const chakramWizard = scriptOf('chakram-wizard', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      {
        op: 'if',
        cond: {
          exists: { zone: 'field', who: 'you' },
          filter: { ...mageFollower, other: true },
        },
        then: [{ op: 'damage', to: 'target', amount: 3 }],
      },
    ],
  },
]);

export const chakramWizardEvolved = scriptOf('chakram-wizard@evolved', [
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
      { op: 'damage', to: 'target', amount: 3 },
      { op: 'draw', n: 1 },
      { op: 'discard', who: 'you', n: 1 },
    ],
  },
]);
