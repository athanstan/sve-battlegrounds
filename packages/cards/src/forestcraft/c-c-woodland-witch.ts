import { scriptOf } from '../define';

export const ccWoodlandWitch = scriptOf('c-c-woodland-witch', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'targets',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 'any',
        target: true,
      },
      {
        op: 'damage',
        to: 'targets',
        amount: {
          sum: [{ count: { zone: 'hand', who: 'you' } }, { count: { zone: 'ex', who: 'you' } }],
        },
        divided: true,
      },
    ],
  },
]);
