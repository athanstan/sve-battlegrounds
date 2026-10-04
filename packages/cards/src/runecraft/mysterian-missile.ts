import { scriptOf } from '../define';

export const mysterianMissile = scriptOf('mysterian-missile@token', [
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
      { op: 'damage', to: 'target', amount: 3 },
      {
        op: 'if',
        cond: {
          atLeast: 10,
          value: {
            count: { zone: 'cemetery', who: 'you' },
            filter: { trait: 'Academic' },
          },
        },
        then: [{ op: 'damage', to: 'enemyLeader', amount: 2 }],
      },
    ],
  },
]);
