import { mageFollower, mageGrave, runecraftSpell } from '../shared';
import { scriptOf } from '../define';

export const dariaInfinityWitch = scriptOf('daria-infinity-witch', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'lookTop',
        n: 3,
        picks: [
          { filter: mageFollower, upTo: 1, reveal: true, then: 'hand' },
          { filter: { kind: ['spell'], trait: 'Mage' }, upTo: 1, reveal: true, then: 'hand' },
        ],
        rest: 'bottom',
      },
    ],
  },
  {
    kind: 'activated',
    key: 'stash',
    label: 'Put a Runecraft spell into EX. It costs 3 less this turn.',
    cost: { engage: true },
    condition: mageGrave(5),
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
