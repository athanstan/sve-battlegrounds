import type { DrawCause } from '../events/events';
import type { CardId, Seat } from '../model/ids';
import { MAX_PLAY_POINTS_CEILING } from '../model/limits';
import type { MatchState, ResourceName } from '../state/state';
import type { Transcript } from './transcript';

/**
 * Engine-owned verbs, named as the rules name them. Scripts and steps pick a verb; only the
 * verb writes to zones (by emitting events). There is deliberately no generic "buff" or "heal".
 */

/** Draw (5.10): move the top card(s) of the deck to the hand. Zero or fewer draws nothing (1.3.2.2). */
export function draw(t: Transcript, seat: Seat, count: number, cause: DrawCause): void {
  if (count <= 0) return;
  const cards = t.state.seats[seat].deck.slice(0, count);
  if (cards.length > 0) t.emit({ type: 'cardsDrawn', seat, cards, cause });
  // Drawing the cards that exist still happens; the loss is handled at the next rules handling.
  if (cards.length < count) t.emit({ type: 'drewFromEmptyDeck', seat });
}

/** Discard (5.12): hand to cemetery. */
export function discard(t: Transcript, seat: Seat, cards: readonly CardId[]): void {
  if (cards.length > 0) t.emit({ type: 'cardsDiscarded', seat, cards });
}

/** Refresh (5.4): turn engaged field cards back to reserved. */
export function refreshField(t: Transcript, seat: Seat): void {
  const engaged = t.state.seats[seat].field
    .filter((card) => card.placement === 'engaged')
    .map((card) => card.id);
  if (engaged.length > 0) t.emit({ type: 'fieldRefreshed', seat, cards: engaged });
}

/** Engage (5.4): turn reserved field cards sideways. */
export function engage(t: Transcript, seat: Seat, cards: readonly CardId[]): void {
  if (cards.length > 0) t.emit({ type: 'wardsEngaged', seat, cards });
}

/** Limits from 3.2.4: play points live in [0, max play points], max play points in [0, 10]. */
function clampResource(
  state: MatchState,
  seat: Seat,
  resource: ResourceName,
  value: number,
): number {
  const resources = state.seats[seat].resources;
  switch (resource) {
    case 'maxPlayPoints':
      return Math.min(Math.max(value, 0), MAX_PLAY_POINTS_CEILING);
    case 'playPoints':
      return Math.min(Math.max(value, 0), resources.maxPlayPoints);
    case 'evolutionPoints':
    case 'superEvolutionPoints':
    case 'turnsPassed':
      return Math.max(value, 0);
  }
}

/** Set a resource, clamped to its limits. Emits nothing when the value would not change. */
export function setResource(
  t: Transcript,
  seat: Seat,
  resource: ResourceName,
  value: number,
): void {
  const clamped = clampResource(t.state, seat, resource, value);
  if (clamped === t.state.seats[seat].resources[resource]) return;
  t.emit({ type: 'resourceChanged', seat, resource, value: clamped });
}

/** Increase max play points (7.2.1), never above 10. */
export function addMaxPlayPoints(t: Transcript, seat: Seat, amount: number): void {
  if (amount <= 0) return;
  setResource(t, seat, 'maxPlayPoints', t.state.seats[seat].resources.maxPlayPoints + amount);
}
