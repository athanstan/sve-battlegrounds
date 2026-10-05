import { scriptOf } from '../define';

const followers = {
  each: { zone: 'field' as const, who: 'you' as const },
  filter: { kind: ['follower'] as const },
};

export const anastasia = scriptOf('anastasia', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'recoverPlayPoints', n: 2 }],
  },
  {
    kind: 'triggered',
    key: 'pace',
    on: { whenever: { type: 'played' } },
    condition: { yourTurn: true },
    effect: [
      {
        op: 'if',
        cond: { equal: [{ tally: 'cardsPlayed' }, 3] },
        then: [{ op: 'recoverPlayPoints', n: 2 }],
      },
      {
        op: 'if',
        cond: { equal: [{ tally: 'cardsPlayed' }, 5] },
        then: [{ op: 'buff', cards: followers, attack: 1, defense: 1 }],
      },
    ],
  },
]);
