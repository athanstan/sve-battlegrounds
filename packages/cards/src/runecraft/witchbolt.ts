import { scriptOf } from '../define';

export const witchbolt = scriptOf('witchbolt', [
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
        cond: { exists: { zone: 'field', who: 'you' }, filter: { evolved: true } },
        then: [{ op: 'draw', n: 1 }],
      },
    ],
  },
]);
