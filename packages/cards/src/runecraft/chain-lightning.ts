import { mageField } from '../shared';
import { scriptOf } from '../define';

export const chainLightning = scriptOf('chain-lightning', [
  {
    kind: 'static',
    key: 'fromEx',
    validIn: ['ex'],
  },
  {
    kind: 'triggered',
    key: 'endBury',
    on: { at: 'startOfEndPhase', whose: 'yours' },
    effect: [{ op: 'move', cards: 'self', to: 'cemetery' }],
  },
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      { op: 'damage', to: 'enemyLeader', amount: 4 },
      {
        op: 'if',
        cond: mageField(2),
        then: [{ op: 'move', cards: 'self', to: 'ex' }],
      },
    ],
  },
]);
