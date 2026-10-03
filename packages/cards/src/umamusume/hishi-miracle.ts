import { defineCard, EVOLVE_1, FEED_1, printed } from '../define';

export const hishiMiracleText = printed(
  EVOLVE_1,
  FEED_1,
  '[Fanfare] Bury the top 2 cards of your deck. If their base costs are the same, draw a card.',
);

export const hishiMiracle = defineCard({
  name: 'Hishi Miracle',
  text: hishiMiracleText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        { op: 'buryTop', n: 2 },
        { op: 'draw', n: 1 },
      ],
    },
  ],
});

export const hishiMiracleEvolvedText = printed('At the start of your end phase, draw a card.');

export const hishiMiracleEvolved = defineCard({
  name: 'Hishi Miracle',
  text: hishiMiracleEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'end',
      on: { at: 'startOfEndPhase', whose: 'yours' },
      effect: [{ op: 'draw', n: 1 }],
    },
  ],
});
