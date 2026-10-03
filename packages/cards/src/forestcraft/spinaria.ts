import { defineCard, EVOLVE_1, printed } from '../define';

export const spinariaText = printed(
  EVOLVE_1,
  '[Fanfare] Select a card in your cemetery and put it into your EX area. It costs 2 less to play this turn.',
);

export const spinaria = defineCard({
  name: 'Spinaria, Keeper of Secrets',
  text: spinariaText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        {
          op: 'select',
          as: 'picked',
          from: [{ zone: 'cemetery', who: 'you' }],
          count: { upTo: 1 },
        },
        { op: 'move', cards: 'picked', to: 'ex', costDeltaThisTurn: -2 },
      ],
    },
  ],
});

export const spinariaEvolvedText = printed(
  'Last Words - Select a card in your cemetery and put it into your EX area. It costs 2 less to play this turn.',
);

export const spinariaEvolved = defineCard({
  name: 'Spinaria, Keeper of Secrets',
  text: spinariaEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'lastWords',
      on: 'lastWords',
      effect: [
        {
          op: 'select',
          as: 'picked',
          from: [{ zone: 'cemetery', who: 'you' }],
          count: { upTo: 1 },
        },
        { op: 'move', cards: 'picked', to: 'ex', costDeltaThisTurn: -2 },
      ],
    },
  ],
});
