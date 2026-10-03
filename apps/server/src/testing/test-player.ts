import { ColyseusSDK, type Room as SdkRoom } from '@colyseus/sdk';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  MATCH_ROOM,
  MatchMessage,
  type ChatLine,
  type EventsMessage,
  type MatchJoinOptions,
  type MatchPresence,
  type SeatPresence,
  type RejectedMessage,
  type SnapshotMessage,
} from '@sve/protocol';
import { foldView, type Intent, type MatchView, type Prompt } from '@sve/rules';
import { fixtureTokenFor } from '@sve/shadowshowdown/fixture';
import { vi } from 'vitest';
import type { GameServer } from '../server';

/**
 * A scripted browser for integration tests: it speaks the same protocol the web client does and
 * keeps the same bookkeeping (fold events into a view, resync on a gap), so a green test means
 * the real client has what it needs.
 */

export const wsUrl = (port: number) => `ws://127.0.0.1:${port}`;

/** Start a server on a chosen port. `boot()` pins every server to 2568, which parallel files cannot share. */
export async function listenOn(server: GameServer, port: number): Promise<ColyseusTestServer> {
  await server.listen(port);
  return new ColyseusTestServer(server);
}

/** One signed-in user's connection factory. */
export class TestUser {
  readonly sdk: ColyseusSDK;

  constructor(
    readonly accountId: string,
    port: number,
  ) {
    this.sdk = new ColyseusSDK(wsUrl(port));
    this.sdk.auth.token = fixtureTokenFor(accountId);
  }

  /** Open a new match and sit in it. */
  async create(options: MatchJoinOptions): Promise<TestPlayer> {
    // No `await` between the room resolving and the handlers attaching: the first server
    // messages arrive in the very next socket event.
    return TestPlayer.attach(await this.sdk.create(MATCH_ROOM, options));
  }

  async join(roomId: string, options: MatchJoinOptions): Promise<TestPlayer> {
    return TestPlayer.attach(await this.sdk.joinById(roomId, options));
  }

  async reconnect(token: string): Promise<TestPlayer> {
    return TestPlayer.attach(await this.sdk.reconnect(token));
  }
}

const answerFor = (prompt: Prompt): Intent => {
  switch (prompt.kind) {
    case 'turnOrder':
      return { type: 'choose', promptId: prompt.id, choice: { kind: 'turnOrder', goFirst: true } };
    case 'mulligan':
      return { type: 'choose', promptId: prompt.id, choice: { kind: 'mulligan', redraw: false } };
    case 'main':
    case 'quickWindow':
      return { type: 'pass', promptId: prompt.id };
    case 'engageWards':
      return { type: 'engageWards', promptId: prompt.id, cards: [] };
    case 'discard':
      return {
        type: 'choose',
        promptId: prompt.id,
        choice: { kind: 'discard', cards: prompt.candidates.slice(0, prompt.count) },
      };
    case 'selectCards':
    case 'keepOnField':
    case 'keepInEx':
      return {
        type: 'choose',
        promptId: prompt.id,
        choice: {
          kind: 'selectCards',
          cards: prompt.candidates.slice(
            0,
            prompt.kind === 'selectCards' ? prompt.min : prompt.keep,
          ),
        },
      };
    case 'chooseMode':
      return {
        type: 'choose',
        promptId: prompt.id,
        choice: { kind: 'mode', id: prompt.modes[0]?.id ?? '' },
      };
    case 'confirmOptional':
      return { type: 'choose', promptId: prompt.id, choice: { kind: 'confirm', yes: false } };
    case 'allocate':
      return {
        type: 'choose',
        promptId: prompt.id,
        choice: {
          kind: 'allocate',
          amounts: prompt.targets.map((_, i) => (i === 0 ? prompt.total : 0)),
        },
      };
    case 'orderPending':
      return {
        type: 'choose',
        promptId: prompt.id,
        choice: { kind: 'orderPending', id: prompt.pending[0]?.id ?? 0 },
      };
  }
};

export class TestPlayer {
  view: MatchView | null = null;
  seq = 0;
  readonly rejections: RejectedMessage[] = [];
  readonly chat: ChatLine[] = [];
  /** The history sent on join, kept apart from live lines. */
  chatHistory: readonly ChatLine[] = [];
  /** Every match payload exactly as it crossed the wire, for leak checks. */
  readonly wire: unknown[] = [];
  readonly promptKindsSeen = new Set<string>();
  /** Every card id this player has ever been shown in their own hand. */
  readonly handIds = new Set<string>();
  snapshots = 0;
  /** Event batches that did not start where this client was; zero on a healthy connection. */
  gaps = 0;
  drops = 0;
  reconnects = 0;
  leftWith: number | null = null;

  #answered = new Set<number>();

  private constructor(readonly room: SdkRoom) {
    room.onMessage(MatchMessage.snapshot, (message: SnapshotMessage) => {
      this.wire.push(message);
      this.snapshots += 1;
      this.#adopt(message.view, message.seq);
    });
    room.onMessage(MatchMessage.events, (message: EventsMessage) => {
      this.wire.push(message);
      if (message.fromSeq !== this.seq) {
        this.gaps += 1;
        room.send(MatchMessage.resync);
        return;
      }
      let view = this.view;
      for (const { event } of message.events) view = foldView(view, event);
      this.#adopt(view, message.toSeq);
    });
    room.onMessage(MatchMessage.rejected, (message: RejectedMessage) =>
      this.rejections.push(message),
    );
    room.onMessage(MatchMessage.chatMessage, (line: ChatLine) => this.chat.push(line));
    room.onMessage(MatchMessage.chatHistory, (message: { lines: readonly ChatLine[] }) => {
      this.chatHistory = message.lines;
    });
    room.onDrop(() => (this.drops += 1));
    room.onReconnect(() => (this.reconnects += 1));
    room.onLeave((code) => (this.leftWith = code));
  }

  static attach(room: SdkRoom): TestPlayer {
    return new TestPlayer(room);
  }

  #adopt(view: MatchView | null, seq: number): void {
    if (!view) return;
    this.view = view;
    this.seq = seq;
    if (view.waitingOn) this.promptKindsSeen.add(view.waitingOn.kind);
    if (view.viewer.kind === 'seat') {
      for (const card of view.seats[view.viewer.seat].hand.cards ?? []) this.handIds.add(card.id);
    }
  }

  get seat(): 0 | 1 {
    if (this.view?.viewer.kind !== 'seat') throw new Error('Not a player');
    return this.view.viewer.seat;
  }

  /** The synchronised table presence, as the lobby and seat plates see it. */
  get state(): MatchPresence {
    return this.room.state as MatchPresence;
  }

  /** The nameplate of one seat as the synchronised state shows it. */
  seatPlate(seat: 0 | 1): SeatPresence {
    const plate = this.state.seats[seat];
    if (!plate) throw new Error(`Seat ${seat} has no presence`);
    return plate;
  }

  send(intent: Intent): void {
    this.room.send(MatchMessage.intent, intent);
  }

  /** Answer the open prompt addressed to this player, once. Returns whether anything was sent. */
  answerPrompt(): boolean {
    const prompt = this.view?.prompt;
    if (!prompt || this.#answered.has(prompt.id)) return false;
    this.#answered.add(prompt.id);
    this.send(answerFor(prompt));
    return true;
  }

  say(text: string): void {
    this.room.send(MatchMessage.chatSend, { text });
  }

  /** Simulate a flaky network: the socket dies without a goodbye. */
  dropConnection(): void {
    this.room.connection.close(4010);
  }
}

/**
 * Have every player answer whatever is asked of them, until `done`. The goal is checked before
 * answering, so the match stops *at* the prompt that satisfies it, still unanswered.
 */
export async function playUntil(
  players: readonly TestPlayer[],
  done: () => boolean,
  timeout = 10_000,
): Promise<void> {
  await vi.waitFor(
    () => {
      if (done()) return;
      for (const player of players) player.answerPrompt();
      throw new Error('match has not reached the goal yet');
    },
    { timeout, interval: 5 },
  );
}

/** Wait until nobody has heard anything new for a moment: the server has said all it is going to. */
export async function quiet(players: readonly TestPlayer[], forMs = 120): Promise<void> {
  let last = '';
  let since = Date.now();
  await vi.waitFor(
    () => {
      const now = players.map((player) => player.seq).join(',');
      if (now !== last) {
        last = now;
        since = Date.now();
      }
      if (Date.now() - since < forMs) throw new Error('still talking');
    },
    { timeout: 5_000, interval: 10 },
  );
}

/** Poll until a condition holds. */
export function until(condition: () => boolean, timeout = 5_000): Promise<void> {
  return vi.waitFor(
    () => {
      if (!condition()) throw new Error('condition not met');
    },
    { timeout, interval: 5 },
  );
}

/** Quote an id the way it appears inside serialised JSON, so `"0:m1"` never matches `"0:m12"`. */
export const quoted = (id: string): string => JSON.stringify(id);
