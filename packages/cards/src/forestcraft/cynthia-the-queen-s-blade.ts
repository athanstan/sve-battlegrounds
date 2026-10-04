import { pixieToken } from '../shared';
import { scriptOf } from '../define';

export const cynthiaTheQueensBlade = scriptOf(
  'cynthia-the-queen-s-blade',
  [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        { op: 'token', name: 'Fairy Wisp', n: 1, to: 'ex' },
        {
          op: 'buff',
          cards: { each: { zone: 'field', who: 'you' }, filter: pixieToken },
          attack: 2,
          defense: 0,
        },
      ],
    },
    {
      kind: 'static',
      key: 'keywords',
      validIn: ['field'],
      grant: { filter: pixieToken, keywords: ['storm', 'assail'] },
    },
    {
      kind: 'triggered',
      key: 'enter',
      on: { tokenEntersYourField: pixieToken },
      effect: [{ op: 'buff', cards: 'entered', attack: 2, defense: 0 }],
    },
  ],
  { allPrintings: true },
);
