import { umaGrave } from '../shared';
import { scriptOf } from '../define';

const otherUma = {
  count: { zone: 'field' as const, who: 'you' as const },
  filter: { universe: 'Umamusume', other: true as const },
};

export const mayanoTopGun = scriptOf('mayano-top-gun', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: { atLeast: 4, value: otherUma },
        then: [{ op: 'grant', cards: 'self', keywords: ['storm'] }],
      },
      {
        op: 'if',
        cond: umaGrave(5),
        then: [{ op: 'buff', cards: 'self', attack: 2, defense: 0 }],
      },
    ],
  },
]);
