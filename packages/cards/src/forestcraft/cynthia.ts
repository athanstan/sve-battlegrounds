import { defineCard, EVOLVE_1, printed } from '../define';

export const cynthiaText = printed(EVOLVE_1, 'Each Pixie follower on your field has Storm.');

export const cynthia = defineCard({
  name: "Cynthia, the Queen's Blade",
  text: cynthiaText,
  abilities: [
    {
      kind: 'static',
      key: 'pixieStorm',
      validIn: ['field'],
      grant: { filter: { pixie: true }, keywords: ['storm'] },
    },
  ],
});

export const cynthiaEvolvedText = printed(
  'Each Pixie follower on your field has Storm.',
  'On Evolve - Summon 2 Fairy tokens.',
);

export const cynthiaEvolved = defineCard({
  name: "Cynthia, the Queen's Blade",
  text: cynthiaEvolvedText,
  abilities: [
    {
      kind: 'static',
      key: 'pixieStorm',
      validIn: ['field'],
      grant: { filter: { pixie: true }, keywords: ['storm'] },
    },
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [{ op: 'token', name: 'Fairy', n: 2, to: 'field' }],
    },
  ],
});
