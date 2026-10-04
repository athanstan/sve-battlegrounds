import { scriptOf } from '../define';
import { wasteland } from '../shared';

export const dutifulSteed = scriptOf('dutiful-steed@token', [
  {
    kind: 'activated',
    key: 'act',
    cost: { burySelf: true },
    label: 'Bury: +1/+1 to a Wasteland follower',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'you' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      {
        op: 'if',
        cond: { matches: 'target', filter: wasteland },
        then: [{ op: 'buff', cards: 'target', attack: 1, defense: 1 }],
      },
    ],
  },
]);
