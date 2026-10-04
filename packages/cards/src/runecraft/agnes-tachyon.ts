import { scriptOf } from '../define';

const onSpell = {
  kind: 'triggered' as const,
  key: 'spell',
  on: { youPlaySpell: {} },
  effect: [
    {
      op: 'select' as const,
      as: 'target',
      from: [{ zone: 'field' as const, who: 'opponent' as const }],
      filter: { kind: ['follower'] as const },
      count: { upTo: 1 },
    },
    { op: 'buff' as const, cards: 'target', attack: -1, defense: -1 },
  ],
};

export const agnesTachyon = scriptOf('agnes-tachyon', [onSpell]);

export const agnesTachyonEvolved = scriptOf('agnes-tachyon@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'spell',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: { kind: ['spell'] },
        count: { upTo: 1 },
      },
      { op: 'move', cards: 'spell', to: 'hand' },
    ],
  },
  onSpell,
]);
