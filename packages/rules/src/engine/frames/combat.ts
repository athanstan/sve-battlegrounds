import type { Intent } from '../../actions/intents';
import { opponentOf } from '../../model/ids';
import type { Prompt } from '../../state/state';
import type { AttackFrame, QuickWindowFrame } from '../../state/work';
import { REJECTED, type AnswerResult, type PromptRequest } from '../steps/step';
import { popWork, updateWork, pushWork } from '../stack';
import type { Transcript } from '../transcript';
import { confirmationTiming } from '../confirmation';
import { hasShownKeyword, refreshDerived } from '../derived';
import { legalQuickOptions } from '../options';

export function tickAttack(t: Transcript, frame: AttackFrame): PromptRequest | null {
  let current = frame;
  for (;;) {
    switch (current.stage) {
      case 'declare': {
        const attacker = t.state.seats[current.seat].field.find(
          (card) => card.id === current.attacker,
        );
        if (!attacker) {
          popWork(t);
          return null;
        }
        t.emit({
          type: 'wardsEngaged',
          seat: current.seat,
          cards: [current.attacker],
        });
        t.emit({
          type: 'attackDeclared',
          seat: current.seat,
          attacker: current.attacker,
          target: current.target,
        });
        current = { ...current, stage: 'quick' };
        updateWork(t, current);
        continue;
      }
      case 'quick': {
        const defender = opponentOf(current.seat);
        const options = legalQuickOptions(t.state, defender);
        if (options.length > 0) {
          pushWork(t, { kind: 'quickWindow', seat: defender, cause: 'attack' });
          current = { ...current, stage: 'damage' };
          updateWork(t, current);
          return null;
        }
        current = { ...current, stage: 'damage' };
        updateWork(t, current);
        continue;
      }
      case 'damage': {
        const attacker = t.state.seats[current.seat].field.find(
          (card) => card.id === current.attacker,
        );
        if (!attacker) {
          current = { ...current, stage: 'end' };
          updateWork(t, current);
          continue;
        }
        const atk = attacker.shown.attack;
        const enemy = opponentOf(current.seat);
        const drain = hasShownKeyword(t.state, current.attacker, 'drain');
        let drained = 0;
        if (current.target === 'leader') {
          if (atk > 0) {
            t.emit({
              type: 'damageDealt',
              source: current.attacker,
              target: 'leader',
              targetSeat: enemy,
              amount: atk,
              combat: true,
            });
            drained = atk;
          }
        } else {
          const defender = t.state.seats[enemy].field.find((card) => card.id === current.target);
          if (defender && atk > 0) {
            t.emit({
              type: 'damageDealt',
              source: current.attacker,
              target: current.target,
              targetSeat: enemy,
              amount: atk,
              combat: true,
            });
            drained = atk;
          }
          if (defender) {
            const ret = defender.shown.attack;
            if (ret > 0) {
              t.emit({
                type: 'damageDealt',
                source: current.target,
                target: current.attacker,
                targetSeat: current.seat,
                amount: ret,
                combat: true,
              });
            }
            t.emit({ type: 'fought', a: current.attacker, b: current.target });
          }
        }
        // 12.13.3: Drain does not stack; one instance recovers once from combat damage this follower deals.
        if (drain && drained > 0) {
          const leader = t.state.seats[current.seat].leader;
          t.emit({
            type: 'leaderDefenseChanged',
            seat: current.seat,
            defense: leader.defense + drained,
          });
        }
        refreshDerived(t);
        current = { ...current, stage: 'end' };
        updateWork(t, current);
        continue;
      }
      case 'end':
        t.emit({ type: 'attackEnded', seat: current.seat, attacker: current.attacker });
        popWork(t);
        confirmationTiming(t);
        return null;
    }
  }
}

export function answerAttack(
  _t: Transcript,
  _frame: AttackFrame,
  _prompt: Prompt,
  _intent: Intent,
): AnswerResult {
  return REJECTED;
}

export function tickQuickWindow(t: Transcript, frame: QuickWindowFrame): PromptRequest | null {
  const options = legalQuickOptions(t.state, frame.seat);
  if (options.length === 0) {
    popWork(t);
    return null;
  }
  return { kind: 'quickWindow', seat: frame.seat, options };
}

export function answerQuickWindow(
  t: Transcript,
  frame: QuickWindowFrame,
  prompt: Prompt,
  intent: Intent,
): AnswerResult {
  if (prompt.kind !== 'quickWindow') return REJECTED;
  if (intent.type === 'pass') {
    popWork(t);
    return { accepted: true, followUp: null };
  }
  if (intent.type === 'play') {
    const option = prompt.options.find(
      (entry) => entry.type === 'play' && entry.card === intent.card,
    );
    if (!option) return REJECTED;
    pushWork(t, {
      kind: 'playCard',
      seat: frame.seat,
      card: intent.card,
      from: option.type === 'play' ? option.from : 'hand',
      stage: 'specify',
      abilityKey: null,
      vars: {},
      chosenModes: [],
      paidWithEvolutionPoint: false,
    });
    return { accepted: true, followUp: null };
  }
  return REJECTED;
}
