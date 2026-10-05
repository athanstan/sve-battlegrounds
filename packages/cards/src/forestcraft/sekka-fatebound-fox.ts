import { scriptOf } from '../define';

export const sekkaFateboundFox = scriptOf('sekka-fatebound-fox', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'lookTop',
        n: 3,
        pick: {
          filter: { cardClass: 'forestcraft', costAtMost: 2 },
          upTo: 1,
          reveal: true,
          then: 'hand',
        },
        rest: 'bottom',
      },
      { op: 'if', cond: { did: 'look' }, then: [{ op: 'discard', who: 'you', n: 1 }] },
    ],
  },
  {
    kind: 'activated',
    key: 'summon',
    from: 'cemetery',
    label: 'Summon Sekka, Ninefold Blaze',
    cost: { playPoints: 3 },
    condition: { atLeast: 3, value: { count: { zone: 'cemetery', who: 'you' } } },
    effect: [
      {
        op: 'select',
        as: 'others',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: { other: true },
        count: 2,
      },
      { op: 'banish', cards: 'others' },
      { op: 'banish', cards: 'self' },
      {
        op: 'select',
        as: 'sekka',
        from: [{ zone: 'evolveDeck', who: 'you' }],
        filter: { name: 'Sekka, Ninefold Blaze' },
        count: { upTo: 1 },
      },
      { op: 'move', cards: 'sekka', to: 'field' },
    ],
  },
]);
