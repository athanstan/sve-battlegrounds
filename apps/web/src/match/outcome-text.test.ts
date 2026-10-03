import { describe, expect, it } from 'vitest';
import { describeOutcome } from './outcome-text';

const names = { 0: 'Alice', 1: 'Bob' } as const;

describe('describeOutcome', () => {
  it('reads as victory or defeat to a player', () => {
    const outcome = { winner: 0, reason: 'leaderDefeated' } as const;
    expect(describeOutcome(outcome, 0, names)).toEqual({
      headline: 'Victory',
      reason: 'Leader defeated',
      tone: 'win',
    });
    expect(describeOutcome(outcome, 1, names)).toEqual({
      headline: 'Defeat',
      reason: 'Leader defeated',
      tone: 'loss',
    });
  });

  it('names the winner to a spectator', () => {
    expect(describeOutcome({ winner: 1, reason: 'concession' }, null, names)).toEqual({
      headline: 'Bob wins',
      reason: 'Conceded',
      tone: 'neutral',
    });
  });

  it('calls a draw a draw', () => {
    expect(describeOutcome({ winner: null, reason: 'deckOut' }, 0, names).headline).toBe('Draw');
  });
});
