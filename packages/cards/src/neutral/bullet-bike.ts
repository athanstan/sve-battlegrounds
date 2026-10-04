import { scriptOf } from '../define';
import { wasteland } from '../shared';

export const bulletBike = scriptOf('bullet-bike@token', [
  {
    kind: 'activated',
    key: 'act',
    cost: { burySelf: true },
    label: 'Bury: give Rush (and +1 to Wasteland)',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'you' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      { op: 'grant', cards: 'target', keywords: ['rush'] },
      {
        op: 'if',
        cond: { matches: 'target', filter: wasteland },
        then: [{ op: 'buff', cards: 'target', attack: 1, defense: 0 }],
      },
    ],
  },
]);
