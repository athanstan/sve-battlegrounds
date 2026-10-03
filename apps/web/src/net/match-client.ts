import { ColyseusSDK } from '@colyseus/sdk';
import { MATCH_ROOM, type MatchJoinOptions } from '@sve/protocol';
import { MatchSession } from './match-session';
import { fromSdkRoom } from './room';

/** Where a seat's resume token is kept, so a reloaded page can sit back down. */
export interface ResumeStore {
  get(roomId: string): string | null;
  set(roomId: string, token: string): void;
  clear(roomId: string): void;
}

export const tabResumeStore = (
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = sessionStorage,
): ResumeStore => {
  const key = (roomId: string) => `sve.resume.${roomId}`;
  return {
    get: (roomId) => storage.getItem(key(roomId)),
    set: (roomId, token) => storage.setItem(key(roomId), token),
    clear: (roomId) => storage.removeItem(key(roomId)),
  };
};

export type SpectatorMode = 'closed' | 'hands';

/**
 * Opens matches for the signed-in user and remembers the sessions it has open, so that moving
 * between the lobby and a match (or React remounting a screen) never opens a second connection.
 */
export class MatchClient {
  readonly #sdk: ColyseusSDK;
  readonly #resume: ResumeStore;
  readonly #open = new Map<string, MatchSession>();
  readonly #resuming = new Map<string, Promise<MatchSession | null>>();

  constructor(serverUrl: string, token: string, resume: ResumeStore = tabResumeStore()) {
    this.#sdk = new ColyseusSDK(serverUrl);
    this.#sdk.auth.token = token;
    this.#resume = resume;
  }

  /** Start a new match and take the first seat. */
  async create(deckId: string, spectators: SpectatorMode): Promise<MatchSession> {
    const options: MatchJoinOptions = { role: 'player', deckId, spectators };
    return this.#attach(await this.#sdk.create(MATCH_ROOM, options));
  }

  /** Take the free seat at a waiting match. */
  async sit(roomId: string, deckId: string): Promise<MatchSession> {
    const options: MatchJoinOptions = { role: 'player', deckId };
    return this.#attach(await this.#sdk.joinById(roomId, options));
  }

  async watch(roomId: string): Promise<MatchSession> {
    const options: MatchJoinOptions = { role: 'spectator' };
    return this.#attach(await this.#sdk.joinById(roomId, options));
  }

  /** Whether this browser holds a seat (or a way back to one) at the match. */
  holdsSeat(roomId: string): boolean {
    return this.#open.has(roomId) || this.#resume.get(roomId) !== null;
  }

  /** The session already open for this match, if any. */
  session(roomId: string): MatchSession | undefined {
    return this.#open.get(roomId);
  }

  /**
   * Pick a seat back up after a reload. Null when there is nothing to resume or the hold has
   * lapsed. A resume token works once, so concurrent callers (React mounting a screen twice in
   * development) share one attempt.
   */
  resume(roomId: string): Promise<MatchSession | null> {
    const open = this.#open.get(roomId);
    if (open) return Promise.resolve(open);

    const pending = this.#resuming.get(roomId);
    if (pending) return pending;

    const attempt = this.#resumeFromToken(roomId).finally(() => this.#resuming.delete(roomId));
    this.#resuming.set(roomId, attempt);
    return attempt;
  }

  async #resumeFromToken(roomId: string): Promise<MatchSession | null> {
    const token = this.#resume.get(roomId);
    if (!token) return null;
    try {
      return this.#attach(await this.#sdk.reconnect(token));
    } catch {
      this.#resume.clear(roomId);
      return null;
    }
  }

  // No `await` between the room resolving and the session attaching its handlers: the server's
  // first messages arrive in the very next socket event.
  #attach(room: Parameters<typeof fromSdkRoom>[0]): MatchSession {
    const roomId = room.roomId;
    const session = new MatchSession(fromSdkRoom(room), {
      onResumeToken: (token) => this.#resume.set(roomId, token),
      onEnded: () => {
        this.#open.delete(roomId);
        this.#resume.clear(roomId);
      },
    });
    this.#open.set(roomId, session);
    return session;
  }
}
