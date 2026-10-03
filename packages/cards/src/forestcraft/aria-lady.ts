import { defineCard, EVOLVE_1, printed } from '../define';

export const ariaLadyText = printed(EVOLVE_1, '[Fanfare] Put 2 Fairy tokens into your EX area.');

export const ariaLady = defineCard({
  name: 'Aria, Lady of the Woods',
  text: ariaLadyText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [{ op: 'token', name: 'Fairy', n: 2, to: 'ex' }],
    },
  ],
});

export const ariaLadyEvolvedText = printed(
  'On Evolve - Summon a Fairy token.',
  'On Super Evolve - Give each Pixie token follower on your field and in your EX area +1/+1.',
);

export const ariaLadyEvolved = defineCard({
  name: 'Aria, Lady of the Woods',
  text: ariaLadyEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [{ op: 'token', name: 'Fairy', n: 1, to: 'field' }],
    },
    {
      kind: 'triggered',
      key: 'onSuperEvolve',
      on: 'onSuperEvolve',
      effect: [
        {
          op: 'buff',
          cards: { each: { zone: 'field', who: 'you' }, filter: { pixie: true, token: true } },
          attack: 1,
          defense: 1,
        },
        {
          op: 'buff',
          cards: { each: { zone: 'ex', who: 'you' }, filter: { pixie: true, token: true } },
          attack: 1,
          defense: 1,
        },
      ],
    },
  ],
});
