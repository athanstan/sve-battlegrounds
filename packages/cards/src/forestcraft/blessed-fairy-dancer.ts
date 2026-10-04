import { pixieFollower } from '../shared';
import { scriptOf } from '../define';

export const blessedFairyDancer = scriptOf('blessed-fairy-dancer', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'buff',
        cards: { each: { zone: 'field', who: 'you' }, filter: { ...pixieFollower, other: true } },
        attack: 1,
        defense: 1,
      },
      {
        op: 'buff',
        cards: { each: { zone: 'ex', who: 'you' }, filter: pixieFollower },
        attack: 1,
        defense: 1,
      },
    ],
  },
]);
