import { scriptOf } from '../define';

export const unbridledFury = scriptOf('unbridled-fury', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
        target: true,
      },
      {
        op: 'damage',
        to: 'target',
        amount: { count: { zone: 'field', who: 'you' }, filter: { kind: ['follower'] } },
      },
    ],
  },
]);
