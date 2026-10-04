import type { Intent } from '../../actions/intents';
import { definitionOf, type Prompt } from '../../state/state';
import type { PlayCardFrame } from '../../state/work';
import { REJECTED, type AnswerResult, type PromptRequest } from '../steps/step';
import { popWork, updateWork } from '../stack';
import type { Transcript } from '../transcript';
import { moveCards, playCost, payPlayPoints, zoneOf } from '../move';
import { confirmationTiming } from '../confirmation';
import { hasShownKeyword, refreshDerived } from '../derived';
import { pushResolveAbility } from './ability';
import { isSelection } from '../queries';
import { refOf } from '../../state/state';
import type { Instr, SpellAbility } from '../../abilities/spec';
import { gather, matchesFilter } from '../../abilities/filters';
import { discard } from '../verbs';

function playEffect(t: Transcript, card: PlayCardFrame['card']): readonly Instr[] {
  const def = definitionOf(t.state, card);
  const script = t.state.scripts[def.id];
  if (!script) return [];
  if (def.kind === 'spell') {
    const spell = script.abilities.find((ability) => ability.kind === 'spell');
    return spell?.kind === 'spell' ? spell.effect : [];
  }
  const fanfare = script.abilities.find(
    (ability) => ability.kind === 'triggered' && ability.on === 'fanfare',
  );
  return fanfare?.kind === 'triggered' ? fanfare.effect : [];
}

function chooseOne(effect: readonly Instr[]): Extract<Instr, { op: 'chooseOne' }> | undefined {
  return effect.find(
    (instr): instr is Extract<Instr, { op: 'chooseOne' }> => instr.op === 'chooseOne',
  );
}

function extraCostOf(t: Transcript, card: PlayCardFrame['card']): SpellAbility['extraCost'] | undefined {
  const def = definitionOf(t.state, card);
  if (def.kind !== 'spell') return undefined;
  const script = t.state.scripts[def.id];
  const spell = script?.abilities.find((ability) => ability.kind === 'spell');
  return spell?.kind === 'spell' ? spell.extraCost : undefined;
}

function extraCandidates(
  t: Transcript,
  frame: PlayCardFrame,
  extra: NonNullable<SpellAbility['extraCost']>,
) {
  return t.state.seats[frame.seat].hand.filter((id) =>
    matchesFilter(t.state, id, extra.discard.filter, frame.card),
  );
}

function targetSelects(effect: readonly Instr[]): Extract<Instr, { op: 'select' }>[] {
  return effect.filter(
    (instr): instr is Extract<Instr, { op: 'select' }> =>
      instr.op === 'select' && instr.target === true,
  );
}

export function tickPlayCard(t: Transcript, frame: PlayCardFrame): PromptRequest | null {
  let current = frame;
  for (;;) {
    switch (current.stage) {
      case 'specify': {
        const from = zoneOf(t.state, current.card);
        moveCards(t, {
          owner: current.seat,
          cards: [current.card],
          from,
          to: { zone: 'resolution' },
          cause: 'play',
        });
        current = { ...current, stage: 'modes' };
        updateWork(t, current);
        continue;
      }
      case 'modes': {
        const choice = chooseOne(playEffect(t, current.card));
        if (choice && current.chosenModes.length === 0) {
          return {
            kind: 'chooseMode',
            seat: current.seat,
            label: 'Choose one',
            modes: choice.options.map((option, index) => ({
              id: String(index),
              label: option.label,
            })),
          };
        }
        current = { ...current, stage: 'extraCost' };
        updateWork(t, current);
        continue;
      }
      case 'extraCost': {
        const extra = extraCostOf(t, current.card);
        if (!extra || current.vars.__extraCostDone === true) {
          current = { ...current, stage: 'targets' };
          updateWork(t, current);
          continue;
        }
        const candidates = extraCandidates(t, current, extra);
        if (current.vars.__extraPicking === true) {
          return {
            kind: 'selectCards',
            seat: current.seat,
            label: extra.label,
            candidates,
            previews: candidates.map((id) => refOf(t.state, id)),
            min: extra.discard.n,
            max: extra.discard.n,
            where: 'mat',
          };
        }
        const full = playCost(t.state, current.card);
        const mustPay = full > t.state.seats[current.seat].resources.playPoints;
        if (mustPay) {
          if (candidates.length < extra.discard.n) {
            current = { ...current, vars: { ...current.vars, __extraCostDone: true } };
            updateWork(t, current);
            continue;
          }
          current = { ...current, vars: { ...current.vars, __extraPicking: true } };
          updateWork(t, current);
          continue;
        }
        return {
          kind: 'confirmOptional',
          seat: current.seat,
          label: extra.label,
        };
      }
      case 'targets': {
        const selects = targetSelects(playEffect(t, current.card));
        const pending = selects.find((instr) => current.vars[instr.as] === undefined);
        if (pending) {
          const candidates = gather(
            t.state,
            current.seat,
            pending.from,
            pending.filter,
            current.card,
          ).filter((id) => {
            const loc = t.state.seats[current.seat === 0 ? 1 : 0].field.find(
              (card) => card.id === id,
            );
            if (loc && hasShownKeyword(t.state, id, 'aura')) return false;
            return true;
          });
          const min = typeof pending.count === 'number' ? pending.count : 0;
          const max =
            typeof pending.count === 'number'
              ? pending.count
              : pending.count === 'any'
                ? candidates.length
                : pending.count.upTo;
          return {
            kind: 'selectCards',
            seat: current.seat,
            label: 'Choose targets',
            candidates,
            previews: candidates.map((id) => refOf(t.state, id)),
            min: Math.min(min, candidates.length),
            max: Math.min(max, candidates.length),
            where: 'mat',
          };
        }
        current = { ...current, stage: 'pay' };
        updateWork(t, current);
        continue;
      }
      case 'allocate':
        current = { ...current, stage: 'pay' };
        updateWork(t, current);
        continue;
      case 'pay': {
        const extra = extraCostOf(t, current.card);
        const full = playCost(t.state, current.card);
        const paid = current.vars.__extraPaid === true && extra ? extra.reduceBy : 0;
        payPlayPoints(t, current.seat, Math.max(0, full - paid));
        t.emit({
          type: 'cardPlayed',
          seat: current.seat,
          card: current.card,
          from: current.from,
        });
        current = { ...current, stage: 'resolve' };
        updateWork(t, current);
        continue;
      }
      case 'check':
        current = { ...current, stage: 'resolve' };
        updateWork(t, current);
        continue;
      case 'resolve': {
        const def = definitionOf(t.state, current.card);
        const owner = t.state.cards[current.card]?.owner ?? current.seat;
        if (def.kind === 'follower' || def.kind === 'amulet') {
          moveCards(t, {
            owner: current.seat,
            cards: [current.card],
            from: { zone: 'resolution' },
            to: { zone: 'field', seat: current.seat },
            cause: 'play',
            placement: 'reserved',
            enteredTurn: t.state.turn,
          });
          refreshDerived(t);
          if (hasShownKeyword(t.state, current.card, 'ward')) {
            current = { ...current, stage: 'done' };
            updateWork(t, current);
            return {
              kind: 'confirmOptional',
              seat: current.seat,
              label: 'Enter engaged? (Ward)',
            };
          }
          const script = t.state.scripts[def.id];
          const fanfare = script?.abilities.find(
            (ability) => ability.kind === 'triggered' && ability.on === 'fanfare',
          );
          if (fanfare?.kind === 'triggered') {
            current = { ...current, stage: 'done' };
            updateWork(t, current);
            pushResolveAbility(t, {
              seat: current.seat,
              source: current.card,
              sourceDef: def.id,
              abilityKey: fanfare.key,
            });
            // Copy play-time choices onto the ability frame via a follow-up update.
            const top = t.state.work[t.state.work.length - 1];
            if (top?.kind === 'resolveAbility') {
              updateWork(t, {
                ...top,
                vars: { ...current.vars, __chooseOne: current.chosenModes[0] },
              });
            }
            return null;
          }
        } else if (def.kind === 'spell') {
          const script = t.state.scripts[def.id];
          const spell = script?.abilities.find((ability) => ability.kind === 'spell');
          if (spell?.kind === 'spell') {
            current = { ...current, stage: 'done' };
            updateWork(t, current);
            pushResolveAbility(t, {
              seat: current.seat,
              source: current.card,
              sourceDef: def.id,
              abilityKey: spell.key,
            });
            const top = t.state.work[t.state.work.length - 1];
            if (top?.kind === 'resolveAbility') {
              updateWork(t, {
                ...top,
                vars: { ...current.vars, __chooseOne: current.chosenModes[0] },
              });
            }
            return null;
          }
          moveCards(t, {
            owner: current.seat,
            cards: [current.card],
            from: { zone: 'resolution' },
            to: { zone: 'cemetery', seat: owner },
            cause: 'play',
          });
        }
        popWork(t);
        confirmationTiming(t);
        return null;
      }
      case 'done': {
        const def = definitionOf(t.state, current.card);
        const owner = t.state.cards[current.card]?.owner ?? current.seat;
        if (
          def.kind === 'spell' &&
          t.state.resolution.some((entry) => entry.card === current.card)
        ) {
          moveCards(t, {
            owner: current.seat,
            cards: [current.card],
            from: { zone: 'resolution' },
            to: { zone: 'cemetery', seat: owner },
            cause: 'play',
          });
        }
        popWork(t);
        confirmationTiming(t);
        return null;
      }
    }
  }
}

export function answerPlayCard(
  t: Transcript,
  frame: PlayCardFrame,
  prompt: Prompt,
  intent: Intent,
): AnswerResult {
  if (frame.stage === 'modes') {
    if (intent.type !== 'choose' || intent.choice.kind !== 'mode') return REJECTED;
    if (prompt.kind !== 'chooseMode') return REJECTED;
    const index = Number(intent.choice.id);
    updateWork(t, {
      ...frame,
      chosenModes: [...frame.chosenModes, index],
      vars: { ...frame.vars, __chooseOne: index },
    });
    return { accepted: true, followUp: null };
  }
  if (frame.stage === 'targets') {
    if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
    if (prompt.kind !== 'selectCards') return REJECTED;
    if (!isSelection(intent.choice.cards, prompt.candidates)) return REJECTED;
    if (intent.choice.cards.length < prompt.min || intent.choice.cards.length > prompt.max) {
      return REJECTED;
    }
    const pending = targetSelects(playEffect(t, frame.card)).find(
      (instr) => frame.vars[instr.as] === undefined,
    );
    if (!pending) return REJECTED;
    updateWork(t, { ...frame, vars: { ...frame.vars, [pending.as]: intent.choice.cards } });
    return { accepted: true, followUp: null };
  }
  if (frame.stage === 'extraCost') {
    const extra = extraCostOf(t, frame.card);
    if (!extra) return REJECTED;
    if (
      prompt.kind === 'confirmOptional' &&
      intent.type === 'choose' &&
      intent.choice.kind === 'confirm'
    ) {
      if (!intent.choice.yes) {
        updateWork(t, { ...frame, vars: { ...frame.vars, __extraCostDone: true } });
        return { accepted: true, followUp: null };
      }
      updateWork(t, { ...frame, vars: { ...frame.vars, __extraPicking: true } });
      return { accepted: true, followUp: null };
    }
    if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
    if (prompt.kind !== 'selectCards') return REJECTED;
    if (!isSelection(intent.choice.cards, prompt.candidates)) return REJECTED;
    if (intent.choice.cards.length !== extra.discard.n) return REJECTED;
    discard(t, frame.seat, intent.choice.cards);
    updateWork(t, {
      ...frame,
      vars: {
        ...frame.vars,
        __extraPaid: true,
        __extraCostDone: true,
        __extraPicking: false,
        __extraDiscarded: intent.choice.cards,
      },
    });
    return { accepted: true, followUp: null };
  }
  if (
    prompt.kind === 'confirmOptional' &&
    intent.type === 'choose' &&
    intent.choice.kind === 'confirm'
  ) {
    if (intent.choice.yes) {
      t.emit({ type: 'wardsEngaged', seat: frame.seat, cards: [frame.card] });
    }
    const def = definitionOf(t.state, frame.card);
    const script = t.state.scripts[def.id];
    const fanfare = script?.abilities.find(
      (ability) => ability.kind === 'triggered' && ability.on === 'fanfare',
    );
    if (fanfare?.kind === 'triggered') {
      pushResolveAbility(t, {
        seat: frame.seat,
        source: frame.card,
        sourceDef: def.id,
        abilityKey: fanfare.key,
      });
      const top = t.state.work[t.state.work.length - 1];
      if (top?.kind === 'resolveAbility') {
        updateWork(t, { ...top, vars: { ...frame.vars, __chooseOne: frame.chosenModes[0] } });
      }
    }
    return { accepted: true, followUp: null };
  }
  return REJECTED;
}

export { tickAttack, answerAttack, tickQuickWindow, answerQuickWindow } from './combat';
export { tickResolveAbility, answerResolveAbility, pushResolveAbility } from './ability';
