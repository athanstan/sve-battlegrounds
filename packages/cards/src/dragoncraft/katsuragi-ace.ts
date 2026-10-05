import { scriptOf } from '../define';

export const katsuragiAce = scriptOf('katsuragi-ace', [
  {
    kind: 'triggered',
    key: 'fromDiscard',
    on: {
      whenever: {
        type: 'moved',
        self: true,
        cause: 'discard',
        by: { universe: 'Umamusume' },
      },
    },
    condition: { overflow: true },
    effect: [
      {
        op: 'optional',
        label: 'Pay 3 to summon this',
        cost: [{ op: 'payPlayPoints', n: 3 }],
        then: [{ op: 'move', cards: 'self', to: 'field' }],
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'foe',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      { op: 'destroy', cards: 'foe' },
    ],
  },
]);
