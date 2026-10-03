import { defineCard, EVOLVE_1, printed } from '../define';

export const feyboltArcherText = printed(
  EVOLVE_1,
  '[Fanfare] Summon a Fairy token. Look at the top 3 cards of your deck. You may reveal a Pixie card from among them and add it to your hand. Put the rest on the bottom of your deck in any order.',
);

export const feyboltArcher = defineCard({
  name: 'Feybolt Archer',
  text: feyboltArcherText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        { op: 'token', name: 'Fairy', n: 1, to: 'field' },
        {
          op: 'lookTop',
          n: 3,
          pick: { filter: { pixie: true }, upTo: 1, reveal: true, then: 'hand' },
          rest: 'bottom',
        },
      ],
    },
  ],
});

export const feyboltArcherEvolvedText = printed('On Evolve - Summon a Fairy token.');

export const feyboltArcherEvolved = defineCard({
  name: 'Feybolt Archer',
  text: feyboltArcherEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [{ op: 'token', name: 'Fairy', n: 1, to: 'field' }],
    },
  ],
});
