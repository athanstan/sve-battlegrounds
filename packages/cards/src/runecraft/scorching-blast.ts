import { mageField } from '../shared';
import { scriptOf } from '../define';

export const scorchingBlast = scriptOf('scorching-blast', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
        target: true,
      },
      { op: 'damage', to: 'target', amount: 5 },
      {
        op: 'if',
        cond: mageField(2),
        then: [{ op: 'damage', to: 'enemyLeader', amount: 2 }],
      },
    ],
  },
]);
