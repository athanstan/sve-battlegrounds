import { defineCard, EVOLVE_1, printed } from '../define';

export const ariaFairyPrincessText = printed(
  EVOLVE_1,
  'Ward. Each other Pixie follower on your field has Rush.',
  '[Fanfare] Put up to 9 Fairy tokens onto your field and/or into your EX area.',
);

export const ariaFairyPrincess = defineCard({
  name: 'Aria, Fairy Princess',
  text: ariaFairyPrincessText,
  abilities: [
    {
      kind: 'static',
      key: 'pixieRush',
      validIn: ['field'],
      grant: { filter: { pixie: true, other: true }, keywords: ['rush'] },
    },
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        {
          op: 'chooseOne',
          options: [
            {
              label: 'Fairies to the field',
              effect: [{ op: 'token', name: 'Fairy', n: 9, to: 'field' }],
            },
            {
              label: 'Fairies to EX',
              effect: [{ op: 'token', name: 'Fairy', n: 9, to: 'ex' }],
            },
          ],
        },
      ],
    },
  ],
});

export const ariaFairyPrincessEvolvedText = printed(
  'Ward. Each other Pixie follower on your field has Rush.',
  'On Evolve - Search your cemetery for a Pixie follower and put it onto your field.',
);

export const ariaFairyPrincessEvolved = defineCard({
  name: 'Aria, Fairy Princess',
  text: ariaFairyPrincessEvolvedText,
  abilities: [
    {
      kind: 'static',
      key: 'pixieRush',
      validIn: ['field'],
      grant: { filter: { pixie: true, other: true }, keywords: ['rush'] },
    },
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [
        {
          op: 'select',
          as: 'summon',
          from: [{ zone: 'cemetery', who: 'you' }],
          filter: { kind: ['follower'], pixie: true },
          count: { upTo: 1 },
        },
        { op: 'move', cards: 'summon', to: 'field' },
      ],
    },
  ],
});
