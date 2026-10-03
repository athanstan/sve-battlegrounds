import { opponentOf } from '../../model/ids';
import { confirmationTiming } from '../confirmation';
import { activeSeat, firstSeat } from '../queries';
import { addMaxPlayPoints, draw, refreshField, setResource } from '../verbs';
import { accepted, REJECTED, stayed, type Step } from './step';
import { legalMainOptions } from '../options';
import { pushWork } from '../stack';
import { evolveFollower, serveFollower } from '../evolve';
import { payPlayPoints } from '../move';
import { refreshDerived } from '../derived';
import { definitionOf } from '../../state/state';
import { pushResolveAbility } from '../frames/ability';

/** Start phase (7.2). Seat selection lives here so skip/extra turns can hook it later (5.26, 5.28). */
export const startPhaseStep: Step = {
  id: 'turn/start',

  run(t) {
    const { state } = t;
    const first = firstSeat(state);
    const seat = state.active === null ? first : opponentOf(state.active);
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
      if ('playPoints' in ability.cost) payPlayPoints(t, prompt.seat, ability.cost.playPoints);
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
