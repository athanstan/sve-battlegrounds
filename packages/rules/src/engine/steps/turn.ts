import { opponentOf, type CardId, type Seat } from '../../model/ids';
import { confirmationTiming } from '../confirmation';
import { activeSeat, firstSeat } from '../queries';
import { addMaxPlayPoints, draw, engage, refreshField, setResource } from '../verbs';
import { accepted, REJECTED, stayed, type Step } from './step';
import { legalMainOptions } from '../options';
import { pushWork } from '../stack';
import { evolveFollower, serveFollower } from '../evolve';
import { moveCards, payPlayPoints, updateFieldCard, zoneOf } from '../move';
import { refreshDerived } from '../derived';
import { definitionOf } from '../../state/state';
import { pushResolveAbility } from '../frames/ability';
import { costParts } from '../../abilities/costs';
import type { Cost } from '../../abilities/spec';
import { matchesFilter } from '../../abilities/filters';
import type { Transcript } from '../transcript';

function payAbilityCost(t: Transcript, seat: Seat, card: CardId, cost: Cost): void {
  for (const part of costParts(cost)) {
    if ('playPoints' in part) payPlayPoints(t, seat, part.playPoints);
    if ('engage' in part) engage(t, seat, [card]);
    if ('burySelf' in part) {
      const from = zoneOf(t.state, card);
      const owner = t.state.cards[card]?.owner ?? seat;
      moveCards(t, {
        owner,
        cards: [card],
        from,
        to: { zone: 'cemetery', seat: owner },
        cause: 'bury',
      });
    }
    if ('leaderDefense' in part) {
      t.emit({
        type: 'leaderDefenseChanged',
        seat,
        defense: Math.max(0, t.state.seats[seat].leader.defense - part.leaderDefense),
      });
    }
    if ('discard' in part) {
      const candidates = t.state.seats[seat].hand.filter((id) =>
        matchesFilter(t.state, id, part.discard.filter, card),
      );
      const picked = candidates.slice(0, part.discard.n);
      if (picked.length > 0) {
        moveCards(t, {
          owner: seat,
          cards: picked,
          from: { zone: 'hand', seat },
          to: { zone: 'cemetery', seat },
          cause: 'discard',
        });
      }
    }
    if ('lesson' in part) {
      const items = t.state.seats[seat].ex.filter((id) => {
        const def = definitionOf(t.state, id);
        return (
          def.name.toLowerCase().includes('magical item') || def.traits.includes('Magical Item')
        );
      });
      for (const id of items.slice(0, part.lesson)) {
        moveCards(t, {
          owner: seat,
          cards: [id],
          from: { zone: 'ex', seat },
          to: { zone: 'banished', seat },
          cause: 'banish',
        });
      }
    }
    if ('counters' in part) {
      updateFieldCard(t, card, (field) => {
        const have = field.counters[part.counters.name] ?? 0;
        return {
          ...field,
          counters: {
            ...field.counters,
            [part.counters.name]: Math.max(0, have - part.counters.n),
          },
        };
      });
    }
    if ('banish' in part) {
      const zone = part.banish.from?.zone ?? 'field';
      const pool =
        zone === 'ex'
          ? t.state.seats[seat].ex
          : zone === 'hand'
            ? t.state.seats[seat].hand
            : t.state.seats[seat].field.map((entry) => entry.id);
      const picked = pool
        .filter((id) => matchesFilter(t.state, id, part.banish.filter, card))
        .slice(0, part.banish.n);
      for (const id of picked) {
        const from = zoneOf(t.state, id);
        const owner = t.state.cards[id]?.owner ?? seat;
        moveCards(t, {
          owner,
          cards: [id],
          from,
          to: { zone: 'banished', seat: owner },
          cause: 'banish',
        });
      }
    }
    if ('bury' in part) {
      const zone = part.bury.from?.zone ?? 'field';
      const pool =
        zone === 'hand'
          ? t.state.seats[seat].hand
          : zone === 'ex'
            ? t.state.seats[seat].ex
            : t.state.seats[seat].field.map((entry) => entry.id);
      const picked = pool
        .filter((id) => id !== card && matchesFilter(t.state, id, part.bury.filter, card))
        .slice(0, part.bury.n);
      for (const id of picked) {
        const from = zoneOf(t.state, id);
        const owner = t.state.cards[id]?.owner ?? seat;
        moveCards(t, {
          owner,
          cards: [id],
          from,
          to: { zone: 'cemetery', seat: owner },
          cause: 'bury',
        });
      }
    }
    if ('fuse' in part) {
      const picked = t.state.seats[seat].hand
        .filter((id) => id !== card && matchesFilter(t.state, id, part.fuse.filter, card))
        .slice(0, part.fuse.n);
      if (picked.length > 0) {
        moveCards(t, {
          owner: seat,
          cards: picked,
          from: { zone: 'hand', seat },
          to: { zone: 'cemetery', seat },
          cause: 'bury',
        });
      }
    }
    if ('engageOther' in part) {
      const other = t.state.seats[seat].field
        .filter(
          (entry) =>
            entry.id !== card &&
            entry.placement === 'reserved' &&
            matchesFilter(t.state, entry.id, part.engageOther, card),
        )
        .map((entry) => entry.id)
        .slice(0, 1);
      if (other.length > 0) engage(t, seat, other);
    }
  }
}

/** Start phase (7.2). Seat selection lives here so skip/extra turns can hook it later (5.26, 5.28). */
export const startPhaseStep: Step = {
  id: 'turn/start',

  run(t) {
    const { state } = t;
    const first = firstSeat(state);
    const seat =
      state.extraTurns > 0 && state.active !== null
        ? state.active
        : (() => {
            const next = state.active === null ? first : opponentOf(state.active);
            return state.skipTurns[next] > 0 ? opponentOf(next) : next;
          })();
    const turnsPassed = state.seats[seat].resources.turnsPassed + 1; // 3.3.2

    t.emit({ type: 'turnStarted', seat, turn: state.turn + 1, turnsPassed });
    t.emit({ type: 'durationsEnded', seat, until: 'startOfYourNextTurn' });
    t.emit({ type: 'timingReached', point: 'startOfTurn', seat });
    t.emit({ type: 'phaseStarted', phase: 'start' });

    addMaxPlayPoints(t, seat, 1); // 7.2.1 (never above 10, 3.2.4.1)
    setResource(t, seat, 'playPoints', t.state.seats[seat].resources.maxPlayPoints); // 7.2.2
    refreshField(t, seat); // 7.2.3
    refreshDerived(t);
    const skipsDraw = seat === first && turnsPassed === 1; // 7.2.4.1
    if (!skipsDraw) draw(t, seat, 1, 'turn'); // 7.2.4
    confirmationTiming(t); // 7.2.5
    return null;
  },

  next: () => 'turn/main',
};

/**
 * Main phase (7.3). The active player picks one intent; every intent but ending the phase is
 * followed by Confirmation Timing and the same prompt again (7.3.4).
 */
export const mainPhaseStep: Step = {
  id: 'turn/main',

  run(t) {
    const seat = activeSeat(t.state);
    if (!t.state.seats[seat].flags.mainPhaseStarted) {
      t.emit({ type: 'phaseStarted', phase: 'main' });
      t.emit({ type: 'timingReached', point: 'startOfMainPhase', seat });
      t.emit({
        type: 'flagsChanged',
        seat,
        flags: { ...t.state.seats[seat].flags, mainPhaseStarted: true },
      });
      confirmationTiming(t); // 7.3.2
    }
    if (t.state.outcome) return null;
    return { kind: 'main', seat, options: legalMainOptions(t.state, seat) };
  },

  answer(t, prompt, intent) {
    if (prompt.kind !== 'main') return REJECTED;
    if (intent.type === 'pass') return accepted();
    const option = prompt.options.find((entry) => {
      if (intent.type === 'play') return entry.type === 'play' && entry.card === intent.card;
      if (intent.type === 'attack') {
        return (
          entry.type === 'attack' &&
          entry.attacker === intent.attacker &&
          entry.target === intent.target
        );
      }
      if (intent.type === 'evolve') {
        return (
          entry.type === 'evolve' &&
          entry.card === intent.card &&
          entry.superEvolve === intent.superEvolve &&
          entry.useEvolutionPoint === intent.useEvolutionPoint
        );
      }
      if (intent.type === 'activate') {
        return (
          entry.type === 'activate' &&
          entry.card === intent.card &&
          entry.ability === intent.ability
        );
      }
      return false;
    });
    if (!option) return REJECTED;

    if (intent.type === 'play' && option.type === 'play') {
      pushWork(t, {
        kind: 'playCard',
        seat: prompt.seat,
        card: intent.card,
        from: option.from,
        stage: 'specify',
        abilityKey: null,
        vars: {},
        chosenModes: [],
        paidWithEvolutionPoint: false,
      });
      return stayed();
    }
    if (intent.type === 'attack' && option.type === 'attack') {
      pushWork(t, {
        kind: 'attack',
        seat: prompt.seat,
        attacker: intent.attacker,
        target: intent.target,
        stage: 'declare',
      });
      return stayed();
    }
    if (intent.type === 'evolve' && option.type === 'evolve') {
      evolveFollower(t, prompt.seat, intent.card, {
        superEvolve: intent.superEvolve,
        useEvolutionPoint: intent.useEvolutionPoint,
      });
      confirmationTiming(t);
      return stayed();
    }
    if (intent.type === 'activate' && option.type === 'activate') {
      if (intent.ability === 'serve' || intent.ability === 'serve-ep') {
        serveFollower(t, prompt.seat, intent.card, {
          useEvolutionPoint: intent.ability === 'serve-ep',
        });
        confirmationTiming(t);
        return stayed();
      }
      const def = definitionOf(t.state, intent.card);
      const evolved = t.state.scripts[def.id];
      const script =
        evolved ??
        t.state.scripts[t.state.defs[t.state.cards[intent.card]?.def ?? def.id]?.id ?? def.id];
      const ability = script?.abilities.find(
        (entry) => entry.kind === 'activated' && entry.key === intent.ability,
      );
      if (ability?.kind !== 'activated') return REJECTED;
      t.emit({
        type: 'flagsChanged',
        seat: prompt.seat,
        flags: {
          ...t.state.seats[prompt.seat].flags,
          pendingCounts: {
            ...t.state.seats[prompt.seat].flags.pendingCounts,
            [ability.key]: (t.state.seats[prompt.seat].flags.pendingCounts[ability.key] ?? 0) + 1,
          },
        },
      });
      payAbilityCost(t, prompt.seat, intent.card, ability.cost);
      pushResolveAbility(t, {
        seat: prompt.seat,
        source: intent.card,
        sourceDef: def.id,
        abilityKey: ability.key,
      });
      return stayed();
    }
    return REJECTED;
  },

  next: () => 'turn/end/wards',
};
