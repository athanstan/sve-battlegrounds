import { mageField } from '../shared';
import { scriptOf } from '../define';

export const rivenEarth = scriptOf('riven-earth', [
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
      {
        op: 'if',
        cond: mageField(2),
        then: [
          { op: 'damage', to: 'target', amount: 4 },
          { op: 'damage', to: 'enemyLeader', amount: 1 },
        ],
        else: [{ op: 'damage', to: 'target', amount: 2 }],
      },
    ],
  },
]);
