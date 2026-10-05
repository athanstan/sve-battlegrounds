import { scriptOf } from '../define';

export const windflowerTiger = scriptOf('windflower-tiger', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'bounced',
        from: [{ zone: 'field', who: 'you' }],
        filter: { kind: ['follower'], trait: 'Beast', nameNot: 'Windflower Tiger' },
        count: 1,
        target: true,
      },
      { op: 'returnToHand', cards: 'bounced' },
      {
        op: 'search',
        as: 'salvia',
        filter: { name: 'Salvia Panther' },
        count: 1,
        reveal: true,
        then: 'hand',
      },
    ],
  },
]);
