import { mageGrave } from '../shared';
import { scriptOf } from '../define';

export const melviePrincessWitch = scriptOf('melvie-princess-witch', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: mageGrave(5),
        then: [{ op: 'buff', cards: 'self', attack: 4, defense: 0 }],
      },
      {
        op: 'if',
        cond: { spellchain: 5 },
        then: [{ op: 'buff', cards: 'self', attack: 0, defense: 4 }],
      },
    ],
  },
]);
