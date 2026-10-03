import type { GameOverReason, Outcome, Seat } from '@sve/rules';

const REASONS: Readonly<Record<GameOverReason, string>> = {
  leaderDefeated: 'Leader defeated',
  deckOut: 'Ran out of cards',
  concession: 'Conceded',
  effect: 'An effect ended the game',
  perpetualCycle: 'The game looped without end',
};

export interface OutcomeText {
  readonly headline: string;
  readonly reason: string;
  /** How the result reads to the viewer: good news, bad news, or neither. */
  readonly tone: 'win' | 'loss' | 'neutral';
}

/** The result of a match, from one viewer's side. `viewer` is null for a spectator. */
export function describeOutcome(
  outcome: Outcome,
  viewer: Seat | null,
  names: Readonly<Record<Seat, string>>,
): OutcomeText {
  const reason = REASONS[outcome.reason];
  if (outcome.winner === null) return { headline: 'Draw', reason, tone: 'neutral' };
  if (viewer === null)
    return { headline: `${names[outcome.winner]} wins`, reason, tone: 'neutral' };
  return outcome.winner === viewer
    ? { headline: 'Victory', reason, tone: 'win' }
    : { headline: 'Defeat', reason, tone: 'loss' };
}
