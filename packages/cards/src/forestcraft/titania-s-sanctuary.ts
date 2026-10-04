import { pixieToken } from '../shared';
import { scriptOf } from '../define';

export const titaniaSSanctuary = scriptOf(
  'titania-s-sanctuary',
  [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        {
          op: 'buff',
          cards: { each: { zone: 'field', who: 'you' }, filter: pixieToken },
          attack: 1,
          defense: 1,
        },
      ],
    },
    {
      kind: 'static',
      key: 'assail',
      validIn: ['field'],
      grant: { filter: pixieToken, keywords: ['assail'] },
    },
    {
      kind: 'triggered',
      key: 'enter',
      on: { tokenEntersYourField: pixieToken },
      effect: [{ op: 'buff', cards: 'entered', attack: 1, defense: 1 }],
    },
  ],
  { allPrintings: true },
);
