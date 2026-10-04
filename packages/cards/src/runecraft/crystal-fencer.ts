import { runecraftSpell } from '../shared';
import { scriptOf } from '../define';

export const crystalFencer = scriptOf('crystal-fencer', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      { op: 'draw', n: 1 },
      { op: 'discard', who: 'you', n: 1 },
    ],
  },
]);

export const crystalFencerEvolved = scriptOf('crystal-fencer@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'stashed',
        from: [{ zone: 'hand', who: 'you' }],
        filter: runecraftSpell,
        count: { upTo: 1 },
      },
      { op: 'move', cards: 'stashed', to: 'ex', costDeltaThisTurn: -3 },
    ],
  },
]);
