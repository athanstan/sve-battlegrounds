import { mageField } from '../shared';
import { scriptOf } from '../define';

const modes = [
  { label: 'Draw 2 cards', effect: [{ op: 'draw' as const, n: 2 }] },
  {
    label: 'Deal 3 damage to each enemy leader',
    effect: [{ op: 'damage' as const, to: 'enemyLeader', amount: 3 }],
  },
  {
    label: 'Deal 3 damage to an enemy follower',
    effect: [
      {
        op: 'select' as const,
        as: 'target',
        from: [{ zone: 'field' as const, who: 'opponent' as const }],
        filter: { kind: ['follower'] as const },
        count: 1,
      },
      { op: 'damage' as const, to: 'target', amount: 3 },
    ],
  },
];

export const truthSAdjudication = scriptOf('truth-s-adjudication', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'if',
        cond: mageField(2),
        then: [{ op: 'chooseUpTo', n: 2, options: modes }],
        else: [{ op: 'chooseOne', options: modes }],
      },
    ],
  },
]);
