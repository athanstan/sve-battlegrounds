import { opponentOf, SEATS, type CardId, type Seat } from '../model/ids';
import { type Prompt } from '../state/state';
import type { ResolveAbilityFrame } from '../state/work';
import type { Intent } from '../actions/intents';
import type { PromptRequest } from '../engine/steps/step';
import type { Transcript } from '../engine/transcript';
import { refreshDerived, hasShownKeyword, fieldOf } from '../engine/derived';
import {
  createTokens,
  dealDamage,
  moveCards,
  payPlayPoints,
  shuffleDeck,
  updateFieldCard,
} from '../engine/move';
import { discard, draw, engage, setResource } from '../engine/verbs';
import { isSelection } from '../engine/queries';
import { locate } from '../state/zones';
import type { CardFilter, Instr, LookPick, Place } from './spec';
import { asCardIds, countOf, gather, matchesFilter } from './filters';
import { evaluateCondition, evaluateValue } from './values';
import { evolveFollower } from '../engine/evolve';
import { refOf } from '../state/state';
import { updateWork } from '../engine/stack';
import { answerFamilyOp, runFamilyOp } from './families';
import { hasRestriction, wouldBeReplaced } from './statics';

export type OpStep =
  | { readonly kind: 'ok'; readonly frame: ResolveAbilityFrame; readonly advance?: boolean }
  | { readonly kind: 'prompt'; readonly prompt: PromptRequest }
  | { readonly kind: 'wait'; readonly frame: ResolveAbilityFrame };

export type OpAnswer =
  | { readonly accepted: false }
  | { readonly accepted: true; readonly frame: ResolveAbilityFrame; readonly advance?: boolean };

const REJECTED: OpAnswer = { accepted: false };

const withVars = (
  frame: ResolveAbilityFrame,
  vars: Readonly<Record<string, unknown>>,
): ResolveAbilityFrame => ({ ...frame, vars: { ...frame.vars, ...vars } });

const listOf = (frame: ResolveAbilityFrame, effect: readonly Instr[]): readonly Instr[] =>
  frame.queue ?? effect;

function asSelect(
  t: Transcript,
  args: {
    readonly seat: Seat;
    readonly label: string;
    readonly candidates: readonly CardId[];
    readonly min: number;
    readonly max: number;
    readonly where: 'mat' | 'browser';
  },
): PromptRequest {
  return {
    kind: 'selectCards',
    seat: args.seat,
    label: args.label,
    candidates: args.candidates,
    previews: args.candidates.map((id) => refOf(t.state, id)),
    min: args.min,
    max: args.max,
    where: args.where,
  };
}

export function spliceBody(
  frame: ResolveAbilityFrame,
  effect: readonly Instr[],
  body: readonly Instr[],
): ResolveAbilityFrame {
  const list = listOf(frame, effect);
  const rest = list.slice(frame.pc + 1);
  return { ...frame, queue: [...body, ...rest], pc: 0 };
}

function resolveCards(
  t: Transcript,
  frame: ResolveAbilityFrame,
  spec: string | { readonly each: Place; readonly filter?: CardFilter },
): CardId[] {
  if (spec === 'self') return [frame.source];
  if (typeof spec === 'string') return asCardIds(frame.vars, spec);
  return gather(t.state, frame.seat, [spec.each], spec.filter, frame.source);
}

function dealToIds(
  t: Transcript,
  frame: ResolveAbilityFrame,
  ids: readonly CardId[],
  amount: number,
): void {
  for (const id of ids) {
    const loc = fieldOf(t.state, id);
    if (loc) {
      dealDamage(t, {
        source: frame.source,
        target: id,
        targetSeat: loc.seat,
        amount,
        combat: false,
      });
      continue;
    }
    for (const seat of SEATS) {
      if (t.state.seats[seat].leader.card === id) {
        dealDamage(t, {
          source: frame.source,
          target: 'leader',
          targetSeat: seat,
          amount,
          combat: false,
        });
      }
    }
  }
}

function optionBody(
  option: Extract<Instr, { op: 'chooseOne' }>['options'][number],
): readonly Instr[] {
  const cost = option.cost ?? [];
  const paid = cost.find(
    (instr): instr is Extract<Instr, { op: 'select' }> => instr.op === 'select',
  );
  if (paid) {
    return [
      ...cost,
      { op: 'if', cond: { atLeast: 1, value: { var: paid.as } }, then: option.effect },
    ];
  }
  return cost.length > 0 ? [...cost, ...option.effect] : option.effect;
}

function selectPrompt(
  t: Transcript,
  frame: ResolveAbilityFrame,
  instr: Extract<Instr, { op: 'select' }>,
): PromptRequest | { readonly skip: true; readonly frame: ResolveAbilityFrame } {
  if (frame.vars[instr.as] !== undefined) return { skip: true, frame };
  const candidates = gather(t.state, frame.seat, instr.from, instr.filter, frame.source).filter(
    (id) => {
      if (!instr.target) return true;
      // 12.15 Aura: opponent cannot target this follower with cards or abilities.
      const loc = locate(t.state, id);
      if (
        loc?.zone === 'field' &&
        loc.seat !== frame.seat &&
        hasShownKeyword(t.state, id, 'aura')
      ) {
        return false;
      }
      return true;
    },
  );
  const { min, max } = countOf(instr.count);
  const where = instr.from.some(
    (place) => place.zone === 'deck' || place.zone === 'cemetery' || place.zone === 'evolveDeck',
  )
    ? 'browser'
    : 'mat';
  if (candidates.length < min) {
    // 1.3.2: do as much as possible at resolution; required play-time targets are a different check.
    return { skip: true, frame: withVars(frame, { [instr.as]: candidates }) };
  }
  if (min === 0 && max === 0) return { skip: true, frame: withVars(frame, { [instr.as]: [] }) };
  if (candidates.length === 0 && min === 0) {
    return { skip: true, frame: withVars(frame, { [instr.as]: [] }) };
  }
  return asSelect(t, {
    seat: frame.seat,
    label: 'Choose cards',
    candidates,
    min: Math.min(min, candidates.length),
    max: Math.min(max, candidates.length),
    where,
  });
}

function lookGroups(instr: Extract<Instr, { op: 'lookTop' }>): readonly LookPick[] {
  if (instr.picks && instr.picks.length > 0) return instr.picks;
  return instr.pick ? [instr.pick] : [];
}

function lookWanted(pick: LookPick, available: number): { min: number; max: number } {
  if (pick.n !== undefined) {
    const n = Math.min(pick.n, available);
    return { min: n, max: n };
  }
  return { min: 0, max: Math.min(pick.upTo ?? available, available) };
}

function lookPickedOf(frame: ResolveAbilityFrame): CardId[] {
  return asCardIds(frame.vars, '__lookPicked');
}

function lookStepOf(frame: ResolveAbilityFrame): number {
  return typeof frame.vars.__lookStep === 'number' ? frame.vars.__lookStep : 0;
}

function settleLookTop(
  t: Transcript,
  frame: ResolveAbilityFrame,
  instr: Extract<Instr, { op: 'lookTop' }>,
  picked: readonly CardId[],
): ResolveAbilityFrame {
  const seat = frame.seat;
  const top = t.state.seats[seat].deck.slice(0, instr.n);
  const rest = top.filter((id) => !picked.includes(id));
  if (lookGroups(instr).some((group) => group.reveal) && picked.length > 0) {
    t.emit({ type: 'cardsRevealed', seat, cards: picked });
  }
  if (picked.length > 0) {
    moveCards(t, {
      owner: seat,
      cards: picked,
      from: { zone: 'deck', seat },
      to: { zone: 'hand', seat },
      cause: 'look',
    });
  }
  if (rest.length > 0 && instr.rest === 'bottom') {
    moveCards(t, {
      owner: seat,
      cards: rest,
      from: { zone: 'deck', seat },
      to: { zone: 'deck', seat },
      cause: 'look',
      position: 'bottom',
    });
  }
  if (rest.length > 0 && instr.rest === 'bury') {
    moveCards(t, {
      owner: seat,
      cards: rest,
      from: { zone: 'deck', seat },
      to: { zone: 'cemetery', seat },
      cause: 'bury',
    });
  }
  return withVars(frame, {
    look: picked,
    __lookPicked: picked,
    __lookStep: lookGroups(instr).length,
  });
}

function roomFor(t: Transcript, seat: Seat, zone: 'field' | 'ex' | 'hand'): number {
  const s = t.state.seats[seat];
  if (zone === 'field') return Math.max(0, s.limits.field - s.field.length);
  if (zone === 'ex') return Math.max(0, s.limits.ex - s.ex.length);
  return 64;
}

export function runOp(
  t: Transcript,
  frame: ResolveAbilityFrame,
  instr: Instr,
  effect: readonly Instr[],
): OpStep {
  const seat = frame.seat;
  switch (instr.op) {
    case 'select': {
      const result = selectPrompt(t, frame, instr);
      if ('skip' in result) return { kind: 'ok', frame: result.frame };
      return { kind: 'prompt', prompt: result };
    }
    case 'search': {
      const all = t.state.seats[seat].deck;
      const matching = instr.filter
        ? all.filter((id) => matchesFilter(t.state, id, instr.filter, frame.source))
        : [...all];
      // 4.1.2.2: a filtered search may find nothing even if a match exists.
      const min = instr.filter ? 0 : Math.min(instr.count, matching.length);
      const max = Math.min(instr.count, matching.length);
      const candidates = [...matching].sort();
      if (max === 0) {
        shuffleDeck(t, seat); // 5.8.2: shuffle even if nothing is found
        return { kind: 'ok', frame: withVars(frame, { [instr.as]: [] }) };
      }
      return {
        kind: 'prompt',
        prompt: asSelect(t, {
          seat,
          label: 'Search your deck',
          candidates,
          min,
          max,
          where: 'browser',
        }),
      };
    }
    case 'lookTop': {
      const groups = lookGroups(instr);
      let step = lookStepOf(frame);
      const already = lookPickedOf(frame);
      const top = t.state.seats[seat].deck.slice(0, instr.n);
      while (step < groups.length) {
        const group = groups[step];
        if (!group) break;
        const remaining = top.filter((id) => !already.includes(id));
        const matching = group.filter
          ? remaining.filter((id) => matchesFilter(t.state, id, group.filter, frame.source))
          : remaining;
        const { min, max } = lookWanted(group, matching.length);
        if (max === 0) {
          step += 1;
          continue;
        }
        updateWork(t, withVars(frame, { __lookStep: step, __lookPicked: already }));
        return {
          kind: 'prompt',
          prompt: asSelect(t, {
            seat,
            label: `Look at the top ${instr.n}`,
            candidates: matching,
            min,
            max,
            where: 'browser',
          }),
        };
      }
      return { kind: 'ok', frame: settleLookTop(t, frame, instr, already) };
    }
    case 'draw': {
      const n = evaluateValue(t.state, seat, instr.n, frame.vars, frame.source);
      const who = instr.who ?? 'you';
      const seats =
        who === 'you' ? [seat] : who === 'opponent' ? [opponentOf(seat)] : ([0, 1] as const);
      for (const s of seats) draw(t, s, n, 'effect');
      return { kind: 'ok', frame };
    }
    case 'buryTop': {
      const n = evaluateValue(t.state, seat, instr.n, frame.vars, frame.source);
      const who = instr.who ?? 'you';
      const seats =
        who === 'you' ? [seat] : who === 'opponent' ? [opponentOf(seat)] : ([0, 1] as const);
      const buried: CardId[] = [];
      for (const target of seats) {
        const cards = t.state.seats[target].deck.slice(0, Math.max(0, n));
        if (cards.length > 0) {
          moveCards(t, {
            owner: target,
            cards,
            from: { zone: 'deck', seat: target },
            to: { zone: 'cemetery', seat: target },
            cause: 'bury',
          });
          buried.push(...cards);
        }
      }
      return {
        kind: 'ok',
        frame: instr.as ? withVars(frame, { [instr.as]: buried }) : frame,
      };
    }
    case 'discard': {
      const remainingRaw = frame.vars.__discardRemaining;
      const remaining: Seat[] =
        Array.isArray(remainingRaw) && remainingRaw.every((value) => value === 0 || value === 1)
          ? [...(remainingRaw as Seat[])]
          : (() => {
              const whoSeats =
                instr.who === 'you'
                  ? [seat]
                  : instr.who === 'opponent'
                    ? [opponentOf(seat)]
                    : ([0, 1] as const);
              // 1.3.4: non-choosing parts together, then active, then non-active.
              return [...whoSeats].sort((a, b) => {
                const active = t.state.active;
                if (a === active) return -1;
                if (b === active) return 1;
                return a - b;
              });
            })();
      const chooser = remaining[0];
      if (chooser === undefined) return { kind: 'ok', frame };
      const candidates = t.state.seats[chooser].hand.filter((id) =>
        matchesFilter(t.state, id, instr.filter, frame.source),
      );
      const n = Math.min(instr.n, candidates.length);
      const rest = remaining.slice(1);
      const after = (picked: readonly CardId[]): ResolveAbilityFrame => {
        const next = instr.as
          ? withVars(frame, {
              [instr.as]: [...asCardIds(frame.vars, instr.as), ...picked],
              __discardRemaining: rest,
            })
          : withVars(frame, { __discardRemaining: rest });
        return rest.length > 0 ? next : next;
      };
      if (n === 0) {
        return rest.length > 0
          ? { kind: 'ok', frame: after([]), advance: false }
          : { kind: 'ok', frame: instr.as ? withVars(frame, { [instr.as]: [] }) : frame };
      }
      if (candidates.length === n) {
        discard(t, chooser, candidates);
        return rest.length > 0
          ? { kind: 'ok', frame: after(candidates), advance: false }
          : { kind: 'ok', frame: instr.as ? withVars(frame, { [instr.as]: candidates }) : frame };
      }
      updateWork(t, withVars(frame, { __discardRemaining: remaining }));
      return {
        kind: 'prompt',
        prompt: asSelect(t, {
          seat: chooser,
          label: `Discard ${n}`,
          candidates,
          min: n,
          max: n,
          where: 'mat',
        }),
      };
    }
    case 'move': {
      const cards = instr.cards === 'self' ? [frame.source] : asCardIds(frame.vars, instr.cards);
      const kept =
        instr.to === 'field' || instr.to === 'ex'
          ? cards.slice(0, roomFor(t, seat, instr.to))
          : cards;
      for (const id of kept) {
        const from = locate(t.state, id);
        if (!from) continue;
        const owner = t.state.cards[id]?.owner ?? seat;
        const to =
          instr.to === 'banished'
            ? ({ zone: 'banished', seat: owner } as const)
            : instr.to === 'hand' || instr.to === 'cemetery'
              ? ({ zone: instr.to, seat: owner } as const)
              : ({ zone: instr.to, seat } as const);
        moveCards(t, {
          owner: from.zone === 'resolution' ? seat : from.seat,
          cards: [id],
          from: from.zone === 'resolution' ? { zone: 'resolution' } : from,
          to,
          cause: instr.to === 'cemetery' ? 'bury' : 'effect',
          ...(instr.to === 'field'
            ? { enteredTurn: t.state.turn, placement: 'reserved' as const }
            : {}),
        });
        if (instr.costDeltaThisTurn) {
          t.emit({
            type: 'costDeltaApplied',
            card: id,
            amount: instr.costDeltaThisTurn,
            until: 'endOfTurn',
          });
        }
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'token': {
      createTokens(t, seat, instr.name, instr.n, instr.to);
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'damage': {
      const amount = evaluateValue(t.state, seat, instr.amount, frame.vars, frame.source);
      if (amount <= 0) return { kind: 'ok', frame };
      if (instr.to === 'enemyLeader') {
        dealDamage(t, {
          source: frame.source,
          target: 'leader',
          targetSeat: opponentOf(seat),
          amount,
          combat: false,
        });
        refreshDerived(t);
        return { kind: 'ok', frame };
      }
      if (typeof instr.to === 'object') {
        const targets = gather(t.state, seat, [instr.to.each], instr.to.filter, frame.source);
        if (instr.divided && targets.length > 1) {
          return {
            kind: 'prompt',
            prompt: {
              kind: 'allocate',
              seat,
              label: `Divide ${amount} damage`,
              total: amount,
              targets,
            },
          };
        }
        for (const id of targets) {
          dealToIds(t, frame, [id], amount);
        }
        refreshDerived(t);
        return { kind: 'ok', frame };
      }
      const targets = asCardIds(frame.vars, instr.to);
      if (instr.divided && targets.length > 1) {
        return {
          kind: 'prompt',
          prompt: {
            kind: 'allocate',
            seat,
            label: `Divide ${amount} damage`,
            total: amount,
            targets,
          },
        };
      }
      dealToIds(t, frame, targets, amount);
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'buff': {
      const cards = resolveCards(t, frame, instr.cards);
      const until = instr.until ?? null;
      const attack = evaluateValue(t.state, seat, instr.attack, frame.vars, frame.source);
      const defense = evaluateValue(t.state, seat, instr.defense, frame.vars, frame.source);
      for (const id of cards) {
        const applied = updateFieldCard(t, id, (card) => ({
          ...card,
          modifiers: [...card.modifiers, { attack, defense, until }],
        }));
        if (!applied || attack !== 0 || defense !== 0) {
          t.emit({
            type: 'instanceBuffed',
            card: id,
            modifier: { attack, defense, until },
          });
        }
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'grant': {
      const cards = resolveCards(t, frame, instr.cards);
      const until = instr.until ?? null;
      for (const id of cards) {
        const grants = instr.keywords.map((keyword) => ({ keyword, until }));
        const applied = updateFieldCard(t, id, (card) => ({
          ...card,
          granted: [...card.granted, ...grants],
        }));
        if (!applied) {
          t.emit({ type: 'instanceBuffed', card: id, grants });
        }
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'destroy': {
      const cards =
        typeof instr.cards === 'string'
          ? asCardIds(frame.vars, instr.cards)
          : gather(t.state, frame.seat, [instr.cards.each], instr.cards.filter, frame.source);
      for (const id of cards) {
        if (hasRestriction(t.state, id, (r) => r.cantBeDestroyed === true)) continue;
        if (wouldBeReplaced(t.state, id, 'destroy')) continue;
        const loc = fieldOf(t.state, id);
        if (!loc) continue;
        const owner = t.state.cards[id]?.owner ?? loc.seat;
        moveCards(t, {
          owner: loc.seat,
          cards: [id],
          from: { zone: 'field', seat: loc.seat },
          to: { zone: 'cemetery', seat: owner },
          cause: 'destroy',
        });
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'banish': {
      for (const id of asCardIds(frame.vars, instr.cards)) {
        const from = locate(t.state, id);
        if (!from) continue;
        const owner = t.state.cards[id]?.owner ?? frame.seat;
        moveCards(t, {
          owner: from.zone === 'resolution' ? seat : from.seat,
          cards: [id],
          from: from.zone === 'resolution' ? { zone: 'resolution' } : from,
          to: { zone: 'banished', seat: owner },
          cause: 'banish',
        });
      }
      return { kind: 'ok', frame };
    }
    case 'returnToHand': {
      for (const id of asCardIds(frame.vars, instr.cards)) {
        const from = locate(t.state, id);
        if (!from) continue;
        const owner = t.state.cards[id]?.owner ?? frame.seat;
        moveCards(t, {
          owner: from.zone === 'resolution' ? seat : from.seat,
          cards: [id],
          from: from.zone === 'resolution' ? { zone: 'resolution' } : from,
          to: { zone: 'hand', seat: owner },
          cause: 'return',
        });
      }
      return { kind: 'ok', frame };
    }
    case 'engage': {
      const cards = (
        instr.cards === 'self' ? [frame.source] : asCardIds(frame.vars, instr.cards)
      ).filter((id) => fieldOf(t.state, id)?.card.placement === 'reserved');
      const bySeat = new Map<Seat, CardId[]>();
      for (const id of cards) {
        const loc = fieldOf(t.state, id);
        if (!loc) continue;
        const list = bySeat.get(loc.seat) ?? [];
        list.push(id);
        bySeat.set(loc.seat, list);
      }
      for (const [owner, ids] of bySeat) engage(t, owner, ids);
      return { kind: 'ok', frame };
    }
    case 'box': {
      const cards = instr.cards === 'self' ? [frame.source] : asCardIds(frame.vars, instr.cards);
      for (const id of cards) {
        const loc = fieldOf(t.state, id);
        if (!loc) continue;
        const untilTurn = t.state.active === loc.seat ? t.state.turn + 2 : t.state.turn + 1;
        updateFieldCard(t, id, (card) => ({ ...card, boxedUntilTurn: untilTurn }));
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'payPlayPoints': {
      const n = evaluateValue(t.state, seat, instr.n, frame.vars, frame.source);
      if (t.state.seats[seat].resources.playPoints < n) {
        const list = listOf(frame, effect);
        return { kind: 'ok', frame: { ...frame, pc: list.length } };
      }
      payPlayPoints(t, seat, n);
      return { kind: 'ok', frame };
    }
    case 'leaderDefense': {
      const seats =
        instr.who === 'you'
          ? [seat]
          : instr.who === 'opponent'
            ? [opponentOf(seat)]
            : ([0, 1] as const);
      for (const s of seats) {
        const defense = t.state.seats[s].leader.defense + instr.delta;
        t.emit({ type: 'leaderDefenseChanged', seat: s, defense: Math.max(0, defense) });
      }
      return { kind: 'ok', frame };
    }
    case 'recoverPlayPoints': {
      setResource(t, seat, 'playPoints', t.state.seats[seat].resources.playPoints + instr.n);
      return { kind: 'ok', frame };
    }
    case 'nextPlayCost': {
      const id = t.state.playDiscounts.reduce((max, offer) => Math.max(max, offer.id), 0) + 1;
      t.emit({
        type: 'playDiscountOffered',
        discount: {
          id,
          seat,
          source: frame.source,
          amount: instr.amount,
          until: instr.thisTurn ? 'endOfTurn' : null,
          ...(instr.filter ? { filter: instr.filter } : {}),
        },
      });
      // The options the player sees are computed from the state, so the cards this makes
      // affordable are offered (and shown as playable) when the main phase asks again.
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'gainEvolutionPoints': {
      setResource(
        t,
        seat,
        'evolutionPoints',
        t.state.seats[seat].resources.evolutionPoints + instr.n,
      );
      return { kind: 'ok', frame };
    }
    case 'evolveSelf': {
      evolveFollower(t, seat, frame.source, {
        superEvolve: false,
        useEvolutionPoint: false,
        free: true,
      });
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'turnCarrots': {
      if (instr.cards) {
        const chosen = asCardIds(frame.vars, instr.cards);
        if (chosen.length > 0)
          t.emit({ type: 'carrotsTurned', seat, cards: chosen, faceUp: instr.faceUp });
        return { kind: 'ok', frame };
      }
      const carrots = t.state.seats[seat].raceZone
        .filter((link) => link.faceUp !== instr.faceUp)
        .map((link) => link.card);
      if (carrots.length === 0) return { kind: 'ok', frame };
      if (carrots.length <= instr.upTo) {
        t.emit({ type: 'carrotsTurned', seat, cards: carrots, faceUp: instr.faceUp });
        return { kind: 'ok', frame };
      }
      return {
        kind: 'prompt',
        prompt: asSelect(t, {
          seat,
          label: instr.faceUp ? 'Turn Carrots face up' : 'Turn Carrots face down',
          candidates: carrots,
          min: 0,
          max: instr.upTo,
          where: 'mat',
        }),
      };
    }
    case 'if': {
      const yes = evaluateCondition(t.state, seat, instr.cond, frame.vars, frame.source);
      const body = yes ? instr.then : (instr.else ?? []);
      return { kind: 'ok', frame: spliceBody(frame, effect, body), advance: false };
    }
    case 'chooseOne': {
      const preset = frame.vars.__chooseOne;
      if (typeof preset === 'number' && instr.options[preset]) {
        return {
          kind: 'ok',
          frame: spliceBody(frame, effect, optionBody(instr.options[preset])),
          advance: false,
        };
      }
      return {
        kind: 'prompt',
        prompt: {
          kind: 'chooseMode',
          seat,
          label: 'Choose one',
          modes: instr.options.map((option, index) => ({ id: String(index), label: option.label })),
        },
      };
    }
    case 'chooseUpTo': {
      const usedRaw = frame.vars.__chooseUpTo;
      const used = Array.isArray(usedRaw)
        ? usedRaw.filter((value): value is number => typeof value === 'number')
        : [];
      const remaining = instr.options
        .map((option, index) => ({ option, index }))
        .filter((entry) => !used.includes(entry.index));
      if (used.length >= instr.n || remaining.length === 0) return { kind: 'ok', frame };
      return {
        kind: 'prompt',
        prompt: {
          kind: 'chooseMode',
          seat,
          label: `Choose up to ${instr.n}`,
          modes: [
            ...remaining.map((entry) => ({ id: String(entry.index), label: entry.option.label })),
            { id: 'stop', label: 'Stop' },
          ],
        },
      };
    }
    case 'optional':
      return {
        kind: 'prompt',
        prompt: { kind: 'confirmOptional', seat, label: instr.label },
      };
    case 'later':
      t.emit({
        type: 'delayedQueued',
        delayed: {
          id: t.state.nextPendingId,
          seat,
          source: frame.source,
          sourceDef: frame.sourceDef,
          point: instr.at,
          whose: 'yours',
          abilityKey: `${frame.abilityKey}:later:${instr.at}`,
          effect: instr.effect,
        },
      });
      return { kind: 'ok', frame };
    case 'win':
      t.emit({ type: 'gameEnded', outcome: { winner: seat, reason: 'effect' } }); // 1.2.4
      return { kind: 'ok', frame };
    case 'lose':
      t.emit({ type: 'gameEnded', outcome: { winner: opponentOf(seat), reason: 'effect' } });
      return { kind: 'ok', frame };
    case 'forEach': {
      const cards = asCardIds(frame.vars, instr.cards);
      const body = cards.flatMap(
        (id): Instr[] => [{ op: 'bind', as: instr.as, value: [id] }, ...instr.effect] as Instr[],
      );
      return { kind: 'ok', frame: spliceBody(frame, effect, body), advance: false };
    }
    default:
      return runFamilyOp(t, frame, instr);
  }
}

runOp.answer = (
  t: Transcript,
  frame: ResolveAbilityFrame,
  instr: Instr,
  prompt: Prompt,
  intent: Intent,
  effect: readonly Instr[],
): OpAnswer => {
  const seat = frame.seat;
  switch (instr.op) {
    case 'select': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
      if (prompt.kind !== 'selectCards') return REJECTED;
      if (!isSelection(intent.choice.cards, prompt.candidates)) return REJECTED;
      if (intent.choice.cards.length < prompt.min || intent.choice.cards.length > prompt.max) {
        return REJECTED;
      }
      return { accepted: true, frame: withVars(frame, { [instr.as]: intent.choice.cards }) };
    }
    case 'search': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
      if (prompt.kind !== 'selectCards') return REJECTED;
      if (!isSelection(intent.choice.cards, prompt.candidates)) return REJECTED;
      if (intent.choice.cards.length < prompt.min || intent.choice.cards.length > prompt.max) {
        return REJECTED;
      }
      const picked = intent.choice.cards;
      if (instr.reveal && picked.length > 0) t.emit({ type: 'cardsRevealed', seat, cards: picked });
      const dest =
        instr.then === 'hand'
          ? ({ zone: 'hand', seat } as const)
          : ({ zone: instr.then, seat } as const);
      const fit =
        instr.then === 'field' || instr.then === 'ex'
          ? picked.slice(0, roomFor(t, seat, instr.then))
          : picked;
      if (fit.length > 0) {
        moveCards(t, {
          owner: seat,
          cards: fit,
          from: { zone: 'deck', seat },
          to: dest,
          cause: 'search',
          ...(instr.then === 'field'
            ? { enteredTurn: t.state.turn, placement: 'reserved' as const }
            : {}),
        });
      }
      shuffleDeck(t, seat);
      refreshDerived(t);
      return { accepted: true, frame: withVars(frame, { [instr.as]: fit }) };
    }
    case 'lookTop': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
      if (prompt.kind !== 'selectCards') return REJECTED;
      if (!isSelection(intent.choice.cards, prompt.candidates)) return REJECTED;
      if (intent.choice.cards.length < prompt.min || intent.choice.cards.length > prompt.max) {
        return REJECTED;
      }
      const groups = lookGroups(instr);
      const already = lookPickedOf(frame);
      const picked = [...already, ...intent.choice.cards];
      const next = lookStepOf(frame) + 1;
      if (next >= groups.length) {
        return { accepted: true, frame: settleLookTop(t, frame, instr, picked) };
      }
      return {
        accepted: true,
        frame: withVars(frame, { __lookPicked: picked, __lookStep: next }),
        advance: false,
      };
    }
    case 'discard': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
      if (prompt.kind !== 'selectCards') return REJECTED;
      if (!isSelection(intent.choice.cards, prompt.candidates, prompt.min)) return REJECTED;
      discard(t, prompt.seat, intent.choice.cards);
      const restRaw = frame.vars.__discardRemaining;
      const rest = Array.isArray(restRaw)
        ? restRaw.filter((value): value is Seat => value === 0 || value === 1).slice(1)
        : [];
      const picked = intent.choice.cards;
      const next = instr.as
        ? withVars(frame, {
            [instr.as]: [...asCardIds(frame.vars, instr.as), ...picked],
            __discardRemaining: rest,
          })
        : withVars(frame, { __discardRemaining: rest });
      return {
        accepted: true,
        frame: next,
        advance: rest.length === 0,
      };
    }
    case 'damage': {
      if (intent.type !== 'choose') return REJECTED;
      if (intent.choice.kind !== 'allocate') return REJECTED;
      if (prompt.kind !== 'allocate') return REJECTED;
      const amounts = intent.choice.amounts;
      const sum = amounts.reduce((a, b) => a + b, 0);
      if (sum !== prompt.total || amounts.length !== prompt.targets.length) {
        return REJECTED;
      }
      prompt.targets.forEach((id, index) => {
        const amount = amounts[index] ?? 0;
        const loc = fieldOf(t.state, id);
        if (!loc || amount <= 0) return;
        dealDamage(t, {
          source: frame.source,
          target: id,
          targetSeat: loc.seat,
          amount,
          combat: false,
        });
      });
      refreshDerived(t);
      return { accepted: true, frame };
    }
    case 'turnCarrots': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
      if (prompt.kind !== 'selectCards') return REJECTED;
      if (!isSelection(intent.choice.cards, prompt.candidates)) return REJECTED;
      if (intent.choice.cards.length > 0) {
        t.emit({ type: 'carrotsTurned', seat, cards: intent.choice.cards, faceUp: instr.faceUp });
      }
      return { accepted: true, frame };
    }
    case 'chooseOne': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'mode') return REJECTED;
      if (prompt.kind !== 'chooseMode') return REJECTED;
      const index = Number(intent.choice.id);
      const option = instr.options[index];
      if (!option) return REJECTED;
      return {
        accepted: true,
        frame: spliceBody(withVars(frame, { __chooseOne: index }), effect, optionBody(option)),
        advance: false,
      };
    }
    case 'chooseUpTo': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'mode') return REJECTED;
      if (prompt.kind !== 'chooseMode') return REJECTED;
      if (intent.choice.id === 'stop') return { accepted: true, frame };
      const index = Number(intent.choice.id);
      const option = instr.options[index];
      if (!option) return REJECTED;
      const usedRaw = frame.vars.__chooseUpTo;
      const used = Array.isArray(usedRaw)
        ? usedRaw.filter((value): value is number => typeof value === 'number')
        : [];
      return {
        accepted: true,
        frame: spliceBody(withVars(frame, { __chooseUpTo: [...used, index] }), effect, [
          ...optionBody(option),
          instr,
        ]),
        advance: false,
      };
    }
    case 'optional': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'confirm') return REJECTED;
      let body: readonly Instr[] = [];
      if (intent.choice.yes) {
        const pay = instr.cost.find(
          (entry): entry is Extract<Instr, { op: 'payPlayPoints' }> => entry.op === 'payPlayPoints',
        );
        const n = pay ? evaluateValue(t.state, seat, pay.n, frame.vars, frame.source) : 0;
        body =
          pay && t.state.seats[seat].resources.playPoints < n ? [] : [...instr.cost, ...instr.then];
      }
      return { accepted: true, frame: spliceBody(frame, effect, body), advance: false };
    }
    default:
      return answerFamilyOp(t, frame, instr, prompt, intent);
  }
};
