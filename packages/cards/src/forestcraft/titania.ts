import { defineCard, EVOLVE_1, printed } from '../define';

export const titaniaText = printed(
  EVOLVE_1,
  'Whenever a Pixie token is put onto your field, give it +1/+0.',
);

export const titania = defineCard({
  name: 'Titania, Queen of Fairies',
  text: titaniaText,
  abilities: [
    {
      kind: 'triggered',
      key: 'pixie',
      on: { tokenEntersYourField: { pixie: true } },
      effect: [
        {
          op: 'buff',
          cards: { each: { zone: 'field', who: 'you' }, filter: { pixie: true, token: true } },
          attack: 1,
          defense: 0,
        },
      ],
    },
  ],
});

export const titaniaEvolvedText = printed(
  'Whenever a Pixie token is put onto your field, give it +1/+1.',
);

export const titaniaEvolved = defineCard({
  name: 'Titania, Queen of Fairies',
  text: titaniaEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'pixie',
      on: { tokenEntersYourField: { pixie: true } },
      effect: [
        {
          op: 'buff',
          cards: { each: { zone: 'field', who: 'you' }, filter: { pixie: true, token: true } },
          attack: 1,
          defense: 1,
        },
      ],
    },
  ],
});
