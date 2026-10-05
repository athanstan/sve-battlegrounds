import { scriptOf } from '../define';

export const stormArrow = scriptOf('storm-arrow@token', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      { op: 'if', cond: { combo: 5 }, then: [{ op: 'damage', to: 'enemyLeader', amount: 2 }] },
    ],
  },
]);
