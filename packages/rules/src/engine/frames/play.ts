import type { Intent } from '../../actions/intents';
import type { CardId } from '../../model/ids';
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
import {
  additionalCostOf,
  costParts,
  extraCostCandidates,
  extraCostPick,
  pickedCostParts,
  type AtomicCost,
} from '../../abilities/costs';
import { playDiscountsFor } from '../../abilities/statics';
import { payAbilityCost } from '../pay-cost';

type PickedPart = ReturnType<typeof pickedCostParts>[number];

const costStepOf = (frame: PlayCardFrame): number =>
  typeof frame.vars.__costStep === 'number' ? frame.vars.__costStep : 0;

const costPickedOf = (frame: PlayCardFrame): readonly CardId[] =>
  Array.isArray(frame.vars.__costPicked) ? (frame.vars.__costPicked as CardId[]) : [];

/** The next card-picking part of the additional cost, if any is left to ask. */
function nextPickedPart(t: Transcript, frame: PlayCardFrame): PickedPart | undefined {
  const cost = additionalCostOf(t.state, frame.card);
  return cost ? pickedCostParts(cost)[costStepOf(frame)] : undefined;
}

/** What a picked part says it wants: "reveal 2 Academic cards" and which cards qualify. */
function pickedSpec(part: PickedPart) {
  return 'reveal' in part
    ? { verb: 'Reveal', ...part.reveal }
    : { verb: 'Discard', ...part.discard };
}

function pickedCandidates(t: Transcript, frame: PlayCardFrame, part: PickedPart): CardId[] {
  const { filter } = pickedSpec(part);
  const taken = costPickedOf(frame);
  return t.state.seats[frame.seat].hand.filter(
    (id) =>
      id !== frame.card && !taken.includes(id) && matchesFilter(t.state, id, filter, frame.card),
  );
}

function pickedLabel(part: PickedPart): string {
  const { verb, n, filter } = pickedSpec(part);
  const what = [filter?.trait, filter?.universe, filter?.kind?.join(' or ')].filter(Boolean);
  return `${verb} ${n} ${what.length > 0 ? `${what.join(' ')} ` : ''}${
    n === 1 ? 'card' : 'cards'
  } from your hand (additional cost)`;
}

/** Everything in the additional cost that needs no decision: play points, Leader defense… */
function settledParts(t: Transcript, card: CardId): AtomicCost[] {
  const cost = additionalCostOf(t.state, card);
  return cost ? costParts(cost).filter((part) => !('reveal' in part) && !('discard' in part)) : [];
}

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

function extraCostOf(
  t: Transcript,
  card: PlayCardFrame['card'],
): SpellAbility['extraCost'] | undefined {
  const def = definitionOf(t.state, card);
  if (def.kind !== 'spell') return undefined;
  const script = t.state.scripts[def.id];
  const spell = script?.abilities.find((ability) => ability.kind === 'spell');
  return spell?.kind === 'spell' ? spell.extraCost : undefined;
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
        current = { ...current, stage: 'additionalCost' };
        updateWork(t, current);
        continue;
      }
      case 'additionalCost': {
        // 10.6.2.2: the cards the cost names are chosen now, before targets and payment.
        const part = nextPickedPart(t, current);
        if (!part) {
          current = { ...current, stage: 'extraCost' };
          updateWork(t, current);
          continue;
        }
        const candidates = pickedCandidates(t, current, part);
        const n = Math.min(pickedSpec(part).n, candidates.length);
        return {
          kind: 'selectCards',
          seat: current.seat,
          label: pickedLabel(part),
          candidates,
          previews: candidates.map((id) => refOf(t.state, id)),
          min: n,
          max: n,
          where: 'mat',
        };
      }
      case 'extraCost': {
        const extra = extraCostOf(t, current.card);
        if (!extra || current.vars.__extraCostDone === true) {
          current = { ...current, stage: 'targets' };
          updateWork(t, current);
          continue;
        }
        const pick = extraCostPick(extra);
        const candidates = extraCostCandidates(t.state, current.seat, current.card, extra);
        if (current.vars.__extraPicking === true) {
          return {
            kind: 'selectCards',
            seat: current.seat,
            label: extra.label,
            candidates,
            previews: candidates.map((id) => refOf(t.state, id)),
            min: pick.n,
            max: pick.n,
            where: pick.where,
          };
        }
        const full = playCost(t.state, current.card);
        const mustPay = full > t.state.seats[current.seat].resources.playPoints;
        if (mustPay) {
          if (candidates.length < pick.n) {
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
        payAbilityCost(t, current.seat, current.card, { list: settledParts(t, current.card) });
        // "The next card you play costs N less" is used up by the card it just discounted.
        const offers = playDiscountsFor(t.state, current.card);
        if (offers.length > 0) {
          t.emit({ type: 'playDiscountSpent', ids: offers.map((offer) => offer.id) });
        }
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
                vars: { ...current.vars, __from: current.from, __chooseOne: current.chosenModes[0] },
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
                vars: { ...current.vars, __from: current.from, __chooseOne: current.chosenModes[0] },
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
  if (frame.stage === 'additionalCost') {
    if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
    if (prompt.kind !== 'selectCards') return REJECTED;
    const part = nextPickedPart(t, frame);
    if (!part) return REJECTED;
    const picked = intent.choice.cards;
    if (!isSelection(picked, prompt.candidates)) return REJECTED;
    if (picked.length < prompt.min || picked.length > prompt.max) return REJECTED;
    // Revealing shows the cards and leaves them where they are; discarding moves them.
    if ('reveal' in part) t.emit({ type: 'cardsRevealed', seat: frame.seat, cards: picked });
    else discard(t, frame.seat, picked, frame.card);
    updateWork(t, {
      ...frame,
      vars: {
        ...frame.vars,
        __costStep: costStepOf(frame) + 1,
        __costPicked: [...costPickedOf(frame), ...picked],
      },
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
    const pick = extraCostPick(extra);
    if (!isSelection(intent.choice.cards, prompt.candidates)) return REJECTED;
    if (intent.choice.cards.length !== pick.n) return REJECTED;
    if (pick.kind === 'banish') {
      for (const id of intent.choice.cards) {
        const from = zoneOf(t.state, id);
        const owner = t.state.cards[id]?.owner ?? frame.seat;
        moveCards(t, {
          owner,
          cards: [id],
          from,
          to: { zone: 'banished', seat: owner },
          cause: 'banish',
        });
      }
    } else {
      discard(t, frame.seat, intent.choice.cards, frame.card);
    }
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
        updateWork(t, {
          ...top,
          vars: { ...frame.vars, __from: frame.from, __chooseOne: frame.chosenModes[0] },
        });
      }
    }
    return { accepted: true, followUp: null };
  }
  return REJECTED;
}

export { tickAttack, answerAttack, tickQuickWindow, answerQuickWindow } from './combat';
export { tickResolveAbility, answerResolveAbility, pushResolveAbility } from './ability';
