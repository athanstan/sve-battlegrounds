import { scriptOf } from '../define';

const forestFollower = { kind: ['follower'] as const, cardClass: 'forestcraft' as const };

export const forestGuardianSBow = scriptOf('forest-guardian-s-bow', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: {
          exists: { zone: 'field', who: 'you' },
          filter: { name: 'Arisa, Evergreen Arrow' },
        },
        then: [{ op: 'placeCounters', cards: 'self', name: 'arrow', n: 2 }],
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'arrow',
    perTurn: 1,
    on: {
      whenever: {
        type: 'moved',
        to: { zone: 'field', who: 'you' },
        filter: forestFollower,
      },
    },
    effect: [{ op: 'placeCounters', cards: 'self', name: 'arrow', n: 1 }],
  },
  {
    kind: 'activated',
    key: 'shot',
    label: 'Deal damage equal to arrow counters',
    cost: { engage: true },
    effect: [
      {
        op: 'select',
        as: 'foe',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      { op: 'damage', to: 'foe', amount: { counters: 'arrow', on: 'self' } },
      { op: 'move', cards: 'self', to: 'cemetery' },
    ],
  },
]);
