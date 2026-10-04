import { pixieFollower } from '../shared';
import { scriptOf } from '../define';

export const amatazFairyBlader = scriptOf(
  'amataz-fairy-blader',
  [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        { op: 'token', name: 'Fairy', n: 1, to: 'ex' },
        {
          op: 'buff',
          cards: { each: { zone: 'ex', who: 'you' }, filter: pixieFollower },
          attack: 1,
          defense: 1,
        },
      ],
    },
    {
      kind: 'activated',
      key: 'act',
      cost: { engage: true },
      label: 'Give Storm to cheap Pixies',
      effect: [
        {
          op: 'select',
          as: 'pixies',
          from: [{ zone: 'field', who: 'you' }],
          filter: { ...pixieFollower, costAtMost: 1 },
          count: { upTo: 2 },
        },
        { op: 'grant', cards: 'pixies', keywords: ['storm'] },
      ],
    },
  ],
  { allPrintings: true },
);
