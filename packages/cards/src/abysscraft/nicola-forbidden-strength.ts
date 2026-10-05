import { scriptOf } from '../define';

export const nicolaForbiddenStrength = scriptOf('nicola-forbidden-strength', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'buryTop', n: 2 }],
  },
]);

export const nicolaForbiddenStrengthEvolved = scriptOf('nicola-forbidden-strength@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'stashed',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: { trait: 'Machina', costAtMost: 2 },
        count: 1,
      },
      { op: 'move', cards: 'stashed', to: 'ex', costDeltaThisTurn: -2 },
    ],
  },
]);
