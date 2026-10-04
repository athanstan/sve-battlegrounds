import {
  assertNever,
  type CardRef,
  type ClientEvent,
  type ResourceName,
  type Seat,
} from '@sve/rules';

/**
 * Events as the playmat uses them.
 *
 * Where cards go is decided by diffing one layout against the next, never by replaying events:
 * the picture is always the view, so a skipped or reordered animation cannot leave the board
 * wrong. Events are only for things a view cannot say - that a shuffle happened, that a draw
 * failed, that a resource just changed rather than being shown for the first time.
 */

export type Cue =
  | { readonly kind: 'shuffle'; readonly seat: Seat }
  | { readonly kind: 'emptyDeck'; readonly seat: Seat }
  | { readonly kind: 'resource'; readonly seat: Seat; readonly resource: ResourceName }
  | { readonly kind: 'turn'; readonly seat: Seat }
  | { readonly kind: 'gameOver' }
  | { readonly kind: 'reveal'; readonly seat: Seat; readonly cards: readonly CardRef[] };

const NONE: readonly Cue[] = [];

/**
 * What the board does about one event. Exhaustive: adding an event to the rules fails the build
 * here until someone decides whether the mat reacts to it.
 */
export function cuesFor(event: ClientEvent): readonly Cue[] {
  switch (event.type) {
    case 'matchCreated':
    case 'cardsDrawn':
    case 'cardsBottomed':
    case 'cardsDiscarded':
    case 'fieldRefreshed':
    case 'wardsEngaged':
    case 'cardsMoved':
    case 'fieldCardUpdated':
    case 'leaderDefenseChanged':
    case 'durationsEnded':
    case 'cardPlayed':
    case 'tokenCreated':
    case 'tokenEliminated':
    case 'followerEvolved':
    case 'followerRaced':
    case 'damageDealt':
    case 'attackDeclared':
    case 'attackEnded':
    case 'fought':
    case 'abilityPending':
    case 'abilityResolved':
    case 'costDeltaApplied':
    case 'timingReached':
    case 'carrotsTurned':
      return NONE;

    case 'turnOrderChooserPicked':
    case 'turnOrderChosen':
    case 'mulliganDecided':
    case 'gameStarted':
    case 'phaseStarted':
    case 'promptOpened':
    case 'promptClosed':
    case 'turnEnded':
      return NONE;

    case 'deckShuffled':
      return [{ kind: 'shuffle', seat: event.seat }];
    case 'drewFromEmptyDeck':
      return [{ kind: 'emptyDeck', seat: event.seat }];
    case 'resourceChanged':
      return [{ kind: 'resource', seat: event.seat, resource: event.resource }];
    case 'turnStarted':
      return [{ kind: 'turn', seat: event.seat }];
    case 'gameEnded':
      return [{ kind: 'gameOver' }];
    case 'cardsRevealed':
      return [{ kind: 'reveal', seat: event.seat, cards: event.cards }];
    case 'dieRolled':
    case 'numberDeclared':
    case 'nameDeclared':
    case 'extraTurnQueued':
    case 'turnSkipped':
    case 'cantLoseChanged':
      return NONE;

    default:
      return assertNever(event, 'Unhandled client event');
  }
}

export const cuesFromEvents = (events: readonly ClientEvent[]): Cue[] =>
  events.flatMap((event) => cuesFor(event));
