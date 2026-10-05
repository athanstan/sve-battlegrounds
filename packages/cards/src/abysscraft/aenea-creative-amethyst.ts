import { scriptOf } from '../define';

const machina = { trait: 'Machina' as const };

export const aeneaCreativeAmethyst = scriptOf('aenea-creative-amethyst', []);

export const aeneaCreativeAmethystEvolved = scriptOf('aenea-creative-amethyst@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'search',
        as: 'found',
        filter: { name: 'Roly-Poly Mk II' },
        count: 1,
        reveal: false,
        then: 'field',
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'onSuperEvolve',
    on: 'onSuperEvolve',
    effect: [
      {
        op: 'select',
        as: 'stashed',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: machina,
        count: 1,
      },
      { op: 'move', cards: 'stashed', to: 'ex', costDeltaThisTurn: -3 },
    ],
  },
]);
