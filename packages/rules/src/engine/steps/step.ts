import type { Intent } from '../../actions/intents';
import type { MatchState, Prompt, StepId } from '../../state/state';
import type { Transcript } from '../transcript';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A prompt before the runner assigns it an id. */
export type PromptRequest = DistributiveOmit<Prompt, 'id'>;

export type PromptOf<Kind extends Prompt['kind']> = Extract<Prompt, { kind: Kind }>;

export type AnswerResult =
  /** The intent is not a legal answer to this prompt. The runner discards the transcript. */
  | { readonly accepted: false }
  /**
   * The answer was applied. `followUp` re-prompts (e.g. discard again); `stay` keeps the current
   * step so `settle` can drain work and then re-run it (7.3.4). Otherwise the step is done.
   */
  | { readonly accepted: true; readonly followUp: PromptRequest | null; readonly stay?: true };

export const REJECTED: AnswerResult = { accepted: false };
export const accepted = (followUp: PromptRequest | null = null): AnswerResult => ({
  accepted: true,
  followUp,
});
export const stayed = (): AnswerResult => ({ accepted: true, followUp: null, stay: true });

/**
 * One position in the match script. The match only ever waits while a prompt is open:
 * a step that has nothing to ask simply completes and the runner moves on.
 */
export interface Step {
  readonly id: StepId;

  /** Do the step's automatic work. Return a prompt only if the rules need an answer. */
  run(t: Transcript): PromptRequest | null;

  /**
   * Interpret `intent` as the answer to the prompt this step opened. The runner has already
   * checked seat and prompt id and has closed the prompt; returning `REJECTED` rewinds the
   * whole call, so a step may emit as it goes. Steps that never prompt omit this.
   */
  answer?(t: Transcript, prompt: Prompt, intent: Intent): AnswerResult;

  /** The step that follows once this one is done. */
  next(state: MatchState): StepId;
}
