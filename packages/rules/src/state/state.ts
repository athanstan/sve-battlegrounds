import type { CardDefinition, CardKind, Keyword } from '../model/cards';
import type { CardDefId, CardId, CardRef, Seat } from '../model/ids';
import type { RngState } from '../rng';
import type { Ability, CardScript, Instr } from '../abilities/spec';
import type { WorkFrame } from './work';
import type { ZoneRef } from './zones-model';

export type Phase = 'start' | 'main' | 'end';
export type Placement = 'reserved' | 'engaged';

/** How long a modifier, grant or cost delta lasts. `null` is permanent. */
export type Duration = 'endOfTurn' | 'endOfYourTurn' | 'startOfYourNextTurn' | null;

export type TimingPoint = 'startOfTurn' | 'startOfMainPhase' | 'startOfEndPhase' | 'afterMulligan';

/** Identity of one physical card. Immutable for the whole match (except tokens, which are minted). */
export interface CardInstance {
  readonly id: CardId;
  readonly def: CardDefId;
  readonly owner: Seat;
  readonly token: boolean;
  /** Survives zone changes until the turn ends (Cheval Grand). */
  readonly damagedThisTurnBy?: readonly CardId[];
  readonly modifiers?: readonly Modifier[];
  readonly granted?: readonly GrantedKeyword[];
  /** Snapshot taken when this card last left a zone (10.7.4, 10.11). */
  readonly lastKnown?: LastKnownInfo;
}

export interface LastKnownInfo {
  readonly zone: string;
  readonly seat?: Seat;
  readonly attack: number;
  readonly defense: number;
  readonly keywords: readonly Keyword[];
}

export interface Modifier {
  readonly attack: number;
  readonly defense: number;
  readonly until: Duration;
}

export interface GrantedKeyword {
  readonly keyword: Keyword;
  readonly until: Duration;
}

export interface CostDelta {
  readonly amount: number;
  readonly until: Duration;
}

export interface ShownStats {
  readonly attack: number;
  readonly defense: number;
  readonly keywords: readonly Keyword[];
}

/** Followers and amulets on a field (4.4). Order is not rules-relevant; array order is stable for display. */
export interface FieldCard {
  readonly id: CardId;
  readonly placement: Placement;
  /** Turn number on which it was put onto the field; drives attack eligibility (8.4.2.1). */
  readonly enteredTurn: number;
  readonly modifiers: readonly Modifier[];
  readonly granted: readonly GrantedKeyword[];
  /** Cumulative damage this card has taken while on the field (5.14.1). */
  readonly damageTaken: number;
  /** Sources that dealt damage to this follower this turn (Cheval Grand). */
  readonly damagedThisTurnBy: readonly CardId[];
  /** 10.9 snapshot, kept current by `refreshDerived`. */
  readonly shown: ShownStats;
  /** Times this follower has raced this turn (14.2.3). */
  readonly racedTimes: number;
  /** Last turn number this follower stays Boxed (loses abilities, does not refresh). */
  readonly boxedUntilTurn?: number;
  /** Named counters on this card (15.1). */
  readonly counters: Readonly<Record<string, number>>;
  /** Equipment stacked beneath this follower. */
  readonly equipped: readonly CardId[];
  /** Skip refresh through this turn number. */
  readonly skipRefreshUntilTurn?: number;
  /** Temporary type while Maneuver is in effect. */
  readonly maneuvered?: true;
  /** Printed type override (follower into amulet, and so on). */
  readonly kindOverride?: CardKind;
  /** Abilities granted to this card (quoted text, 10.9 ability-granting layer). */
  readonly grantedAbilities: readonly GrantedAbility[];
}

export interface GrantedAbility {
  readonly ability: Ability;
  readonly until: Duration;
}

export const fieldCard = (
  id: CardId,
  placement: Placement,
  enteredTurn: number,
  shown: ShownStats = { attack: 0, defense: 0, keywords: [] },
): FieldCard => ({
  id,
  placement,
  enteredTurn,
  modifiers: [],
  granted: [],
  damageTaken: 0,
  damagedThisTurnBy: [],
  shown,
  racedTimes: 0,
  counters: {},
  equipped: [],
  grantedAbilities: [],
});

export function isBoxed(card: Pick<FieldCard, 'boxedUntilTurn'>, turn: number): boolean {
  return (card.boxedUntilTurn ?? -1) >= turn;
}

/** A card in the evolve zone linked to a field card (4.12, 5.16). */
export interface EvolveLink {
  readonly card: CardId;
  readonly linkedTo: CardId;
  readonly superEvolved: boolean;
}

/** A Carrot in the race zone linked to a field card (4.13, 14.2.1). */
export interface RaceLink {
  readonly card: CardId;
  readonly linkedTo: CardId;
  readonly faceUp: boolean;
}

export interface BanishedCard {
  readonly id: CardId;
  readonly faceDown: boolean;
}

/** A card or ability sitting in the single shared resolution zone (4.11). */
export interface ResolutionEntry {
  readonly card: CardId;
  readonly controller: Seat;
}

export interface Resources {
  readonly playPoints: number;
  readonly maxPlayPoints: number;
  readonly evolutionPoints: number;
  readonly superEvolutionPoints: number;
  /** Times this player has begun a start phase as the active player (3.3). */
  readonly turnsPassed: number;
}

export type ResourceName = keyof Resources;

/** Play points and max play points start at 0 (6.2.1.9); the points that depend on turn order come later. */
export const ZERO_RESOURCES: Resources = {
  playPoints: 0,
  maxPlayPoints: 0,
  evolutionPoints: 0,
  superEvolutionPoints: 0,
  turnsPassed: 0,
};

/** Per-turn counters, reset when this seat begins a start phase. */
export interface TurnFlags {
  readonly cardsPlayed: number;
  readonly spellsPlayed: number;
  readonly evolvedThisTurn: boolean;
  readonly mainPhaseStarted: boolean;
  /** How many times each ability key became pending this turn (10.7.2.2). */
  readonly pendingCounts: Readonly<Record<string, number>>;
  readonly playedThisTurn: readonly CardId[];
  readonly leaderLostDefense: number;
  readonly followersAttacked: number;
  readonly ubExecuted: number;
  readonly chosenModes: readonly string[];
  readonly fusedThisTurn: number;
}

export const ZERO_TURN_FLAGS: TurnFlags = {
  cardsPlayed: 0,
  spellsPlayed: 0,
  evolvedThisTurn: false,
  mainPhaseStarted: false,
  pendingCounts: {},
  playedThisTurn: [],
  leaderLostDefense: 0,
  followersAttacked: 0,
  ubExecuted: 0,
  chosenModes: [],
  fusedThisTurn: 0,
};

export interface ZoneLimits {
  readonly hand: number;
  readonly field: number;
  readonly ex: number;
}

export interface SeatState {
  readonly leader: { readonly card: CardId; readonly defense: number };
  /** Non-public, ordered. Index 0 is the top of the deck. */
  readonly deck: readonly CardId[];
  /** Face-down evolve deck cards; the owner may look, order not tracked (4.6). */
  readonly evolveDeck: readonly CardId[];
  /** Evolve-deck cards placed face-up; public, and not part of the evolve deck proper (4.6.3). */
  readonly evolveDeckRevealed: readonly CardId[];
  readonly hand: readonly CardId[];
  readonly field: readonly FieldCard[];
  readonly ex: readonly CardId[];
  readonly cemetery: readonly CardId[];
  readonly banished: readonly BanishedCard[];
  readonly evolveZone: readonly EvolveLink[];
  readonly raceZone: readonly RaceLink[];
  readonly resources: Resources;
  readonly limits: ZoneLimits;
  readonly flags: TurnFlags;
  /** Set when a draw was required from an empty deck; resolved by rules handling (5.10.1.1, 11.2.2). */
  readonly drewFromEmptyDeck: boolean;
}

/**
 * Where the match is in its script. Setup steps, then the turn loop. A step either advances
 * on its own or opens a prompt; the match only waits while a prompt is open.
 */
export type StepId =
  | 'setup/turnOrder'
  | 'setup/mulligan/first'
  | 'setup/mulligan/second'
  | 'setup/start'
  | 'turn/start'
  | 'turn/main'
  | 'turn/end/wards'
  | 'turn/end/quick'
  | 'turn/end/discard'
  | 'turn/end/cleanup'
  | 'turn/end/finish'
  | 'over';

interface PromptBase {
  /** Monotonic; answers must quote it so a stale click can never answer a later prompt. */
  readonly id: number;
  /** The one seat whose answer the rules need. */
  readonly seat: Seat;
}

export type MainOption =
  | {
      readonly type: 'play';
      readonly card: CardId;
      readonly cost: number;
      readonly from: 'hand' | 'ex';
    }
  | {
      readonly type: 'activate';
      readonly card: CardId;
      readonly ability: string;
      readonly cost: number;
      readonly label: string;
    }
  | {
      readonly type: 'evolve';
      readonly card: CardId;
      readonly cost: number;
      readonly superEvolve: boolean;
      readonly useEvolutionPoint: boolean;
    }
  | { readonly type: 'attack'; readonly attacker: CardId; readonly target: CardId | 'leader' };

export interface PromptCandidate {
  readonly id: CardId;
  /** Present only for the addressed seat when the zone is otherwise hidden. */
  readonly def?: CardDefId;
}

export type Prompt =
  | (PromptBase & { readonly kind: 'turnOrder' })
  | (PromptBase & { readonly kind: 'mulligan' })
  | (PromptBase & { readonly kind: 'main'; readonly options: readonly MainOption[] })
  | (PromptBase & { readonly kind: 'quickWindow'; readonly options: readonly MainOption[] })
  | (PromptBase & { readonly kind: 'engageWards'; readonly candidates: readonly CardId[] })
  | (PromptBase & {
      readonly kind: 'discard';
      readonly count: number;
      readonly candidates: readonly CardId[];
    })
  | (PromptBase & {
      readonly kind: 'selectCards';
      readonly label: string;
      readonly candidates: readonly CardId[];
      /** Faces for the addressed seat; needed when the cards are not already on the view (search). */
      readonly previews: readonly CardRef[];
      readonly min: number;
      readonly max: number;
      readonly where: 'mat' | 'browser';
    })
  | (PromptBase & {
      readonly kind: 'chooseMode';
      readonly label: string;
      readonly modes: readonly { readonly id: string; readonly label: string }[];
    })
  | (PromptBase & { readonly kind: 'confirmOptional'; readonly label: string })
  | (PromptBase & {
      readonly kind: 'allocate';
      readonly label: string;
      readonly total: number;
      readonly targets: readonly CardId[];
    })
  | (PromptBase & {
      readonly kind: 'orderPending';
      readonly pending: readonly { readonly id: number; readonly label: string }[];
    })
  | (PromptBase & {
      readonly kind: 'keepOnField' | 'keepInEx';
      readonly keep: number;
      readonly candidates: readonly CardId[];
    })
  | (PromptBase & {
      readonly kind: 'chooseNumber';
      readonly label: string;
      readonly min: number;
      readonly max: number;
    })
  | (PromptBase & { readonly kind: 'declareName'; readonly label: string })
  | (PromptBase & {
      readonly kind: 'orderCards';
      readonly label: string;
      readonly candidates: readonly CardId[];
      readonly previews: readonly CardRef[];
    });

export type PromptKind = Prompt['kind'];

export type GameOverReason =
  'leaderDefeated' | 'deckOut' | 'concession' | 'effect' | 'perpetualCycle';

/** `winner: null` is a draw (1.2.2). */
export interface Outcome {
  readonly winner: Seat | null;
  readonly reason: GameOverReason;
}

export interface PendingAbility {
  readonly id: number;
  readonly seat: Seat;
  readonly source: CardId;
  readonly sourceDef: CardDefId;
  readonly abilityKey: string;
  readonly triggerSeq: number;
  readonly vars?: Readonly<Record<string, unknown>>;
}

export interface DelayedTrigger {
  readonly id: number;
  readonly seat: Seat;
  readonly source: CardId;
  readonly sourceDef: CardDefId;
  readonly point: TimingPoint;
  readonly whose: 'yours' | 'opponents' | 'each';
  readonly abilityKey: string;
  readonly effect: readonly Instr[];
}

export interface MatchState {
  /** Stored on the match so any replay can be re-derived (the only randomness is seeded). */
  readonly seed: string;
  readonly rng: RngState;
  /** Definitions pinned at match creation: a catalog change mid-match cannot alter a game in flight. */
  readonly defs: Readonly<Record<CardDefId, CardDefinition>>;
  /** Ability scripts pinned at match creation, keyed by definition id. */
  readonly scripts: Readonly<Record<CardDefId, CardScript>>;
  /** Token prototypes, keyed by token name (9.1.2.3). */
  readonly tokens: Readonly<Record<string, CardDefinition>>;
  readonly cards: Readonly<Record<CardId, CardInstance>>;
  readonly seats: readonly [SeatState, SeatState];
  readonly resolution: readonly ResolutionEntry[];
  /** This-turn cost changes that live on cards in hand or EX (4.8.3.3). */
  readonly costDeltas: Readonly<Record<CardId, readonly CostDelta[]>>;

  readonly work: readonly WorkFrame[];
  readonly pending: readonly PendingAbility[];
  readonly delayed: readonly DelayedTrigger[];
  /** Extra turns queued by effects (5.26). Consumed when selecting the next active player. */
  readonly extraTurns: number;
  /** Remaining skipped turns per seat (5.28). */
  readonly skipTurns: readonly [number, number];
  /** Seats that currently cannot lose (Ancient Protector). */
  readonly cantLose: readonly Seat[];
  readonly nextContinuousId: number;
  /** Event types applied this turn, oldest first. Used by R3/R4 tallies. */
  readonly eventLog: readonly string[];

  /** Seat who goes first; null until chosen (6.2.1.6). */
  readonly first: Seat | null;
  /** Seat who decides turn order, picked at random (6.2.1.6); null until picked. */
  readonly turnOrderChooser: Seat | null;
  /** 1-based global turn counter; 0 before the first turn begins. */
  readonly turn: number;
  readonly active: Seat | null;
  readonly phase: Phase | null;

  readonly step: StepId;
  readonly prompt: Prompt | null;
  readonly nextPromptId: number;
  readonly nextPendingId: number;
  readonly nextTokenSeq: number;
  /** Followers that fought each other this turn; Bane (11.3.2) reads this. */
  readonly combats: readonly { readonly a: CardId; readonly b: CardId }[];
  readonly outcome: Outcome | null;

  /** Number of events applied. Doubles as the version clients synchronise against. */
  readonly seq: number;
}

export const seatState = (state: MatchState, seat: Seat): SeatState => state.seats[seat];

export function definitionOf(state: MatchState, card: CardId): CardDefinition {
  const instance = state.cards[card];
  if (!instance) throw new Error(`Unknown card ${card}`);
  const def = state.defs[instance.def];
  if (!def) throw new Error(`Card ${card} references unpinned definition ${instance.def}`);
  return def;
}

/** Identity the viewer is allowed to know once this card is named in a prompt. */
export function refOf(state: MatchState, card: CardId): CardRef {
  const instance = state.cards[card];
  if (!instance) throw new Error(`Unknown card ${card}`);
  return { id: card, def: instance.def };
}

/** Effective definition: evolved info (minus cost) when linked (5.16.1.2, 10.9.1.1.1). */
export function effectiveDefinition(state: MatchState, card: CardId): CardDefinition {
  const printed = definitionOf(state, card);
  const owner = state.cards[card]?.owner;
  let info = printed;
  if (owner !== undefined) {
    const link = state.seats[owner].evolveZone.find((entry) => entry.linkedTo === card);
    if (link) info = { ...definitionOf(state, link.card), cost: printed.cost };
  }
  for (const seat of [0, 1] as const) {
    const field = state.seats[seat].field.find((entry) => entry.id === card);
    if (!field) continue;
    if (field.kindOverride) return { ...info, kind: field.kindOverride };
    if (field.maneuvered) return { ...info, kind: 'follower' };
  }
  return info;
}

export type { ZoneRef };
