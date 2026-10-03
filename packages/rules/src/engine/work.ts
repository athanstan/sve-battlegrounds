import { tickAttack, answerAttack } from './frames/attack';
import { tickPlayCard, answerPlayCard } from './frames/play';
import { tickQuickWindow, answerQuickWindow } from './frames/quick';
import { tickResolveAbility, answerResolveAbility } from './frames/ability';
import { tickConfirmation, answerConfirmation } from './confirmation';
import type { Intent } from '../actions/intents';
import type { Prompt } from '../state/state';
import { REJECTED, type AnswerResult, type PromptRequest } from './steps/step';
import type { WorkFrame } from '../state/work';
import type { Transcript } from './transcript';

export { pushWork, popWork, updateWork } from './stack';

const top = (t: Transcript): WorkFrame | undefined => t.state.work[t.state.work.length - 1];

export function tickWork(t: Transcript): PromptRequest | null {
  const frame = top(t);
  if (!frame) return null;
  switch (frame.kind) {
    case 'playCard':
      return tickPlayCard(t, frame);
    case 'resolveAbility':
      return tickResolveAbility(t, frame);
    case 'attack':
      return tickAttack(t, frame);
    case 'quickWindow':
      return tickQuickWindow(t, frame);
    case 'confirmation':
      return tickConfirmation(t);
  }
}

export function answerWork(t: Transcript, prompt: Prompt, intent: Intent): AnswerResult {
  const frame = top(t);
  if (!frame) return REJECTED;
  switch (frame.kind) {
    case 'playCard':
      return answerPlayCard(t, frame, prompt, intent);
    case 'resolveAbility':
      return answerResolveAbility(t, frame, prompt, intent);
    case 'attack':
      return answerAttack(t, frame, prompt, intent);
    case 'quickWindow':
      return answerQuickWindow(t, frame, prompt, intent);
    case 'confirmation':
      return answerConfirmation(t, prompt, intent);
  }
}
