import { pixieFollower } from '../shared';
import { scriptOf } from '../define';

export const treeOfWonders = scriptOf('tree-of-wonders', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'token', name: 'Fairy', n: 1, to: 'ex' }],
  },
  {
    kind: 'activated',
    key: 'act',
    cost: { list: [{ engage: true }, { burySelf: true }] },
    condition: {
      atLeast: 3,
      value: { count: { zone: 'ex', who: 'you' }, filter: pixieFollower },
    },
    label: 'Draw 2 cards',
    effect: [{ op: 'draw', n: 2 }],
  },
]);
