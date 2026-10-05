import { scriptOf } from '../define';

const umaOnField = {
  count: { zone: 'field' as const, who: 'you' as const },
  filter: { universe: 'Umamusume' },
  times: 2,
};

export const soundsOfEarth = scriptOf('sounds-of-earth', [
  {
    kind: 'static',
    key: 'discount',
    validIn: ['hand', 'ex'],
    costDelta: { filter: { self: true }, amount: { neg: umaOnField } },
  },
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'bounced',
        from: [{ zone: 'field', who: 'you' }],
        filter: { universe: 'Umamusume', nameNot: 'Sounds of Earth' },
        count: 1,
        target: true,
      },
      { op: 'returnToHand', cards: 'bounced' },
      {
        op: 'select',
        as: 'foe',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      { op: 'damage', to: 'foe', amount: 5 },
    ],
  },
]);
