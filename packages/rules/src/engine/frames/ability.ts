import type { Intent } from '../../actions/intents';
import type { CardDefId, CardId, Seat } from '../../model/ids';
import type { Prompt } from '../../state/state';
import type { ResolveAbilityFrame } from '../../state/work';
import { REJECTED, type AnswerResult, type PromptRequest } from '../steps/step';
import { popWork, pushWork, updateWork } from '../stack';
import type { Transcript } from '../transcript';
import { confirmationTiming } from '../confirmation';
import { runInstructions } from '../../abilities/interpreter';

export function pushResolveAbility(
  t: Transcript,
  args: {
    readonly seat: Seat;
    readonly source: CardId;
    readonly sourceDef: CardDefId;
    readonly abilityKey: string;
    readonly pendingId?: number | null;
  },
): void {
  pushWork(t, {
    kind: 'resolveAbility',
    seat: args.seat,
    source: args.source,
    sourceDef: args.sourceDef,
    abilityKey: args.abilityKey,
    pc: 0,
    vars: {},
    pendingId: args.pendingId ?? null,
    queue: null,
  });
}

export function tickResolveAbility(
  t: Transcript,
  frame: ResolveAbilityFrame,
): PromptRequest | null {
  const script = t.state.scripts[frame.sourceDef];
  const ability = script?.abilities.find((entry) => entry.key === frame.abilityKey);
  const effect = ability && 'effect' in ability ? ability.effect : [];
  const result = runInstructions(t, frame, effect);
  if (result.kind === 'prompt') return result.prompt;
  if (result.kind === 'continue') {
    updateWork(t, result.frame);
    return null;
  }
  popWork(t);
  const parent = t.state.work[t.state.work.length - 1];
  if (
    !parent ||
    (parent.kind !== 'playCard' && parent.kind !== 'confirmation' && parent.kind !== 'attack')
  ) {
    confirmationTiming(t);
  }
  return null;
}

export function answerResolveAbility(
  t: Transcript,
  frame: ResolveAbilityFrame,
  prompt: Prompt,
  intent: Intent,
): AnswerResult {
  const script = t.state.scripts[frame.sourceDef];
  const ability = script?.abilities.find((entry) => entry.key === frame.abilityKey);
  const effect = ability && 'effect' in ability ? ability.effect : [];
  return runInstructions.answer(t, frame, effect, prompt, intent);
}

void REJECTED;
