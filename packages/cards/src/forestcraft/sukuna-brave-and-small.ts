import { scriptOf } from '../define';

export const sukunaBraveAndSmall = scriptOf('sukuna-brave-and-small', []);

export const sukunaBraveAndSmallEvolved = scriptOf(
  'sukuna-brave-and-small@evolved',
  [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [
        {
          op: 'if',
          cond: { combo: 5 },
          then: [{ op: 'buff', cards: 'self', attack: 3, defense: 3 }],
          else: [
            {
              op: 'if',
              cond: { combo: 3 },
              then: [{ op: 'buff', cards: 'self', attack: 1, defense: 1 }],
            },
          ],
        },
      ],
    },
  ],
  { allPrintings: true },
);
