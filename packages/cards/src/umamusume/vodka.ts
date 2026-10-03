import { defineCard, EVOLVE_1, FEED_1, printed } from '../define';

export const vodkaText = printed(EVOLVE_1, FEED_1, 'When you play a spell, draw a card.');

export const vodka = defineCard({
  name: 'Vodka',
  text: vodkaText,
  abilities: [
    {
      kind: 'triggered',
      key: 'spell',
      on: { youPlaySpell: {} },
      effect: [{ op: 'draw', n: 1 }],
    },
  ],
});

export const vodkaEvolvedText = printed('When you play a spell, draw a card.');

export const vodkaEvolved = defineCard({
  name: 'Vodka',
  text: vodkaEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'spell',
      on: { youPlaySpell: {} },
      effect: [{ op: 'draw', n: 1 }],
    },
  ],
});
