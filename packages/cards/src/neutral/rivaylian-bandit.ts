import { twoMounts } from '../shared';
import { scriptOf } from '../define';

const stormOnGain = {
  kind: 'triggered' as const,
  key: 'stormOnGain',
  on: { gainsAttackOrDefense: true as const },
  effect: [{ op: 'grant' as const, cards: 'self' as const, keywords: ['storm' as const] }],
};

export const rivaylianBandit = scriptOf('rivaylian-bandit', [stormOnGain]);

export const rivaylianBanditEvolved = scriptOf('rivaylian-bandit@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: { upTo: 1 },
        target: true,
      },
      {
        op: 'if',
        cond: twoMounts,
        then: [{ op: 'damage', to: 'target', amount: 2 }],
      },
    ],
  },
  stormOnGain,
]);
