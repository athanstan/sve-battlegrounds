import { defineCard, EVOLVE_1, printed } from '../define';

export const amatazText = printed(
  EVOLVE_1,
  '[Fanfare] Select an enemy follower on the field and destroy it. Deal 2 damage to its leader.',
);

export const amataz = defineCard({
  name: 'Amataz, Truehero',
  text: amatazText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        {
          op: 'select',
          as: 'target',
          from: [{ zone: 'field', who: 'opponent' }],
          filter: { kind: ['follower'] },
          count: 1,
          target: true,
        },
        { op: 'destroy', cards: 'target' },
        { op: 'damage', to: 'enemyLeader', amount: 2 },
      ],
    },
  ],
});

export const amatazEvolvedText = printed(
  'On Evolve - Select an enemy follower on the field and destroy it.',
);

export const amatazEvolved = defineCard({
  name: 'Amataz, Truehero',
  text: amatazEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [
        {
          op: 'select',
          as: 'target',
          from: [{ zone: 'field', who: 'opponent' }],
          filter: { kind: ['follower'] },
          count: { upTo: 1 },
        },
        { op: 'destroy', cards: 'target' },
      ],
    },
  ],
});
