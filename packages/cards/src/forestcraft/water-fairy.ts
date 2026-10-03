import { defineCard, EVOLVE_1, printed } from '../define';

export const waterFairyText = printed(EVOLVE_1, '[Fanfare] Put a Fairy token into your EX area.');

export const waterFairy = defineCard({
  name: 'Water Fairy',
  text: waterFairyText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [{ op: 'token', name: 'Fairy', n: 1, to: 'ex' }],
    },
  ],
});
