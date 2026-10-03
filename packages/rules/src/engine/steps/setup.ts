import {
  OPENING_HAND_SIZE,
  STARTING_EVOLUTION_POINTS,
  STARTING_SUPER_EVOLUTION_POINTS,
} from '../../model/limits';
import { opponentOf } from '../../model/ids';
import type { GameStartSeat } from '../../events/events';
import { firstSeat, secondSeat } from '../queries';
import { draw } from '../verbs';
import { accepted, REJECTED, type Step } from './step';

/** 6.2.1.6-6.2.1.7: the randomly picked seat chooses turn order, then everyone draws four. */
export const turnOrderStep: Step = {
  id: 'setup/turnOrder',

  run(t) {
    const { turnOrderChooser } = t.state;
    if (turnOrderChooser === null) throw new Error('A turn-order chooser must be picked first');
    return { kind: 'turnOrder', seat: turnOrderChooser };
  },

  answer(t, prompt, intent) {
    if (prompt.kind !== 'turnOrder') return REJECTED;
    if (intent.type !== 'choose' || intent.choice.kind !== 'turnOrder') return REJECTED;

    const first = intent.choice.goFirst ? prompt.seat : opponentOf(prompt.seat);
    t.emit({ type: 'turnOrderChosen', first });
    draw(t, first, OPENING_HAND_SIZE, 'opening');
    draw(t, opponentOf(first), OPENING_HAND_SIZE, 'opening');
    return accepted();
  },

  next: () => 'setup/mulligan/first',
};

/**
 * 6.2.1.8: the first player may put their whole hand on the bottom of the deck and redraw
 * four, then the second player may. Each seat gets this exactly once.
 *
 * The rules let the hand go to the bottom "in any order"; we keep the order it was held in,
 * which is one of the permitted orders and is not worth a prompt of its own.
 */
function mulliganStep(order: 'first' | 'second'): Step {
  return {
    id: `setup/mulligan/${order}`,

    run(t) {
      const seat = order === 'first' ? firstSeat(t.state) : secondSeat(t.state);
      return { kind: 'mulligan', seat };
    },

    answer(t, prompt, intent) {
      if (prompt.kind !== 'mulligan') return REJECTED;
      if (intent.type !== 'choose' || intent.choice.kind !== 'mulligan') return REJECTED;

      const { redraw } = intent.choice;
      t.emit({ type: 'mulliganDecided', seat: prompt.seat, redraw });
      if (redraw) {
        const hand = t.state.seats[prompt.seat].hand;
        t.emit({ type: 'cardsBottomed', seat: prompt.seat, cards: hand });
        draw(t, prompt.seat, OPENING_HAND_SIZE, 'redraw');
      }
      return accepted();
    },

    next: () => (order === 'first' ? 'setup/mulligan/second' : 'setup/start'),
  };
}

export const firstMulliganStep = mulliganStep('first');
export const secondMulliganStep = mulliganStep('second');

/**
 * 6.2.1.9-6.2.1.14: play points are already 0 and leader defense is already set when the
 * match is created; what remains is the evolution and super-evolution points, which depend
 * on who goes first. The first player then becomes the active player (see `turn/start`).
 */
export const startGameStep: Step = {
  id: 'setup/start',

  run(t) {
    const first = firstSeat(t.state);
    const pointsFor = (seat: 0 | 1): GameStartSeat => ({
      evolutionPoints:
        seat === first ? STARTING_EVOLUTION_POINTS.first : STARTING_EVOLUTION_POINTS.second,
      superEvolutionPoints: STARTING_SUPER_EVOLUTION_POINTS,
    });
    t.emit({ type: 'gameStarted', seats: [pointsFor(0), pointsFor(1)] });
    t.emit({ type: 'timingReached', point: 'afterMulligan', seat: first });
    return null;
  },

  next: () => 'turn/start',
};
