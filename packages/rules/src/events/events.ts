import type { CardDefinition } from '../model/cards';
import type { CardId, CardDefId, CardRef, Seat } from '../model/ids';
import type { RngState } from '../rng';
import type { CardScript } from '../abilities/spec';
import type {
  DelayedTrigger,
  Duration,
  FieldCard,
  GameOverReason,
  GrantedKeyword,
  MainOption,
  Modifier,
  Outcome,
  Phase,
  Placement,
  Prompt,
  ResourceName,
  ShownStats,
  StepId,
  TimingPoint,
  TurnFlags,
} from '../state/state';
import type { WorkFrame } from '../state/work';
import type { MoveCause, ZoneRef } from '../state/zones-model';

/**
 * Engine events are the *only* way match state changes. They carry full information; what a
 * given viewer may see of them is decided by `projectEvent`, never here.
 *
 * Events marked "server-only" are bookkeeping that no client ever receives.
 */

export interface SeatSetup {
  readonly leader: CardRef;
  /** Starting leader defense (2.8.3.1, 6.2.1.12). */
  readonly leaderDefense: number;
  /** Main deck in deck-list order, before shuffling. */
  readonly deck: readonly CardRef[];
  readonly evolve: readonly CardRef[];
}

export type DrawCause = 'opening' | 'redraw' | 'turn' | 'effect';

export type EngineEvent =
  /** Presents leaders and decks (6.2.1.1-6.2.1.5). Always the first event of a match. */
  | {
      readonly type: 'matchCreated';
      readonly seed: string;
      readonly defs: readonly CardDefinition[];
      readonly seats: readonly [SeatSetup, SeatSetup];
      readonly scripts: readonly CardScript[];
      readonly tokens: readonly CardDefinition[];
    }
  /** Server-only: the random stream moved on. */
  | { readonly type: 'rngAdvanced'; readonly rng: RngState }
  /** The new order is private to the server; clients only learn that a shuffle happened. */
  | { readonly type: 'deckShuffled'; readonly seat: Seat; readonly order: readonly CardId[] }
  /** A random seat gets to decide who goes first (6.2.1.6). */
  | { readonly type: 'turnOrderChooserPicked'; readonly seat: Seat }
  | { readonly type: 'turnOrderChosen'; readonly first: Seat }
  | {
      readonly type: 'cardsDrawn';
      readonly seat: Seat;
      readonly cards: readonly CardId[];
      readonly cause: DrawCause;
    }
  /** Mulligan (6.2.1.8): the hand goes to the bottom of the deck, in the order given. */
  | { readonly type: 'cardsBottomed'; readonly seat: Seat; readonly cards: readonly CardId[] }
  | { readonly type: 'mulliganDecided'; readonly seat: Seat; readonly redraw: boolean }
  /** Evolution and super-evolution points depend on turn order (6.2.1.10, 6.2.1.11). */
  | { readonly type: 'gameStarted'; readonly seats: readonly [GameStartSeat, GameStartSeat] }
  | {
      readonly type: 'turnStarted';
      readonly seat: Seat;
      readonly turn: number;
      readonly turnsPassed: number;
    }
  | { readonly type: 'phaseStarted'; readonly phase: Phase }
  | { readonly type: 'timingReached'; readonly point: TimingPoint; readonly seat: Seat }
  /** `value` is the final, already-clamped value (3.2.4). */
  | {
      readonly type: 'resourceChanged';
      readonly seat: Seat;
      readonly resource: ResourceName;
      readonly value: number;
    }
  /** Engaged cards of the seat that were turned back to reserved (7.2.3). */
  | { readonly type: 'fieldRefreshed'; readonly seat: Seat; readonly cards: readonly CardId[] }
  | { readonly type: 'cardsDiscarded'; readonly seat: Seat; readonly cards: readonly CardId[] }
  | { readonly type: 'wardsEngaged'; readonly seat: Seat; readonly cards: readonly CardId[] }
  /** A draw was required from an empty deck; rules handling will resolve the loss (5.10.1.1). */
  | { readonly type: 'drewFromEmptyDeck'; readonly seat: Seat }
  | {
      readonly type: 'cardsMoved';
      readonly owner: Seat;
      readonly cards: readonly CardId[];
      readonly from: ZoneRef;
      readonly to: ZoneRef;
      readonly cause: MoveCause;
      readonly faceDown?: boolean;
      readonly placement?: Placement;
      readonly enteredTurn?: number;
      readonly linkedTo?: CardId;
      readonly superEvolved?: boolean;
      readonly position?: 'top' | 'bottom';
    }
  | { readonly type: 'cardsRevealed'; readonly seat: Seat; readonly cards: readonly CardId[] }
  | {
      readonly type: 'fieldCardUpdated';
      readonly seat: Seat;
      readonly card: CardId;
      readonly field: FieldCard;
    }
  | { readonly type: 'leaderDefenseChanged'; readonly seat: Seat; readonly defense: number }
  | {
      readonly type: 'durationsEnded';
      readonly seat: Seat;
      readonly until: Exclude<Duration, null>;
    }
  | {
      readonly type: 'cardPlayed';
      readonly seat: Seat;
      readonly card: CardId;
      readonly from: 'hand' | 'ex';
    }
  | {
      readonly type: 'tokenCreated';
      readonly seat: Seat;
      readonly cards: readonly CardRef[];
      readonly zone: 'field' | 'ex' | 'resolution';
      readonly enteredTurn?: number;
    }
  | { readonly type: 'tokenEliminated'; readonly cards: readonly CardId[] }
  | {
      readonly type: 'followerEvolved';
      readonly seat: Seat;
      readonly fieldCard: CardId;
      readonly evolveCard: CardId;
      readonly superEvolved: boolean;
    }
  | {
      readonly type: 'followerRaced';
      readonly seat: Seat;
      readonly fieldCard: CardId;
      readonly carrot: CardId;
      readonly times: number;
    }
  | {
      readonly type: 'damageDealt';
      readonly source: CardId | null;
      readonly target: CardId | 'leader';
      readonly targetSeat: Seat;
      readonly amount: number;
      readonly combat: boolean;
    }
  | {
      readonly type: 'attackDeclared';
      readonly seat: Seat;
      readonly attacker: CardId;
      readonly target: CardId | 'leader';
    }
  | { readonly type: 'attackEnded'; readonly seat: Seat; readonly attacker: CardId }
  | {
      readonly type: 'abilityPending';
      readonly id: number;
      readonly seat: Seat;
      readonly source: CardId;
      readonly sourceDef: CardDefId;
      readonly abilityKey: string;
      readonly triggerSeq: number;
      readonly vars?: Readonly<Record<string, unknown>>;
    }
  | { readonly type: 'abilityResolved'; readonly id: number }
  | { readonly type: 'abilityDropped'; readonly id: number }
  | { readonly type: 'delayedQueued'; readonly delayed: DelayedTrigger }
  | { readonly type: 'delayedConsumed'; readonly id: number }
  | {
      readonly type: 'carrotsTurned';
      readonly seat: Seat;
      readonly cards: readonly CardId[];
      readonly faceUp: boolean;
    }
  | { readonly type: 'fought'; readonly a: CardId; readonly b: CardId }
  | { readonly type: 'promptOpened'; readonly prompt: Prompt }
  | { readonly type: 'promptClosed'; readonly promptId: number }
  | { readonly type: 'turnEnded'; readonly seat: Seat }
  | { readonly type: 'gameEnded'; readonly outcome: Outcome }
  /** Server-only: the match script moved to a new step. */
  | { readonly type: 'stepChanged'; readonly step: StepId }
  /** Server-only: nested procedure stack. */
  | { readonly type: 'workPushed'; readonly frame: WorkFrame }
  | { readonly type: 'workPopped' }
  | { readonly type: 'workUpdated'; readonly frame: WorkFrame }
  | { readonly type: 'flagsChanged'; readonly seat: Seat; readonly flags: TurnFlags }
  | {
      readonly type: 'instanceBuffed';
      readonly card: CardId;
      readonly modifier?: Modifier;
      readonly grants?: readonly GrantedKeyword[];
    }
  | {
      readonly type: 'costDeltaApplied';
      readonly card: CardId;
      readonly amount: number;
      readonly until: Duration;
    }
  | { readonly type: 'extraTurnQueued'; readonly seat: Seat }
  | { readonly type: 'turnSkipped'; readonly seat: Seat }
  | { readonly type: 'dieRolled'; readonly seat: Seat; readonly value: number; readonly sides: number }
  | { readonly type: 'numberDeclared'; readonly seat: Seat; readonly value: number }
  | { readonly type: 'nameDeclared'; readonly seat: Seat; readonly value: string }
  | { readonly type: 'cantLoseChanged'; readonly seats: readonly Seat[] };

export interface GameStartSeat {
  readonly evolutionPoints: number;
  readonly superEvolutionPoints: number;
}

export type EngineEventType = EngineEvent['type'];

/** An event with its position in the match log. */
export interface LoggedEvent {
  readonly seq: number;
  readonly event: EngineEvent;
}

export type { MainOption, ShownStats, TimingPoint, GameOverReason, MoveCause };
