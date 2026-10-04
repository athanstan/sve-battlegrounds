import { scriptOf } from '../define';

export const outlawGunner = scriptOf('outlaw-gunner', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'token', name: 'Bullet Bike', n: 1, to: 'field' }],
  },
  {
    kind: 'triggered',
    key: 'lastWords',
    on: 'lastWords',
    effect: [{ op: 'damage', to: 'enemyLeader', amount: 2 }],
  },
]);
