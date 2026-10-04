import { umaGrave } from '../shared';
import { scriptOf } from '../define';

export const sevenMoreCentimeters = scriptOf('7-more-centimeters', [
  {
    kind: 'static',
    key: 'restriction',
    validIn: ['hand', 'ex'],
    playRestriction: umaGrave(20),
  },
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'destroy',
        cards: { each: { zone: 'field', who: 'opponent' }, filter: { kind: ['follower'] } },
      },
      { op: 'draw', n: 3 },
      { op: 'discard', who: 'opponent', n: 3 },
    ],
  },
]);
