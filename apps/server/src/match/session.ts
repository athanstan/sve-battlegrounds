import type { EventsMessage, MatchStatus, RejectionCode, SnapshotMessage } from '@sve/protocol';
import {
  createMatch,
  project,
  projectEvent,
  reduce,
  seatViewer,
  spectatorViewer,
  type CardCatalog,
  type CardDefinition,
  type CardScript,
  type ClientEnvelope,
  type DeckList,
  type EngineEvent,
  type Intent,
  type MatchState,
  type Seat,
  type Viewer,
} from '@sve/rules';
import type { SsUser } from '@sve/shadowshowdown';

/**
 * One match, framework-free. The Colyseus room owns connections; this owns the match: who sits
 * where, the authoritative state, the log, and what each kind of viewer is allowed to be told.
 * Keeping it separate means everything interesting is testable without a socket.
 */

export type SpectatorMode = 'closed' | 'hands';

export interface SeatClaim {
  readonly user: SsUser;
  readonly deckName: string;
  readonly deck: DeckList;
}

/** A run of engine events and the states on either side of it. */
export interface Delivery {
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly events: readonly EngineEvent[];
  /** State after the run; read only to look up card definitions (see `projectEvent`). */
  readonly state: MatchState;
}

export type SubmitResult =
  | { readonly ok: true; readonly delivery: Delivery }
  | { readonly ok: false; readonly code: RejectionCode };

export type ClaimResult =
  | { readonly ok: true; readonly seat: Seat }
  | { readonly ok: false; readonly reason: 'seatTaken' | 'alreadySeated' };

/** Who is asking to be told about the match. */
export type Audience =
  { readonly role: 'player'; readonly seat: Seat } | { readonly role: 'spectator' };

export interface SessionOptions {
  readonly spectators: SpectatorMode;
  /** Seeds the match's only source of randomness. Must be unpredictable; kept server-side. */
  readonly newSeed: () => string;
}

export interface MatchStartExtras {
  readonly scripts?: (def: CardDefinition) => CardScript | null;
  readonly tokens?: Readonly<Record<string, CardDefinition>>;
}

export class MatchSession {
  readonly #options: SessionOptions;
  readonly #claims: [SeatClaim | null, SeatClaim | null] = [null, null];
  #state: MatchState | null = null;
  readonly #log: EngineEvent[] = [];

  constructor(options: SessionOptions) {
    this.#options = options;
  }

  get state(): MatchState | null {
    return this.#state;
  }

  /** Every engine event so far, including the server-only ones. The input to a stored replay. */
  get log(): readonly EngineEvent[] {
    return this.#log;
  }

  get status(): MatchStatus {
    if (!this.#state) return 'waiting';
    return this.#state.outcome ? 'finished' : 'playing';
  }

  get spectatorMode(): SpectatorMode {
    return this.#options.spectators;
  }

  claimFor(seat: Seat): SeatClaim | null {
    return this.#claims[seat];
  }

  seatOf(userId: string): Seat | null {
    if (this.#claims[0]?.user.id === userId) return 0;
    if (this.#claims[1]?.user.id === userId) return 1;
    return null;
  }

  get isFull(): boolean {
    return this.#claims[0] !== null && this.#claims[1] !== null;
  }

  /** Take the lowest free seat. A person can hold only one: nobody plays themselves. */
  claim(claim: SeatClaim): ClaimResult {
    if (this.#state) return { ok: false, reason: 'seatTaken' };
    if (this.seatOf(claim.user.id) !== null) return { ok: false, reason: 'alreadySeated' };
    const seat = this.#claims[0] === null ? 0 : this.#claims[1] === null ? 1 : null;
    if (seat === null) return { ok: false, reason: 'seatTaken' };
    this.#claims[seat] = claim;
    return { ok: true, seat };
  }

  /** Give a seat up. Only possible before the match exists; afterwards leaving is conceding. */
  vacate(seat: Seat): void {
    if (this.#state) throw new Error('A seat cannot be vacated once the match has started');
    this.#claims[seat] = null;
  }

  /** Create the match once both seats are taken. */
  start(catalog: CardCatalog, extras: MatchStartExtras = {}): Delivery {
    const [first, second] = this.#claims;
    if (this.#state) throw new Error('The match has already started');
    if (!first || !second) throw new Error('Both seats must be taken before the match starts');

    const created = createMatch({
      seed: this.#options.newSeed(),
      catalog,
      players: [{ deck: first.deck }, { deck: second.deck }],
      ...(extras.scripts ? { scripts: extras.scripts } : {}),
      ...(extras.tokens ? { tokens: extras.tokens } : {}),
    });
    this.#state = created.state;
    this.#log.push(...created.events);
    return { fromSeq: 0, toSeq: created.state.seq, events: created.events, state: created.state };
  }

  /** Apply one seat's intent. Illegal intents change nothing and come back as a code. */
  submit(seat: Seat, intent: Intent): SubmitResult {
    const before = this.#state;
    if (!before) return { ok: false, code: 'noMatch' };

    const result = reduce(before, { seat, intent });
    if (!result.ok) return { ok: false, code: result.reason };

    this.#state = result.state;
    this.#log.push(...result.events);
    return {
      ok: true,
      delivery: {
        fromSeq: before.seq,
        toSeq: result.state.seq,
        events: result.events,
        state: result.state,
      },
    };
  }

  viewerFor(audience: Audience): Viewer {
    if (audience.role === 'player') return seatViewer(audience.seat);
    return spectatorViewer(this.#options.spectators === 'hands' ? [0, 1] : []);
  }

  /** The whole view for one audience, or `null` while there is no match to see. */
  snapshotFor(audience: Audience): SnapshotMessage | null {
    if (!this.#state) return null;
    return { seq: this.#state.seq, view: project(this.#state, this.viewerFor(audience)) };
  }

  /** A delivery as one audience may know it. */
  eventsFor(delivery: Delivery, audience: Audience): EventsMessage {
    const viewer = this.viewerFor(audience);
    const events: ClientEnvelope[] = [];
    delivery.events.forEach((event, index) => {
      const projected = projectEvent(event, viewer, delivery.state);
      if (projected) events.push({ seq: delivery.fromSeq + index + 1, event: projected });
    });
    return { fromSeq: delivery.fromSeq, toSeq: delivery.toSeq, events };
  }
}
