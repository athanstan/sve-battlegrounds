import type { Intent } from '../actions/intents';
import type { Instr } from './spec';
import type { Prompt } from '../state/state';
import type { ResolveAbilityFrame } from '../state/work';
import { REJECTED, type AnswerResult, type PromptRequest } from '../engine/steps/step';
import type { Transcript } from '../engine/transcript';
import { popWork, updateWork } from '../engine/stack';
import { runOp } from './ops';

export type RunResult =
  | { readonly kind: 'done' }
  | { readonly kind: 'prompt'; readonly prompt: PromptRequest }
  | { readonly kind: 'continue'; readonly frame: ResolveAbilityFrame };

function effectList(frame: ResolveAbilityFrame, effect: readonly Instr[]): readonly Instr[] {
  return frame.queue ?? effect;
}

export function runInstructions(
  t: Transcript,
  frame: ResolveAbilityFrame,
  effect: readonly Instr[],
): RunResult {
  let current = frame;
  for (;;) {
    const list = effectList(current, effect);
    if (current.pc >= list.length) return { kind: 'done' };
    const instr = list[current.pc];
    if (!instr) return { kind: 'done' };
    const stepped = runOp(t, current, instr, effect);
    if (stepped.kind === 'prompt') return stepped;
    if (stepped.kind === 'wait') {
      updateWork(t, stepped.frame);
      return { kind: 'continue', frame: stepped.frame };
    }
    current =
      stepped.advance === false ? stepped.frame : { ...stepped.frame, pc: stepped.frame.pc + 1 };
    updateWork(t, current);
    if (t.state.outcome) return { kind: 'done' };
  }
}

runInstructions.answer = (
  t: Transcript,
  frame: ResolveAbilityFrame,
  effect: readonly Instr[],
  prompt: Prompt,
  intent: Intent,
): AnswerResult => {
  const list = effectList(frame, effect);
  const instr = list[frame.pc];
  if (!instr) return REJECTED;
  const answered = runOp.answer(t, frame, instr, prompt, intent, effect);
  if (!answered.accepted) return REJECTED;
  const next =
    answered.advance === false ? answered.frame : { ...answered.frame, pc: answered.frame.pc + 1 };
  updateWork(t, next);
  return { accepted: true, followUp: null };
};

export { popWork };
