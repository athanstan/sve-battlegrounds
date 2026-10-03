import type { StepId } from '../../state/state';
import { discardStep, endQuickStep, cleanupStep, finishTurnStep, wardsStep } from './end';
import { firstMulliganStep, secondMulliganStep, startGameStep, turnOrderStep } from './setup';
import type { Step } from './step';
import { mainPhaseStep, startPhaseStep } from './turn';

const STEPS: Readonly<Record<Exclude<StepId, 'over'>, Step>> = {
  'setup/turnOrder': turnOrderStep,
  'setup/mulligan/first': firstMulliganStep,
  'setup/mulligan/second': secondMulliganStep,
  'setup/start': startGameStep,
  'turn/start': startPhaseStep,
  'turn/main': mainPhaseStep,
  'turn/end/wards': wardsStep,
  'turn/end/quick': endQuickStep,
  'turn/end/discard': discardStep,
  'turn/end/cleanup': cleanupStep,
  'turn/end/finish': finishTurnStep,
};

export function stepFor(id: StepId): Step {
  if (id === 'over') throw new Error('The match is over; there is no step to run');
  return STEPS[id];
}
