import { mageSpell } from '../shared';
import { scriptOf } from '../define';

export const grimoireSorcerer = scriptOf('grimoire-sorcerer', []);

export const grimoireSorcererEvolved = scriptOf('grimoire-sorcerer@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'stashed',
        from: [{ zone: 'hand', who: 'you' }],
        filter: mageSpell,
        count: { upTo: 1 },
      },
      { op: 'move', cards: 'stashed', to: 'ex', costDeltaThisTurn: -3 },
    ],
  },
]);
