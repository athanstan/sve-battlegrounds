import { randomUUID } from 'node:crypto';
import {
  JoinError,
  MAX_SPECTATORS,
  MatchMessage,
  MatchPresence,
  RECONNECT_WINDOW_SECONDS,
  SeatPresence,
  chatSendSchema,
  intentSchema,
  matchJoinOptionsSchema,
  type MatchServerMessages,
  type MatchStatus,
} from '@sve/protocol';
import { validateDeck, type Intent, type Seat } from '@sve/rules';
import { logUnscripted, scriptFor, withScriptedFlag } from '@sve/cards';
import {
  GatewayError,
  type ShadowShowdownGateway,
  type SsDeck,
  type SsUser,
} from '@sve/shadowshowdown';
import {
  ErrorCode,
  Room,
  ServerError,
  type Client,
  type RoomException,
  type RoomMethodName,
} from '@colyseus/core';
import { ChatLog, channelFor, channelsReadBy } from '../match/chat';
import { MatchSession, type Audience, type Delivery, type SpectatorMode } from '../match/session';

export interface MatchRoomDeps {
  readonly gateway: ShadowShowdownGateway;
  /** Defaults to a random UUID. Tests pass a fixed one to get a reproducible match. */
  readonly newSeed?: () => string;
  readonly now?: () => number;
  readonly reconnectSeconds?: number;
}

/** What `onAuth` resolves to; Colyseus hands it back as `client.auth` for the connection's life. */
export interface MatchAuth {
  readonly user: SsUser;
  readonly role: 'player' | 'spectator';
  /** Present for players: already fetched and checked against 6.1, so seating cannot fail on it. */
  readonly deck: SsDeck | null;
}

interface MatchUserData {
  seat: Seat | null;
}

type MatchClient = Client<{
  auth: MatchAuth;
  userData: MatchUserData;
  messages: MatchServerMessages;
}>;

/** What the lobby sees of a room. Public by construction. */
export interface MatchMetadata {
  title: string;
  status: MatchStatus;
  players: string[];
  spectators: number;
}

/** `onAuth` guarantees this before any handler runs; the type just cannot know it. */
function authOf(client: MatchClient): MatchAuth {
  if (!client.auth) throw new Error(`Client ${client.sessionId} has no auth`);
  return client.auth;
}

const seatOf = (client: MatchClient): Seat | null => client.userData?.seat ?? null;

/** Map a gateway failure to the Colyseus error the browser will see. */
function refuse(error: unknown): never {
  if (error instanceof ServerError) throw error;
  if (error instanceof GatewayError) {
    if (error.code === 'unauthorized')
      throw new ServerError(ErrorCode.AUTH_FAILED, 'Not signed in');
    throw new ServerError(
      JoinError.unavailable,
      'shadowshowdown.com is unavailable, try again shortly',
    );
  }
  throw error;
}

/**
 * Build the match room class around its dependencies.
 *
 * It is a factory because Colyseus 0.18 authenticates through a *static* `onAuth` that runs
 * before the room exists, so the only way to hand it the gateway without a global is to close
 * over it. The class itself is a thin adapter: connections and message plumbing here, the match
 * in `MatchSession`, the rules in `@sve/rules`.
 */
export function createMatchRoom(deps: MatchRoomDeps) {
  const { gateway } = deps;
  const newSeed = deps.newSeed ?? randomUUID;
  const now = deps.now ?? Date.now;
  const reconnectSeconds = deps.reconnectSeconds ?? RECONNECT_WINDOW_SECONDS;

  return class MatchRoom extends Room<{
    state: MatchPresence;
    metadata: MatchMetadata;
    client: MatchClient;
  }> {
    override maxClients = 2 + MAX_SPECTATORS;
    override maxMessagesPerSecond = 30;
    override state = new MatchPresence();

    /** Created in `onCreate`, once the creator's spectator preference is known. */
    #session!: MatchSession;
    readonly #chat = new ChatLog({ now });
    readonly #connectedPlayers = new Set<string>();
    #spectators = 0;
    #listing = '';

    /**
     * Runs before a seat is reserved. Establishes who is asking and, for a player, that their
     * deck exists, is theirs and is legal. The shadowshowdown.com token is used here and
     * dropped: nothing about it is stored on the connection or in the room.
     */
    static override async onAuth(token: string | undefined, options: unknown): Promise<MatchAuth> {
      const parsed = matchJoinOptionsSchema.safeParse(options);
      if (!parsed.success) throw new ServerError(JoinError.badOptions, 'Invalid join options');
      if (!token) throw new ServerError(ErrorCode.AUTH_FAILED, 'Not signed in');

      try {
        const user = await gateway.authenticate(token);
        if (!user) throw new ServerError(ErrorCode.AUTH_FAILED, 'Not signed in');
        if (parsed.data.role === 'spectator') return { user, role: 'spectator', deck: null };

        const deck = await gateway.getDeck(token, parsed.data.deckId);
        if (!deck) throw new ServerError(JoinError.deckNotFound, 'That deck was not found');
        const issues = validateDeck(deck.list, await gateway.catalog());
        if (issues.length > 0) {
          const why = issues.map((issue) => issue.code).join(', ');
          throw new ServerError(
            JoinError.deckIllegal,
            `"${deck.name}" is not a legal deck (${why})`,
          );
        }
        return { user, role: 'player', deck };
      } catch (error) {
        return refuse(error);
      }
    }

    // ---- messages ----------------------------------------------------------------------

    override messages = {
      [MatchMessage.intent]: (client: MatchClient, payload: unknown) => {
        this.#onIntent(client, payload);
      },
      [MatchMessage.chatSend]: (client: MatchClient, payload: unknown) => {
        this.#onChat(client, payload);
      },
      [MatchMessage.resync]: (client: MatchClient) => {
        this.#sendSnapshot(client);
      },
    };

    // ---- lifecycle ---------------------------------------------------------------------

    override onCreate(options: unknown): void {
      // `onAuth` already vetted these options; reading the creator's spectator preference
      // again here is just reading what was approved.
      const parsed = matchJoinOptionsSchema.safeParse(options);
      const spectators: SpectatorMode =
        parsed.success && parsed.data.role === 'player' ? parsed.data.spectators : 'closed';
      this.#session = new MatchSession({ spectators, newSeed });

      this.state.seats.push(new SeatPresence(), new SeatPresence());
      this.setMetadata({ title: '', status: 'waiting', players: [], spectators: 0 }).catch(
        logError,
      );
    }

    override async onJoin(client: MatchClient): Promise<void> {
      const { user, role, deck } = authOf(client);
      client.userData = { seat: null };

      if (role === 'spectator') {
        this.#spectators += 1;
        this.#sendSnapshot(client);
        this.#sendChatHistory(client);
        this.#sync();
        return;
      }

      if (!deck) throw new ServerError(JoinError.badOptions, 'A player must bring a deck');
      const claim = this.#session.claim({ user, deckName: deck.name, deck: deck.list });
      if (!claim.ok) {
        const code =
          claim.reason === 'alreadySeated' ? JoinError.alreadySeated : JoinError.seatTaken;
        throw new ServerError(
          code,
          claim.reason === 'alreadySeated' ? 'You already hold a seat' : 'Both seats are taken',
        );
      }
      client.userData = { seat: claim.seat };
      this.#connectedPlayers.add(user.id);
      this.#sendChatHistory(client);

      if (this.#session.isFull) {
        try {
          const [rawCatalog, tokenMap] = await Promise.all([gateway.catalog(), gateway.tokens()]);
          const catalog = withScriptedFlag(rawCatalog);
          const defs = [this.#session.claimFor(0), this.#session.claimFor(1)].flatMap((held) => {
            if (!held) return [];
            return [
              held.deck.leader,
              ...held.deck.main.map((entry) => entry.card),
              ...held.deck.evolve.map((entry) => entry.card),
            ]
              .map((id) => catalog(id))
              .flatMap((def) => (def ? [def] : []));
          });
          logUnscripted(defs);
          this.#deliver(
            this.#session.start(catalog, {
              scripts: scriptFor,
              tokens: Object.fromEntries(tokenMap),
            }),
          );
        } catch (error) {
          logError(error);
          throw new ServerError(JoinError.unavailable, 'The match could not be started');
        }
      }
      this.#sync();
    }

    override onDrop(client: MatchClient): void {
      // A spectator who drops simply leaves (`onLeave` follows). A player keeps their seat for a
      // while: a closed laptop or a page reload must not forfeit the match.
      const { user, role } = authOf(client);
      if (role !== 'player') return;
      this.#connectedPlayers.delete(user.id);
      this.#sync();
      this.allowReconnection(client, reconnectSeconds);
    }

    override onReconnect(client: MatchClient): void {
      const { user, role } = authOf(client);
      if (role === 'player') this.#connectedPlayers.add(user.id);
      this.#sendSnapshot(client);
      this.#sendChatHistory(client);
      this.#sync();
    }

    override onLeave(client: MatchClient): void {
      const { user, role } = authOf(client);
      if (role === 'spectator') {
        this.#spectators = Math.max(0, this.#spectators - 1);
        this.#sync();
        return;
      }

      this.#connectedPlayers.delete(user.id);
      const seat = seatOf(client);
      if (seat === null) return;

      switch (this.#session.status) {
        case 'waiting':
          // Nobody else is here yet: the table closes with its host.
          this.#session.vacate(seat);
          this.#sync();
          this.disconnect().catch(logError);
          return;
        case 'playing': {
          // Leaving a live match, or being gone past the reconnect window, is conceding (1.2.3).
          const result = this.#session.submit(seat, { type: 'concede' });
          if (result.ok) this.#deliver(result.delivery);
          this.#sync();
          return;
        }
        case 'finished':
          this.#sync();
          return;
      }
    }

    /** Nothing a handler throws may take the process down with it. */
    override onUncaughtException(error: RoomException, methodName: RoomMethodName): void {
      logError(error, methodName);
    }

    // ---- handlers ----------------------------------------------------------------------

    #onIntent(client: MatchClient, payload: unknown): void {
      const parsed = intentSchema.safeParse(payload);
      if (!parsed.success) {
        client.send(MatchMessage.rejected, { code: 'malformed', promptId: null });
        return;
      }
      const intent: Intent = parsed.data;
      const seat = seatOf(client);
      const promptId = 'promptId' in intent ? intent.promptId : null;
      if (authOf(client).role !== 'player' || seat === null) {
        client.send(MatchMessage.rejected, { code: 'notSeated', promptId });
        return;
      }

      const result = this.#session.submit(seat, intent);
      if (!result.ok) {
        client.send(MatchMessage.rejected, { code: result.code, promptId });
        return;
      }
      this.#deliver(result.delivery);
      this.#sync();
    }

    #onChat(client: MatchClient, payload: unknown): void {
      const parsed = chatSendSchema.safeParse(payload);
      if (!parsed.success) return;
      const { user, role } = authOf(client);
      const result = this.#chat.post(
        { userId: user.id, displayName: user.displayName, seat: seatOf(client) },
        channelFor(role),
        parsed.data.text,
      );
      if (!result.ok) return; // empty or throttled: dropped, the sender is not told off
      for (const other of this.clients) {
        if (channelsReadBy(authOf(other).role).includes(result.line.channel)) {
          other.send(MatchMessage.chatMessage, result.line);
        }
      }
    }

    // ---- delivery ----------------------------------------------------------------------

    #audienceOf(client: MatchClient): Audience {
      const seat = seatOf(client);
      return authOf(client).role === 'player' && seat !== null
        ? { role: 'player', seat }
        : { role: 'spectator' };
    }

    /** Tell every connection what happened, each in the form it is allowed to know. */
    #deliver(delivery: Delivery): void {
      for (const client of this.clients) {
        client.send(
          MatchMessage.events,
          this.#session.eventsFor(delivery, this.#audienceOf(client)),
        );
      }
    }

    #sendSnapshot(client: MatchClient): void {
      const snapshot = this.#session.snapshotFor(this.#audienceOf(client));
      if (snapshot) client.send(MatchMessage.snapshot, snapshot);
    }

    #sendChatHistory(client: MatchClient): void {
      client.send(MatchMessage.chatHistory, {
        lines: this.#chat.history(channelsReadBy(authOf(client).role)),
      });
    }

    // ---- what the lobby and the table's seats show -------------------------------------

    #sync(): void {
      const session = this.#session;
      this.state.status = session.status;
      this.state.spectators = this.#spectators;
      for (const seat of [0, 1] as const) {
        const claim = session.claimFor(seat);
        const presence = this.state.seats[seat];
        if (!presence) continue;
        presence.occupied = claim !== null;
        presence.userId = claim?.user.id ?? '';
        presence.displayName = claim?.user.displayName ?? '';
        presence.avatarUrl = claim?.user.avatarUrl ?? '';
        presence.deckName = claim?.deckName ?? '';
        presence.connected = claim !== null && this.#connectedPlayers.has(claim.user.id);
      }

      const host = session.claimFor(0)?.user.displayName;
      this.state.title = host ? `${host}'s match` : '';
      const listing: MatchMetadata = {
        title: this.state.title,
        status: session.status,
        players: ([0, 1] as const).flatMap(
          (seat) => session.claimFor(seat)?.user.displayName ?? [],
        ),
        spectators: this.#spectators,
      };
      const serialised = JSON.stringify(listing);
      if (serialised !== this.#listing) {
        this.#listing = serialised;
        this.setMetadata(listing).catch(logError);
      }
    }
  };
}

function logError(error: unknown, where?: string): void {
  console.error(where ? `[match] ${where}:` : '[match]', error);
}
