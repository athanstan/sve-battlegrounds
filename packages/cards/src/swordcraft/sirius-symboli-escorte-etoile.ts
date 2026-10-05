import { scriptOf } from '../define';

const umaOnField = {
  count: { zone: 'field' as const, who: 'you' as const },
  filter: { universe: 'Umamusume' },
};

export const siriusSymboliEscorteEtoile = scriptOf('sirius-symboli-escorte-etoile', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: { atLeast: 3, value: umaOnField },
        then: [
          { op: 'buff', cards: 'self', attack: 0, defense: 1 },
          {
            op: 'grantAbility',
            cards: 'self',
            ability: {
              kind: 'triggered',
              key: 'strikeDraw',
              on: 'strike',
              effect: [
                { op: 'draw', n: 1 },
                { op: 'discard', who: 'you', n: 1 },
              ],
            },
          },
        ],
      },
    ],
  },
]);
