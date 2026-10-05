import { scriptOf } from '../define';

export const assemblyDroid = scriptOf('assembly-droid@token', [
  {
    kind: 'activated',
    key: 'blast',
    label: 'Deal 5 to an enemy follower',
    cost: { engage: true },
    condition: {
      atLeast: 3,
      value: {
        count: { zone: 'field', who: 'you' },
        filter: { kind: ['follower'], trait: 'Machina', other: true },
      },
    },
    effect: [
      {
        op: 'select',
        as: 'fuel',
        from: [{ zone: 'field', who: 'you' }],
        filter: { kind: ['follower'], trait: 'Machina', other: true },
        count: 3,
      },
      { op: 'move', cards: 'fuel', to: 'cemetery' },
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
