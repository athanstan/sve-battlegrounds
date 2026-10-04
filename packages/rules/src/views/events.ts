import type { EngineEvent, DrawCause, MoveCause } from '../events/events';
import { assertNever, SEATS, type CardId, type CardRef, type Seat } from '../model/ids';
import type {
  Duration,
  FieldCard,
  Prompt,
  ShownStats,
  TimingPoint,
  TurnFlags,
} from '../state/state';
import type { MatchState } from '../state/state';
import { instanceShown } from '../state/shown';
import { isPublicZone, type ZoneRef } from '../state/zones-model';
import { cardRef, summarize } from './project';
import type { CountedZone, PromptSummary } from './view';
import { canSeeEvolveDeck, canSeeHand, isAddressedBy, type Viewer } from './viewer';

/**
 * Events as a particular viewer receives them. Public events pass through unchanged; the few
 * that carry hidden card ids are redacted: the count survives, the identities do not.
 */

/** Events whose payload is already safe for every viewer. */
const PUBLIC_EVENT_TYPES = [
  'turnOrderChooserPicked',
  'turnOrderChosen',
  'mulliganDecided',
  'gameStarted',
  'turnStarted',
  'phaseStarted',
  'timingReached',
  'resourceChanged',
  'fieldRefreshed',
  'wardsEngaged',
  'drewFromEmptyDeck',
  'leaderDefenseChanged',
  'cardPlayed',
  'tokenEliminated',
  'followerEvolved',
  'followerRaced',
  'damageDealt',
  'attackDeclared',
  'attackEnded',
  'fought',
  'abilityPending',
  'abilityResolved',
  'promptClosed',
  'turnEnded',
  'gameEnded',
  'costDeltaApplied',
  'carrotsTurned',
  'dieRolled',
  'numberDeclared',
  'nameDeclared',
  'extraTurnQueued',
  'turnSkipped',
  'cantLoseChanged',
] as const;

type PublicEventType = (typeof PUBLIC_EVENT_TYPES)[number];
type PublicEvent = Extract<EngineEvent, { type: PublicEventType }>;

const isPublicEvent = (event: EngineEvent): event is PublicEvent =>
  (PUBLIC_EVENT_TYPES as readonly string[]).includes(event.type);

export interface SeatIntro {
  readonly leader: CardRef;
  readonly leaderDefense: number;
  readonly deckCount: number;
  /** Faces only for the owner (4.6.2). */
  readonly evolve: CountedZone;
}

export type ClientEvent =
  | PublicEvent
  | {
      readonly type: 'matchCreated';
      readonly viewer: Viewer;
      readonly seats: readonly [SeatIntro, SeatIntro];
    }
  /** Private order stays on the server; viewers learn only that a shuffle happened. */
  | { readonly type: 'deckShuffled'; readonly seat: Seat }
  | {
      readonly type: 'cardsDrawn';
      readonly seat: Seat;
      readonly count: number;
      /** Identities, only for viewers who can see that hand. */
      readonly cards: readonly CardRef[] | null;
      readonly cause: DrawCause;
    }
  | {
      readonly type: 'cardsBottomed';
      readonly seat: Seat;
      readonly count: number;
      readonly cards: readonly CardId[] | null;
    }
  /** The cemetery is public (4.9.2), so discards are fully visible. */
  | { readonly type: 'cardsDiscarded'; readonly seat: Seat; readonly cards: readonly CardRef[] }
  | {
      readonly type: 'promptOpened';
      readonly waitingOn: PromptSummary;
      /** Full details, only for the seat the prompt is addressed to. */
      readonly prompt: Prompt | null;
    }
  | {
      readonly type: 'cardsMoved';
      readonly owner: Seat;
      readonly count: number;
      readonly cards: readonly CardRef[] | null;
      readonly from: ZoneRef;
      readonly to: ZoneRef;
      readonly cause: MoveCause;
      readonly faceDown?: boolean;
      readonly placement?: FieldCard['placement'];
      readonly enteredTurn?: number;
      readonly linkedTo?: CardId;
      readonly superEvolved?: boolean;
      /** Live stats when the destination is EX (aligned with `cards`). */
      readonly shown?: readonly ShownStats[];
    }
  | { readonly type: 'cardsRevealed'; readonly seat: Seat; readonly cards: readonly CardRef[] }
  | {
      readonly type: 'fieldCardUpdated';
      readonly seat: Seat;
      readonly card: CardId;
      readonly shown: ShownStats;
      readonly placement: FieldCard['placement'];
      readonly racedTimes: number;
      readonly counters: Readonly<Record<string, number>>;
      readonly equipped: readonly CardRef[];
    }
  | {
      readonly type: 'tokenCreated';
      readonly seat: Seat;
      readonly cards: readonly CardRef[];
      readonly zone: 'field' | 'ex' | 'resolution';
      readonly enteredTurn?: number;
      /** Live stats when the tokens land in EX (aligned with `cards`). */
      readonly shown?: readonly ShownStats[];
    }
  | {
      readonly type: 'instanceBuffed';
      readonly card: CardId;
      readonly shown: ShownStats;
    }
  | {
      readonly type: 'durationsEnded';
      readonly seat: Seat;
      readonly until: Exclude<Duration, null>;
      readonly ex: readonly { readonly card: CardId; readonly shown: ShownStats }[];
    };

export type ClientEventType = ClientEvent['type'];

/** A projected event with its position in the match log. */
export interface ClientEnvelope {
  readonly seq: number;
  readonly event: ClientEvent;
}

const refs = (state: MatchState, ids: readonly CardId[]): CardRef[] =>
  ids.map((id) => cardRef(state, id));

const canSeeZone = (viewer: Viewer, ref: ZoneRef, faceDown = false): boolean => {
  if (isPublicZone(ref, faceDown)) return true;
  if (ref.zone === 'resolution') return true;
  if (ref.zone === 'hand') return canSeeHand(viewer, ref.seat);
  if (ref.zone === 'evolveDeck') return canSeeEvolveDeck(viewer, ref.seat);
  return false;
};

/**
 * Project one engine event for one viewer. `after` is the state once the event has been
 * applied; it is only used to look up the definition behind a card id the viewer may see.
 * Returns null for server-only bookkeeping.
 */
export function projectEvent(
  event: EngineEvent,
  viewer: Viewer,
  after: MatchState,
): ClientEvent | null {
  switch (event.type) {
    case 'rngAdvanced':
    case 'stepChanged':
    case 'workPushed':
    case 'workPopped':
    case 'workUpdated':
    case 'flagsChanged':
    case 'abilityDropped':
    case 'delayedQueued':
    case 'delayedConsumed':
    case 'playDiscountOffered':
    case 'playDiscountSpent':
      return null;

    case 'matchCreated': {
      const intro = (seat: Seat): SeatIntro => {
        const setup = event.seats[seat];
        return {
          leader: setup.leader,
          leaderDefense: setup.leaderDefense,
          deckCount: setup.deck.length,
          evolve: {
            count: setup.evolve.length,
            cards: canSeeEvolveDeck(viewer, seat) ? setup.evolve : null,
          },
        };
      };
      return { type: 'matchCreated', viewer, seats: [intro(0), intro(1)] };
    }

    case 'deckShuffled':
      return { type: 'deckShuffled', seat: event.seat };

    case 'cardsDrawn':
      return {
        type: 'cardsDrawn',
        seat: event.seat,
        count: event.cards.length,
        cards: canSeeHand(viewer, event.seat) ? refs(after, event.cards) : null,
        cause: event.cause,
      };

    case 'cardsBottomed':
      return {
        type: 'cardsBottomed',
        seat: event.seat,
        count: event.cards.length,
        cards: canSeeHand(viewer, event.seat) ? event.cards : null,
      };

    case 'cardsDiscarded':
      return { type: 'cardsDiscarded', seat: event.seat, cards: refs(after, event.cards) };

    case 'promptOpened':
      return {
        type: 'promptOpened',
        waitingOn: summarize(event.prompt),
        prompt: isAddressedBy(viewer, event.prompt.seat) ? event.prompt : null,
      };

    case 'cardsMoved': {
      const visible =
        canSeeZone(viewer, event.from, event.faceDown) ||
        canSeeZone(viewer, event.to, event.faceDown);
      const cards = visible ? refs(after, event.cards) : null;
      const shown =
        event.to.zone === 'ex' && cards
          ? cards.map((card) => instanceShown(after, card.id))
          : undefined;
      return {
        type: 'cardsMoved' as const,
        owner: event.owner,
        count: event.cards.length,
        cards,
        from: event.from,
        to: event.to,
        cause: event.cause,
        ...(event.faceDown !== undefined ? { faceDown: event.faceDown } : {}),
        ...(event.placement !== undefined ? { placement: event.placement } : {}),
        ...(event.enteredTurn !== undefined ? { enteredTurn: event.enteredTurn } : {}),
        ...(event.linkedTo !== undefined ? { linkedTo: event.linkedTo } : {}),
        ...(event.superEvolved !== undefined ? { superEvolved: event.superEvolved } : {}),
        ...(shown ? { shown } : {}),
      };
    }

    case 'cardsRevealed':
      return { type: 'cardsRevealed', seat: event.seat, cards: refs(after, event.cards) };

    case 'fieldCardUpdated':
      return {
        type: 'fieldCardUpdated',
        seat: event.seat,
        card: event.card,
        shown: event.field.shown,
        placement: event.field.placement,
        racedTimes: event.field.racedTimes,
        counters: event.field.counters,
        equipped: refs(after, event.field.equipped),
      };

    case 'tokenCreated':
      return {
        type: 'tokenCreated' as const,
        seat: event.seat,
        cards: event.cards,
        zone: event.zone,
        ...(event.enteredTurn !== undefined ? { enteredTurn: event.enteredTurn } : {}),
        ...(event.zone === 'ex'
          ? { shown: event.cards.map((card) => instanceShown(after, card.id)) }
          : {}),
      };

    case 'instanceBuffed': {
      if (!after.seats.some((seat) => seat.ex.includes(event.card))) return null;
      return {
        type: 'instanceBuffed' as const,
        card: event.card,
        shown: instanceShown(after, event.card),
      };
    }

    case 'durationsEnded':
      return {
        type: 'durationsEnded' as const,
        seat: event.seat,
        until: event.until,
        ex: SEATS.flatMap((seat) =>
          after.seats[seat].ex.map((id) => ({ card: id, shown: instanceShown(after, id) })),
        ),
      };

    default:
      if (isPublicEvent(event)) return event;
      return assertNever(event, 'Unhandled engine event');
  }
}

export type { TimingPoint, TurnFlags };
