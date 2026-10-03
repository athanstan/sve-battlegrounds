import { defineCard, EVOLVE_1, FEED_1, printed } from '../define';

const tenUma = {
  atLeast: 10,
  value: {
    count: { zone: 'cemetery' as const, who: 'you' as const },
    filter: { universe: 'Umamusume' },
  },
};

export const chevalGrandText = printed(
  EVOLVE_1,
  FEED_1,
  '[Fanfare] Select a face-up Carrot and, if there are at least 10 Umamusume cards in your cemetery, turn it face-down.',
);

export const chevalGrand = defineCard({
  name: 'Cheval Grand',
  text: chevalGrandText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [
        {
          op: 'if',
          cond: tenUma,
          then: [{ op: 'turnCarrots', faceUp: false, upTo: 1 }],
        },
      ],
    },
  ],
});

export const chevalGrandEvolvedText = printed(
  'On Evolve - Select an enemy follower on the field and deal it 2 damage. If there are at least 10 Umamusume cards in your cemetery, deal 4 damage instead.',
  'Twice on each of your turns, when an enemy follower that took damage this turn from an Umamusume card you control is put from the field into the cemetery, draw a card, then discard a card.',
);

export const chevalGrandEvolved = defineCard({
  name: 'Cheval Grand',
  text: chevalGrandEvolvedText,
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
        {
          op: 'if',
          cond: tenUma,
          then: [{ op: 'damage', to: 'target', amount: 4 }],
          else: [{ op: 'damage', to: 'target', amount: 2 }],
        },
      ],
    },
    {
      kind: 'triggered',
      key: 'twice',
      on: { enemyDamagedByYouLeavesField: { kind: ['follower'] } },
      perTurn: 2,
      effect: [
        { op: 'draw', n: 1 },
        { op: 'discard', who: 'you', n: 1 },
      ],
    },
  ],
});
