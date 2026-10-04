import type { Intent } from '../actions/intents';
import { opponentOf, type CardId } from '../model/ids';
import { definitionOf, type Prompt } from '../state/state';
import type { ResolveAbilityFrame } from '../state/work';
import type { Transcript } from '../engine/transcript';
import type { PromptRequest } from '../engine/steps/step';
import {
  createTokens,
  moveCards,
  shuffleDeck,
  tokenPrototype,
  updateFieldCard,
} from '../engine/move';
import { setResource } from '../engine/verbs';
import { fieldOf, refreshDerived } from '../engine/derived';
import { locate } from '../state/zones';
import { evolveFollower } from '../engine/evolve';
import { refOf } from '../state/state';
import { nextInt } from '../rng';
import type { Instr } from './spec';
import { asCardIds, matchesFilter } from './filters';
import { evaluateValue } from './values';

export type FamilyStep =
  | { readonly kind: 'ok'; readonly frame: ResolveAbilityFrame; readonly advance?: boolean }
  | { readonly kind: 'prompt'; readonly prompt: PromptRequest };

export type FamilyAnswer =
  | { readonly accepted: false }
  | { readonly accepted: true; readonly frame: ResolveAbilityFrame; readonly advance?: boolean };

const REJECTED: FamilyAnswer = { accepted: false };

const withVars = (
  frame: ResolveAbilityFrame,
  vars: Readonly<Record<string, unknown>>,
): ResolveAbilityFrame => ({ ...frame, vars: { ...frame.vars, ...vars } });

function idsOf(frame: ResolveAbilityFrame, spec: string): CardId[] {
  if (spec === 'self') return [frame.source];
  return asCardIds(frame.vars, spec);
}

export function runFamilyOp(t: Transcript, frame: ResolveAbilityFrame, instr: Instr): FamilyStep {
  const seat = frame.seat;
  switch (instr.op) {
    case 'shuffle': {
      const who = instr.who ?? 'you';
      const seats =
        who === 'you' ? [seat] : who === 'opponent' ? [opponentOf(seat)] : ([0, 1] as const);
      for (const target of seats) shuffleDeck(t, target);
      return { kind: 'ok', frame };
    }
    case 'returnToDeck': {
      for (const id of idsOf(frame, instr.cards)) {
        const from = locate(t.state, id);
        if (!from) continue;
        const owner = t.state.cards[id]?.owner ?? seat;
        moveCards(t, {
          owner: from.zone === 'resolution' ? seat : from.seat,
          cards: [id],
          from: from.zone === 'resolution' ? { zone: 'resolution' } : from,
          to: { zone: 'deck', seat: owner },
          cause: 'return',
          position: instr.position,
        });
      }
      return { kind: 'ok', frame };
    }
    case 'transform': {
      if (!tokenPrototype(t.state, instr.into)) return { kind: 'ok', frame };
      for (const id of idsOf(frame, instr.cards)) {
        const from = locate(t.state, id);
        if (!from) continue;
        const owner = t.state.cards[id]?.owner ?? seat;
        const destSeat = from.zone === 'resolution' ? seat : from.seat;
        const zone = from.zone === 'field' ? 'field' : 'ex';
        moveCards(t, {
          owner,
          cards: [id],
          from: from.zone === 'resolution' ? { zone: 'resolution' } : from,
          to: { zone: 'cemetery', seat: owner },
          cause: 'effect',
        });
        createTokens(t, destSeat, instr.into, 1, zone);
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'steal': {
      for (const id of idsOf(frame, instr.cards)) {
        const found = fieldOf(t.state, id);
        if (!found) continue;
        moveCards(t, {
          owner: found.seat,
          cards: [id],
          from: { zone: 'field', seat: found.seat },
          to: { zone: 'field', seat },
          cause: 'effect',
          enteredTurn: t.state.turn,
          placement: 'reserved',
        });
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'changeType':
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => ({ ...card, kindOverride: instr.kind }));
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    case 'setStat': {
      const amount = evaluateValue(t.state, seat, instr.to, frame.vars, frame.source);
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => {
          const current =
            instr.stat === 'attack' ? card.shown.attack : card.shown.defense + card.damageTaken;
          const delta = amount - current;
          return {
            ...card,
            modifiers: [
              ...card.modifiers,
              {
                attack: instr.stat === 'attack' ? delta : 0,
                defense: instr.stat === 'defense' ? delta : 0,
                until: null,
              },
            ],
          };
        });
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    }
    case 'setLeaderDefense': {
      const target = instr.who === 'opponent' ? opponentOf(seat) : seat;
      const to = evaluateValue(t.state, seat, instr.to, frame.vars, frame.source);
      t.emit({ type: 'leaderDefenseChanged', seat: target, defense: Math.max(0, to) });
      return { kind: 'ok', frame };
    }
    case 'placeCounters': {
      const n = evaluateValue(t.state, seat, instr.n, frame.vars, frame.source);
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => {
          const next = (card.counters[instr.name] ?? 0) + n;
          const capped = instr.cap !== undefined ? Math.min(instr.cap, next) : next;
          return { ...card, counters: { ...card.counters, [instr.name]: Math.max(0, capped) } };
        });
      }
      return { kind: 'ok', frame };
    }
    case 'removeCounters': {
      const n = evaluateValue(t.state, seat, instr.n, frame.vars, frame.source);
      let removed = 0;
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => {
          const have = card.counters[instr.name] ?? 0;
          const take = Math.min(have, n);
          removed += take;
          return { ...card, counters: { ...card.counters, [instr.name]: have - take } };
        });
      }
      return { kind: 'ok', frame: instr.as ? withVars(frame, { [instr.as]: removed }) : frame };
    }
    case 'turnFace': {
      const revealed = t.state.seats[seat].evolveDeckRevealed;
      const hidden = t.state.seats[seat].evolveDeck;
      if (instr.faceUp) {
        const cards = (instr.cards ? idsOf(frame, instr.cards) : hidden).slice(0, instr.upTo ?? 1);
        for (const id of cards) {
          if (!hidden.includes(id)) continue;
          moveCards(t, {
            owner: seat,
            cards: [id],
            from: { zone: 'evolveDeck', seat },
            to: { zone: 'evolveDeckRevealed', seat },
            cause: 'effect',
          });
        }
        t.emit({ type: 'carrotsTurned', seat, cards, faceUp: true });
      } else {
        const cards = (instr.cards ? idsOf(frame, instr.cards) : revealed).slice(
          0,
          instr.upTo ?? 64,
        );
        for (const id of cards) {
          if (!revealed.includes(id)) continue;
          moveCards(t, {
            owner: seat,
            cards: [id],
            from: { zone: 'evolveDeckRevealed', seat },
            to: { zone: 'evolveDeck', seat },
            cause: 'effect',
          });
        }
        t.emit({ type: 'carrotsTurned', seat, cards, faceUp: false });
      }
      return { kind: 'ok', frame };
    }
    case 'skipRefresh':
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => ({ ...card, skipRefreshUntilTurn: t.state.turn + 1 }));
      }
      return { kind: 'ok', frame };
    case 'copyToken':
      for (const id of idsOf(frame, instr.cards)) {
        createTokens(t, seat, definitionOf(t.state, id).name, 1, instr.to);
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    case 'declareNumber':
    case 'chooseNumber':
      return {
        kind: 'prompt',
        prompt: {
          kind: 'chooseNumber',
          seat,
          label: instr.op === 'declareNumber' ? 'Declare a number' : 'Choose a number',
          min: instr.min ?? 0,
          max: instr.max ?? 99,
        },
      };
    case 'declareName':
      return {
        kind: 'prompt',
        prompt: { kind: 'declareName', seat, label: 'Declare a card name' },
      };
    case 'rollDie': {
      const sides = instr.sides ?? 6;
      const value = t.random((rng) => {
        const [rolled, next] = nextInt(rng, sides);
        return [rolled + 1, next];
      });
      t.emit({ type: 'dieRolled', seat, value, sides });
      return { kind: 'ok', frame: withVars(frame, { [instr.as]: value, __die: value }) };
    }
    case 'pickRandom': {
      const pool = [...idsOf(frame, instr.cards)];
      const picked: CardId[] = [];
      for (let i = 0; i < instr.n && pool.length > 0; i++) {
        const index = t.random((rng) => nextInt(rng, pool.length));
        const [taken] = pool.splice(index, 1);
        if (taken) picked.push(taken);
      }
      return { kind: 'ok', frame: withVars(frame, { [instr.as]: picked }) };
    }
    case 'extraTurn':
      t.emit({ type: 'extraTurnQueued', seat });
      return { kind: 'ok', frame };
    case 'skipTurn': {
      const target = instr.who === 'opponent' ? opponentOf(seat) : seat;
      t.emit({ type: 'turnSkipped', seat: target });
      return { kind: 'ok', frame };
    }
    case 'cantLose':
      t.emit({ type: 'cantLoseChanged', seats: [...new Set([...t.state.cantLose, seat])] });
      return { kind: 'ok', frame };
    case 'refresh':
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => ({ ...card, placement: 'reserved' }));
      }
      return { kind: 'ok', frame };
    case 'maneuver':
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => ({
          ...card,
          maneuvered: true,
          modifiers: [...card.modifiers, { attack: 3, defense: 3, until: 'endOfTurn' }],
        }));
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    case 'equip': {
      const created = createTokens(t, seat, instr.name, 1, 'ex');
      const host = idsOf(frame, instr.cards)[0];
      const gear = created[0];
      if (host && gear) {
        updateFieldCard(t, host, (card) => ({ ...card, equipped: [...card.equipped, gear] }));
      }
      return { kind: 'ok', frame };
    }
    case 'fuse': {
      const candidates = t.state.seats[seat].hand.filter((id) =>
        matchesFilter(t.state, id, instr.filter, frame.source),
      );
      const n = Math.min(instr.n, candidates.length);
      return {
        kind: 'prompt',
        prompt: {
          kind: 'selectCards',
          seat,
          label: `Fuse ${n}`,
          candidates,
          previews: candidates.map((id) => refOf(t.state, id)),
          min: n,
          max: n,
          where: 'mat',
        },
      };
    }
    case 'changeMaxPlayPoints': {
      const target = instr.who === 'opponent' ? opponentOf(seat) : seat;
      setResource(
        t,
        target,
        'maxPlayPoints',
        t.state.seats[target].resources.maxPlayPoints + instr.delta,
      );
      return { kind: 'ok', frame };
    }
    case 'orderCards': {
      const cards = idsOf(frame, instr.cards);
      return {
        kind: 'prompt',
        prompt: {
          kind: 'orderCards',
          seat,
          label: 'Order these cards',
          candidates: cards,
          previews: cards.map((id) => refOf(t.state, id)),
        },
      };
    }
    case 'superEvolve':
      evolveFollower(t, seat, frame.source, { superEvolve: true, useEvolutionPoint: false });
      return { kind: 'ok', frame };
    case 'ungrant':
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => ({
          ...card,
          granted: card.granted.filter((grant) => !instr.keywords.includes(grant.keyword)),
        }));
      }
      refreshDerived(t);
      return { kind: 'ok', frame };
    case 'reveal': {
      const cards = idsOf(frame, instr.cards);
      if (cards.length > 0) t.emit({ type: 'cardsRevealed', seat, cards });
      return { kind: 'ok', frame };
    }
    case 'forEach':
      return { kind: 'ok', frame };
    case 'bind':
      return { kind: 'ok', frame: withVars(frame, { [instr.as]: instr.value }) };
    case 'grantAbility':
      for (const id of idsOf(frame, instr.cards)) {
        updateFieldCard(t, id, (card) => ({
          ...card,
          grantedAbilities: [
            ...card.grantedAbilities,
            { ability: instr.ability, until: instr.until ?? null },
          ],
        }));
      }
      return { kind: 'ok', frame };
    default:
      return { kind: 'ok', frame };
  }
}

export function answerFamilyOp(
  t: Transcript,
  frame: ResolveAbilityFrame,
  instr: Instr,
  prompt: Prompt,
  intent: Intent,
): FamilyAnswer {
  const seat = frame.seat;
  switch (instr.op) {
    case 'declareNumber':
    case 'chooseNumber': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'number') return REJECTED;
      if (prompt.kind !== 'chooseNumber') return REJECTED;
      if (intent.choice.value < prompt.min || intent.choice.value > prompt.max) return REJECTED;
      t.emit({ type: 'numberDeclared', seat, value: intent.choice.value });
      return { accepted: true, frame: withVars(frame, { [instr.as]: intent.choice.value }) };
    }
    case 'declareName': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'name') return REJECTED;
      t.emit({ type: 'nameDeclared', seat, value: intent.choice.value });
      return { accepted: true, frame: withVars(frame, { [instr.as]: intent.choice.value }) };
    }
    case 'orderCards': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'order') return REJECTED;
      if (prompt.kind !== 'orderCards') return REJECTED;
      return { accepted: true, frame: withVars(frame, { [instr.as]: intent.choice.cards }) };
    }
    case 'fuse': {
      if (intent.type !== 'choose' || intent.choice.kind !== 'selectCards') return REJECTED;
      if (prompt.kind !== 'selectCards') return REJECTED;
      const picked = intent.choice.cards;
      for (const id of picked) {
        const from = locate(t.state, id);
        if (!from) continue;
        moveCards(t, {
          owner: seat,
          cards: [id],
          from,
          to: { zone: 'cemetery', seat },
          cause: 'bury',
        });
      }
      t.emit({
        type: 'flagsChanged',
        seat,
        flags: {
          ...t.state.seats[seat].flags,
          fusedThisTurn: t.state.seats[seat].flags.fusedThisTurn + 1,
        },
      });
      return { accepted: true, frame: withVars(frame, { fused: picked }) };
    }
    default:
      return REJECTED;
  }
}
