import { defineCard, EVOLVE_1, FEED_1, printed } from '../define';

export const daiwaScarletText = printed(
  EVOLVE_1,
  FEED_1,
  '[Fanfare] Search your deck for an Umamusume spell, reveal it, and add it to your hand.',
  'While this card is on your field, the 1st Umamusume spell you play each turn costs 1 less to play.',
  "When you play a spell, if it's your 3rd this turn, select an Umamusume follower on your field. Give it and this follower Storm.",
);

export const daiwaScarlet = defineCard({
  name: 'Daiwa Scarlet',
  text: daiwaScarletText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        {
          op: 'search',
          as: 'found',
          filter: { kind: ['spell'], universe: 'Umamusume' },
          count: 1,
          reveal: true,
          then: 'hand',
        },
      ],
    },
    {
      kind: 'static',
      key: 'firstSpell',
      validIn: ['field'],
      costDelta: { filter: { kind: ['spell'], universe: 'Umamusume' }, amount: -1, nthSpell: 1 },
    },
    {
      kind: 'triggered',
      key: 'thirdSpell',
      on: { youPlaySpell: { nth: 3 } },
      effect: [
        {
          op: 'select',
          as: 'ally',
          from: [{ zone: 'field', who: 'you' }],
          filter: { kind: ['follower'], universe: 'Umamusume', other: true },
          count: { upTo: 1 },
        },
        { op: 'grant', cards: 'self', keywords: ['storm'] },
        { op: 'grant', cards: 'ally', keywords: ['storm'] },
      ],
    },
  ],
});

export const daiwaScarletEvolvedText = printed(
  'On Evolve - Search your deck for an Umamusume spell, reveal it, and add it to your hand.',
);

export const daiwaScarletEvolved = defineCard({
  name: 'Daiwa Scarlet',
  text: daiwaScarletEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [
        {
          op: 'search',
          as: 'found',
          filter: { kind: ['spell'], universe: 'Umamusume' },
          count: 1,
          reveal: true,
          then: 'hand',
        },
      ],
    },
  ],
});
