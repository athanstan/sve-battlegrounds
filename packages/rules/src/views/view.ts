import type { CardId, CardRef, Seat } from '../model/ids';
import type {
  Outcome,
  Phase,
  Placement,
  Prompt,
  PromptKind,
  Resources,
  ShownStats,
  ZoneLimits,
} from '../state/state';
import type { Viewer } from './viewer';

/**
 * The projection of a match for one viewer. Everything here is something that viewer is
 * allowed to know; hidden information is absent, not blanked, so it cannot be recovered
 * from a payload. Plain JSON: safe to serialise as-is.
 */

/** A zone the viewer may only count, or may also read when `cards` is present. */
export interface CountedZone {
  readonly count: number;
  /** Present only when the viewer is allowed to see the faces. Always `count` long when present. */
  readonly cards: readonly CardRef[] | null;
}

export interface FieldCardView {
  readonly card: CardRef;
  readonly placement: Placement;
  readonly enteredTurn: number;
  readonly shown: ShownStats;
  readonly racedTimes: number;
  readonly counters: Readonly<Record<string, number>>;
  readonly equipped: readonly CardRef[];
}

export interface EvolveLinkView {
  readonly card: CardRef;
  readonly linkedTo: CardId;
  readonly superEvolved: boolean;
}

export interface BanishedView {
  /** Null for a face-down card: the viewer sees a back, not an identity. */
  readonly card: CardRef | null;
  readonly faceDown: boolean;
}

export interface EvolveDeckView extends CountedZone {
  /** Face-up revealed evolve cards are public and not part of `count` (4.6.3). */
  readonly revealed: readonly CardRef[];
}

export interface SeatView {
  readonly seat: Seat;
  readonly leader: { readonly card: CardRef; readonly defense: number };
  readonly resources: Resources;
  readonly limits: ZoneLimits;
  /** Count only, for every viewer: even the owner may not see their deck's order (4.5.2). */
  readonly deck: { readonly count: number };
  readonly evolveDeck: EvolveDeckView;
  readonly hand: CountedZone;
  readonly field: readonly FieldCardView[];
  readonly ex: readonly CardRef[];
  readonly cemetery: readonly CardRef[];
  readonly banished: readonly BanishedView[];
  readonly evolveZone: readonly EvolveLinkView[];
  readonly raceZone: readonly EvolveLinkView[];
}

export interface ResolutionView {
  readonly card: CardRef;
  readonly controller: Seat;
}

/** What everyone may know about an open prompt: who the match is waiting on, and for what. */
export interface PromptSummary {
  readonly id: number;
  readonly seat: Seat;
  readonly kind: PromptKind;
}

export interface MatchView {
  readonly viewer: Viewer;
  readonly first: Seat | null;
  readonly turn: number;
  readonly active: Seat | null;
  readonly phase: Phase | null;
  readonly seats: readonly [SeatView, SeatView];
  readonly resolution: readonly ResolutionView[];
  /** Who the match is waiting on. Visible to everyone. */
  readonly waitingOn: PromptSummary | null;
  /** The full prompt, present only for the seat it is addressed to. */
  readonly prompt: Prompt | null;
  readonly outcome: Outcome | null;
}

/** A view plus the log position it reflects: the unit sent on join and reconnect. */
export interface Snapshot {
  readonly seq: number;
  readonly view: MatchView;
}
