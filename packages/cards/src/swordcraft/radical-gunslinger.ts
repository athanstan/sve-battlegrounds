import { enemyLeaderOrFollower, mount } from '../shared';
import { scriptOf } from '../define';

export const radicalGunslinger = scriptOf('radical-gunslinger', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'token', name: 'Dutiful Steed', n: 1, to: 'field' }],
  },
  {
    kind: 'activated',
    key: 'act',
    cost: { engage: true },
    condition: {
      atLeast: 2,
      value: {
        count: { zone: 'field', who: 'you' },
        filter: { ...mount, other: true, reserved: true },
      },
    },
    label: 'Engage 2 Mounts: deal 2',
    effect: [
      {
        op: 'select',
        as: 'mounts',
        from: [{ zone: 'field', who: 'you' }],
        filter: { ...mount, other: true, reserved: true },
        count: 2,
      },
      { op: 'engage', cards: 'mounts' },
      {
        op: 'select',
        as: 'target',
        from: enemyLeaderOrFollower,
        filter: { kind: ['follower', 'leader'] },
        count: 1,
        target: true,
      },
      { op: 'damage', to: 'target', amount: 2 },
    ],
  },
]);
