import { applyEvent, stateFromCreation } from '../events/apply';
import type { EngineEvent } from '../events/events';
import type { RngState } from '../rng';
import type { MatchState } from '../state/state';
import { scanTriggers } from '../abilities/triggers';

type MatchCreated = Extract<EngineEvent, { type: 'matchCreated' }>;

/**
 * A scratch pad for one reducer call. Every change to the match goes through `emit`, which
 * both records the event and folds it into the working state, so the log and the state can
 * never disagree. The input state is never mutated; discarding the transcript is a rewind.
 */
export class Transcript {
  private current: MatchState;
  private readonly recorded: EngineEvent[];

  constructor(state: MatchState, recorded: readonly EngineEvent[] = []) {
    this.current = state;
    this.recorded = [...recorded];
  }

  /** Begin a brand-new match. The creation event is the first entry of its log. */
  static begin(created: MatchCreated): Transcript {
    return new Transcript(stateFromCreation(created), [created]);
  }

  get state(): MatchState {
    return this.current;
  }

  get events(): readonly EngineEvent[] {
    return this.recorded;
  }

  emit(...events: readonly EngineEvent[]): void {
    for (const event of events) {
      this.current = applyEvent(this.current, event);
      this.recorded.push(event);
      if (this.current.outcome) continue;
      scanTriggers(this, event);
    }
  }

  /**
   * Consume the match's seeded random stream. The stream advance is itself logged, so the
   * state remains a pure fold of the event log.
   */
  random<T>(draw: (rng: RngState) => [value: T, next: RngState]): T {
    const [value, next] = draw(this.current.rng);
    this.emit({ type: 'rngAdvanced', rng: next });
    return value;
  }
}
