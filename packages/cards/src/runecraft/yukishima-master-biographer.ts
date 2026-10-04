import { scriptOf } from '../define';

const cheapFestiveOrMage = { traits: ['Festive', 'Mage'] as const, costAtMost: 3 };

export const yukishimaMasterBiographer = scriptOf('yukishima-master-biographer', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'nextPlayCost',
        amount: -3,
        filter: cheapFestiveOrMage,
        thisTurn: true,
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'ping',
    on: { whenever: { type: 'played', filter: cheapFestiveOrMage } },
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      { op: 'damage', to: 'target', amount: 2 },
    ],
  },
]);
