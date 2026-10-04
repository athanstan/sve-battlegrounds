import { mageField } from '../shared';
import { scriptOf } from '../define';

export const mysticAbsorption = scriptOf('mystic-absorption', [
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
      { op: 'damage', to: 'target', amount: 4 },
      {
        op: 'if',
        cond: mageField(2),
        then: [{ op: 'leaderDefense', who: 'you', delta: 2 }],
      },
    ],
  },
]);
