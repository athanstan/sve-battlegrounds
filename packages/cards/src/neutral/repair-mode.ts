import { scriptOf } from '../define';

export const repairMode = scriptOf('repair-mode@token', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [{ op: 'leaderDefense', who: 'you', delta: 1 }],
  },
]);
