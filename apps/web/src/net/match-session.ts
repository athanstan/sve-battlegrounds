import { MatchMessage, type ChatLine, type RejectedMessage } from '@sve/protocol';
import type { Intent, MatchView } from '@sve/rules';
import type { Frame } from './frame';
import { readPresence, type Presence } from './presence';
import { describeRejection } from './rejections';
import type { RoomLike } from './room';
import { INITIAL_SYNC, applyEvents, applySnapshot, type SyncState, type SyncStep } from './sync';

/**
 * One browser's seat (or place in the gallery) at one match.
 *
 * It owns the connection and everything derived from it: the view kept in step with the server's
 * log, who is at the table, the chat, and the small amount of UI state that belongs to the
 * conversation with the server (an answer on its way, the reason one was refused). The page
 * subscribes and renders; it never touches the room.
 */

export type Connection = 'live' | 'dropped' | 'closed';

export interface SessionState {
  readonly connection: Connection;
  /** Why the connection ended, once it has. */
  readonly closedWith: number | null;
  /** The newest thing to put on the table; replaced, never mutated. */
  readonly frame: Frame | null;
  readonly view: MatchView | null;
  readonly presence: Presence | null;
  readonly chat: readonly ChatLine[];
  /** The prompt an answer has been sent for and not yet been settled by the server. */
  readonly answering: number | null;
  /** The server turned the last answer down: what to tell the player. */
  readonly notice: string | null;
}

/** Chat older than this many lines is dropped from memory. */
const CHAT_KEEP = 200;

export interface SessionHooks {
  /** The token that resumes this seat after a reload; called on join and after every reconnect. */
  readonly onResumeToken: (token: string) => void;
  /** The player left on purpose, or the match is gone for good: forget this session. */
  readonly onEnded: () => void;
}

export class MatchSession {
  readonly roomId: string;
  readonly #room: RoomLike;
  readonly #hooks: SessionHooks;
  readonly #listeners = new Set<() => void>();
  #sync: SyncState = INITIAL_SYNC;
  #state: SessionState = {
    connection: 'live',
    closedWith: null,
    frame: null,
    view: null,
    presence: null,
    chat: [],
    answering: null,
    notice: null,
  };

  /**
   * Attach to an open room. This must happen in the same tick the room resolves: the server's
   * first messages are already on their way and a handler added later would miss them.
   */
  constructor(room: RoomLike, hooks: SessionHooks) {
    this.#room = room;
    this.#hooks = hooks;
    this.roomId = room.roomId;
    hooks.onResumeToken(room.reconnectionToken);

    room.onMessage(MatchMessage.snapshot, (message) => {
      this.#step(applySnapshot(message));
    });
    room.onMessage(MatchMessage.events, (message) => {
      this.#step(applyEvents(this.#sync, message));
    });
    room.onMessage(MatchMessage.rejected, (message) => {
      this.#rejected(message);
    });
    room.onMessage(MatchMessage.chatMessage, (line) => {
      this.#set({ chat: [...this.#state.chat, line].slice(-CHAT_KEEP) });
    });
    room.onMessage(MatchMessage.chatHistory, ({ lines }) => {
      this.#set({ chat: lines.slice(-CHAT_KEEP) });
    });

    room.onStateChange((state) => {
      this.#set({ presence: readPresence(state) });
    });
    room.onDrop(() => {
      this.#set({ connection: 'dropped' });
    });
    room.onReconnect(() => {
      hooks.onResumeToken(room.reconnectionToken);
      this.#set({ connection: 'live' });
    });
    room.onLeave((code) => {
      this.#set({ connection: 'closed', closedWith: code });
    });
  }

  // ---- the store the page subscribes to ---------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getState = (): SessionState => this.#state;

  // ---- what the player can do ------------------------------------------------------------

  /** Answer the open prompt (or concede). One answer per prompt: a second click does nothing. */
  send(intent: Intent): void {
    if (this.#state.connection !== 'live') return;
    if ('promptId' in intent) {
      if (this.#state.answering === intent.promptId) return;
      this.#set({ answering: intent.promptId, notice: null });
    }
    this.#room.send(MatchMessage.intent, intent);
  }

  say(text: string): void {
    const trimmed = text.trim();
    if (trimmed && this.#state.connection === 'live')
      this.#room.send(MatchMessage.chatSend, { text: trimmed });
  }

  /** Walk away. A player who leaves a match in progress concedes it; the server does that. */
  async leave(): Promise<void> {
    this.#hooks.onEnded();
    await this.#room.leave();
  }

  dismissNotice(): void {
    if (this.#state.notice !== null) this.#set({ notice: null });
  }

  // ---- internals ---------------------------------------------------------------------------

  #step(step: SyncStep): void {
    this.#sync = step.state;
    if (step.resync) this.#room.send(MatchMessage.resync);
    if (step.frame) this.#set({ frame: step.frame, view: step.frame.view });
  }

  #rejected(message: RejectedMessage): void {
    // Only an answer we are waiting on can be un-waited; a stale rejection must not clear a newer one.
    const settles = message.promptId === null || message.promptId === this.#state.answering;
    this.#set({
      notice: describeRejection(message.code),
      ...(settles ? { answering: null } : {}),
    });
  }

  #set(patch: Partial<SessionState>): void {
    const next = { ...this.#state, ...patch };
    // The question moved on (or closed): whatever we were waiting for is settled.
    const promptId = next.view?.prompt?.id ?? null;
    this.#state =
      next.answering !== null && next.answering !== promptId ? { ...next, answering: null } : next;
    for (const listener of this.#listeners) listener();
  }
}
