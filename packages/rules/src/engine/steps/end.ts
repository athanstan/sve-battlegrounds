import { confirmationTiming } from '../confirmation';
import { activeSeat, areInterchangeable, isSelection, wardCandidates } from '../queries';
import { discard, engage } from '../verbs';
import type { Transcript } from '../transcript';
import { accepted, REJECTED, type PromptRequest, type Step } from './step';
import { opponentOf } from '../../model/ids';
import { legalQuickOptions } from '../options';
import { pushWork } from '../stack';
import { refreshDerived } from '../derived';

/**
 * End phase (7.4), in three steps because those are the places it can wait on a player.
 *
 *   7.4.1-7.4.4  triggers, Confirmation Timing, Ward engage, Confirmation Timing   -> wards
 *   7.4.5-7.4.6  non-active Quick window                                           -> (see below)
 *   7.4.7        discard down to the hand limit, repeated                          -> discard
 *   7.4.8-7.4.9  durations end, the turn passes                                    -> finish
 *
 * The Quick window is omitted until a Quick card or ability can be played: with nothing
 * playable the non-active player's only option is "do nothing", which is no answer at all,
 * so the rules require no prompt. It slots in between `wards` and `discard` with the play
 * pipeline.
 */

export const wardsStep: Step = {
  id: 'turn/end/wards',

  run(t) {
    t.emit({ type: 'phaseStarted', phase: 'end' });
    t.emit({ type: 'timingReached', point: 'startOfEndPhase', seat: activeSeat(t.state) });
    confirmationTiming(t); // 7.4.2
    if (t.state.outcome) return null;

    const seat = activeSeat(t.state);
    const candidates = wardCandidates(t.state, seat);
    return candidates.length > 0 ? { kind: 'engageWards', seat, candidates } : null;
  },

  answer(t, prompt, intent) {
    if (prompt.kind !== 'engageWards' || intent.type !== 'engageWards') return REJECTED;
    if (!isSelection(intent.cards, prompt.candidates)) return REJECTED;

    engage(t, prompt.seat, intent.cards); // 7.4.3: any number, including none
    confirmationTiming(t); // 7.4.4
    return accepted();
  },

  next: () => 'turn/end/quick',
};

/**
 * Discard down to the hand limit (7.4.7). When every candidate is a copy of the same card
 * no choice could matter, so the engine discards them itself and the player is not asked.
 */
function discardDownOrPrompt(t: Transcript): PromptRequest | null {
  for (;;) {
    if (t.state.outcome) return null;
    const seat = activeSeat(t.state);
    const { hand, limits } = t.state.seats[seat];
    const excess = hand.length - limits.hand;
    if (excess <= 0) return null;

    if (!areInterchangeable(t.state, hand)) {
      return { kind: 'discard', seat, count: excess, candidates: hand };
    }
    discard(t, seat, hand.slice(0, excess));
    confirmationTiming(t);
  }
}

/**
 * Non-active Quick window (7.4.5-7.4.6). Skipped while no Quick option is legal; the window
 * itself is a work frame once cards with Quick exist (Phase 6).
 */
export const endQuickStep: Step = {
  id: 'turn/end/quick',

  run(t) {
    const defender = opponentOf(activeSeat(t.state));
    const options = legalQuickOptions(t.state, defender);
    if (options.length === 0) return null; // accepted info leak: skipped when nothing is playable
    pushWork(t, { kind: 'quickWindow', seat: defender, cause: 'endPhase' });
    return null;
  },

  next: () => 'turn/end/discard',
};

export const discardStep: Step = {
  id: 'turn/end/discard',

  run: discardDownOrPrompt,

  answer(t, prompt, intent) {
    if (prompt.kind !== 'discard') return REJECTED;
    if (intent.type !== 'choose' || intent.choice.kind !== 'discard') return REJECTED;
    if (!isSelection(intent.choice.cards, prompt.candidates, prompt.count)) return REJECTED;

    discard(t, prompt.seat, intent.choice.cards);
    confirmationTiming(t);
    return accepted(discardDownOrPrompt(t)); // 7.4.7: repeat while still over the limit
  },

  next: () => 'turn/end/cleanup',
};

/** 7.4.8: "until end of turn" / "during this turn" / "during your turn" effects end here. */
export const cleanupStep: Step = {
  id: 'turn/end/cleanup',

  run(t) {
    const seat = activeSeat(t.state);
    t.emit({ type: 'durationsEnded', seat, until: 'endOfTurn' });
    t.emit({ type: 'durationsEnded', seat, until: 'endOfYourTurn' });
    refreshDerived(t);
    return null;
  },

  next: () => 'turn/end/finish',
};

export const finishTurnStep: Step = {
  id: 'turn/end/finish',

  run(t) {
    // 7.4.8: "until end of turn" / "during this turn" effects end here - none exist yet.
    t.emit({ type: 'turnEnded', seat: activeSeat(t.state) }); // 7.4.9
    return null;
  },

  next: () => 'turn/start',
};
