import { scriptOf } from '../define';

export const lamplitTraining = scriptOf('lamplit-training-of-a-witch-to-be', [
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
        cond: { exists: { zone: 'field', who: 'you' }, filter: { racing: true } },
        then: [{ op: 'damage', to: 'target', amount: 3 }],
        else: [{ op: 'damage', to: 'target', amount: 2 }],
      },
    ],
  },
]);
