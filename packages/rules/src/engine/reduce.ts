import type { Action, RejectionReason } from '../actions/intents';
import type { EngineEvent } from '../events/events';
import { opponentOf } from '../model/ids';
import type { MatchState } from '../state/state';
import { advance, openPrompt, settle } from './run';
import { stepFor } from './steps';
import { Transcript } from './transcript';
import { answerWork } from './work';

export type ReduceResult =
  | { readonly ok: true; readonly state: MatchState; readonly events: readonly EngineEvent[] }
  /** Illegal intents change nothing: `state` is the exact input state and no events are produced. */
  | {
      readonly ok: false;
      readonly reason: RejectionReason;
      readonly state: MatchState;
      readonly events: readonly [];
    };

const reject = (state: MatchState, reason: RejectionReason): ReduceResult => ({
  ok: false,
  reason,
  state,
  events: [],
});

const commit = (t: Transcript): ReduceResult => ({ ok: true, state: t.state, events: t.events });

/**
 * The pure reducer: `(state, action) => { state, events }`.
 *
 * Deterministic and free of I/O: no clock, no ambient randomness (the only randomness is the
 * seeded stream inside the state). Illegal intents are rejected before any mutation: the
 * returned state is the input state, which is the "rewind" of 10.6.2.
 */
export function reduce(state: MatchState, action: Action): ReduceResult {
  if (state.outcome) return reject(state, 'gameOver');

  const t = new Transcript(state);

  // Conceding is always legal, never prompted, and skips Confirmation Timing (1.2.3).
  if (action.intent.type === 'concede') {
    t.emit({
      type: 'gameEnded',
      outcome: { winner: opponentOf(action.seat), reason: 'concession' },
    });
    return commit(t);
  }

  const { prompt } = state;
  if (prompt === null) return reject(state, 'noPromptOpen');
  if (prompt.seat !== action.seat) return reject(state, 'notYourPrompt');
  if (!('promptId' in action.intent) || action.intent.promptId !== prompt.id) {
    return reject(state, 'stalePrompt');
  }

  t.emit({ type: 'promptClosed', promptId: prompt.id });

  const result =
    t.state.work.length > 0
      ? answerWork(t, prompt, action.intent)
      : (stepFor(state.step).answer?.(t, prompt, action.intent) ?? { accepted: false as const });

  if (!result.accepted) return reject(state, 'invalidAnswer');

  if (!t.state.outcome) {
    if (result.followUp) {
      openPrompt(t, result.followUp);
    } else if (result.stay) {
      settle(t);
    } else if (t.state.work.length > 0) {
      settle(t);
    } else {
      advance(t, stepFor(state.step));
      settle(t);
    }
  }
  return commit(t);
}
