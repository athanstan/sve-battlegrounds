import { enemyLeaderOrFollower } from '../shared';
import { scriptOf } from '../define';

const reservedKeywords = {
  kind: 'static' as const,
  key: 'reserved',
  validIn: ['field'] as const,
  grant: {
    filter: { self: true as const, reserved: true as const },
    keywords: ['intimidate' as const, 'aura' as const],
  },
};

const endPing = {
  kind: 'triggered' as const,
  key: 'end',
  on: { at: 'startOfEndPhase' as const, whose: 'yours' as const },
  effect: [
    {
      op: 'select' as const,
      as: 'target',
      from: [{ zone: 'field' as const, who: 'opponent' as const }],
      filter: { kind: ['follower'] as const },
      count: { upTo: 1 },
      target: true as const,
    },
    { op: 'damage' as const, to: 'target', amount: 1 },
  ],
};

export const leodTheCrescentBlade = scriptOf('leod-the-crescent-blade', [
  reservedKeywords,
  endPing,
]);

export const leodTheCrescentBladeEvolved = scriptOf(
  'leod-the-crescent-blade@evolved',
  [
    reservedKeywords,
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [
        {
          op: 'select',
          as: 'target',
          from: enemyLeaderOrFollower,
          filter: { kind: ['follower', 'leader'] },
          count: 1,
          target: true,
        },
        { op: 'damage', to: 'target', amount: 2 },
      ],
    },
    endPing,
  ],
  { allPrintings: true },
);
