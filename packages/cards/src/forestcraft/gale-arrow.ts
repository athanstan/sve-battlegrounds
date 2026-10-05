import { scriptOf } from '../define';

export const galeArrow = scriptOf('gale-arrow@token', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'select',
        as: 'foe',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
        target: true,
      },
      { op: 'if', cond: { combo: 3 }, then: [{ op: 'damage', to: 'foe', amount: 2 }] },
    ],
  },
]);
