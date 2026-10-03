import { defineCard, EVOLVE_1, printed } from '../define';

export const ccText = printed(
  EVOLVE_1,
  '[Fanfare] Deal 3 damage divided as you choose to enemy followers on the field.',
);

export const cc = defineCard({
  name: 'C.C.',
  text: ccText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        {
          op: 'damage',
          to: { each: { zone: 'field', who: 'opponent' }, filter: { kind: ['follower'] } },
          amount: 3,
          divided: true,
        },
      ],
    },
  ],
});

export const ccEvolvedText = printed(
  'On Evolve - Deal 3 damage divided as you choose to enemy followers on the field.',
);

export const ccEvolved = defineCard({
  name: 'C.C.',
  text: ccEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [
        {
          op: 'damage',
          to: { each: { zone: 'field', who: 'opponent' }, filter: { kind: ['follower'] } },
          amount: 3,
          divided: true,
        },
      ],
    },
  ],
});
