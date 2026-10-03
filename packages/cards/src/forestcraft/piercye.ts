import { defineCard, EVOLVE_1, printed } from '../define';

export const piercyeText = printed(EVOLVE_1, '[Fanfare] Evolve this follower.');

export const piercye = defineCard({
  name: 'Piercye, Queen of Frost',
  text: piercyeText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [{ op: 'evolveSelf' }],
    },
  ],
});

export const piercyeEvolvedText = printed(
  'Aura.',
  'Whenever a follower on your field evolves, deal 2 damage to each enemy follower and 1 damage to the enemy leader.',
);

export const piercyeEvolved = defineCard({
  name: 'Piercye, Queen of Frost',
  text: piercyeEvolvedText,
  abilities: [
    {
      kind: 'static',
      key: 'aura',
      validIn: ['field'],
      grant: { filter: { name: 'Piercye, Queen of Frost' }, keywords: ['aura'] },
    },
    {
      kind: 'triggered',
      key: 'onAnyEvolve',
      on: { followerOnYourFieldEvolves: true },
      effect: [
        {
          op: 'damage',
          to: { each: { zone: 'field', who: 'opponent' }, filter: { kind: ['follower'] } },
          amount: 2,
        },
        { op: 'damage', to: 'enemyLeader', amount: 1 },
      ],
    },
  ],
});
