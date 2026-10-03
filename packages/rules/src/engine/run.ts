import { stepFor } from './steps';
import type { PromptRequest, Step } from './steps/step';
import type { Transcript } from './transcript';
import { tickWork } from './work';

/** Open a prompt. The runner owns ids so they are strictly monotonic across the match. */
export function openPrompt(t: Transcript, request: PromptRequest): void {
  t.emit({ type: 'promptOpened', prompt: { ...request, id: t.state.nextPromptId } });
}

/** Move the script to the step that follows `step`. */
export function advance(t: Transcript, step: Step): void {
  t.emit({ type: 'stepChanged', step: step.next(t.state) });
}

/**
 * Run the match forward until it needs an answer or ends. Nested work frames drain before the
 * current step runs, so a play, attack or trigger resolution finishes before the turn script
 * moves on.
 */
export function settle(t: Transcript): void {
  while (t.state.prompt === null && t.state.outcome === null) {
    if (t.state.work.length > 0) {
      const request = tickWork(t);
      if (t.state.outcome) return;
      if (request) {
        openPrompt(t, request);
        return;
      }
      continue;
    }
    const step = stepFor(t.state.step);
    const request = step.run(t);
    if (t.state.outcome) return;
    while (t.state.work.length > 0 && t.state.prompt === null && t.state.outcome === null) {
      const nested = tickWork(t);
      if (t.state.outcome) return;
      if (nested) {
        openPrompt(t, nested);
        return;
      }
    }
    if (t.state.prompt || t.state.outcome) return;
    if (request) {
      openPrompt(t, request);
      return;
    }
    advance(t, step);
  }
}
