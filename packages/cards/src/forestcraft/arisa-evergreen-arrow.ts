import { scriptOf } from '../define';

export const arisaEvergreenArrow = scriptOf('arisa-evergreen-arrow', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Put a Gale Arrow into your EX area',
            effect: [{ op: 'token', name: 'Gale Arrow', n: 1, to: 'ex' }],
          },
          {
            label: 'Put a Storm Arrow into your EX area',
            effect: [{ op: 'token', name: 'Storm Arrow', n: 1, to: 'ex' }],
          },
        ],
      },
    ],
  },
  {
    kind: 'activated',
    key: 'bow',
    label: "Summon Forest Guardian's Bow",
    cost: { engage: true },
    condition: { atLeast: 5, value: { tally: 'cardsPlayed' } },
    effect: [
      {
        op: 'search',
        as: 'bow',
        filter: { name: "Forest Guardian's Bow" },
        count: 1,
        reveal: false,
        then: 'field',
      },
    ],
  },
]);
