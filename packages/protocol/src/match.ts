import type { ClientEnvelope, MatchView, RejectionReason, Seat } from '@sve/rules';
import { z } from 'zod';

/** Name of the Colyseus room type that runs one match. */
export const MATCH_ROOM = 'match';

/** Most spectators one match accepts, besides the two seats. */
export const MAX_SPECTATORS = 30;

/** How long a dropped player's seat is held before the server concedes for them. */
export const RECONNECT_WINDOW_SECONDS = 120;

/**
 * Join options. `role` is what the client is *asking* for; the server decides. Spectating
 * needs no deck; sitting needs one of the user's own decks on shadowshowdown.com.
 */
export const matchJoinOptionsSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('player'),
    deckId: z.string().min(1).max(128),
    /**
     * Only the player who creates the match decides this. `closed` shows spectators no hands;
     * `hands` also opens both hands to them (for casting).
     */
    spectators: z.enum(['closed', 'hands']).default('closed'),
  }),
  z.object({ role: z.literal('spectator') }),
]);
export type MatchJoinOptions = z.input<typeof matchJoinOptionsSchema>;
export type ParsedMatchJoinOptions = z.output<typeof matchJoinOptionsSchema>;

/**
 * Why a join was refused. Carried as the Colyseus error code so the UI can say something useful.
 *
 * Colyseus answers a failed matchmaking request with the error's code *as the HTTP status*, and
 * `onAuth` runs inside that request, so every code here has to be a valid HTTP status (its own
 * are 520-526). They are chosen to read sensibly as one.
 */
export const JoinError = {
  badOptions: 400,
  /** The user holds a seat in this match already, so they cannot take both. */
  alreadySeated: 403,
  deckNotFound: 404,
  seatTaken: 409,
  deckIllegal: 422,
  unavailable: 503,
} as const;
export type JoinErrorCode = (typeof JoinError)[keyof typeof JoinError];

/** Messages are named in one place so both ends stay in step. */
export const MatchMessage = {
  // client -> server
  intent: 'intent',
  chatSend: 'chat.send',
  resync: 'match.resync',
  // server -> client
  snapshot: 'match.snapshot',
  events: 'match.events',
  rejected: 'match.rejected',
  chatMessage: 'chat.message',
  chatHistory: 'chat.history',
} as const;

export const chatSendSchema = z.object({ text: z.string().trim().min(1).max(280) });
export type ChatSend = z.infer<typeof chatSendSchema>;

/** The viewer's whole view at a log position: sent on join, reconnect and resync. */
export interface SnapshotMessage {
  readonly seq: number;
  readonly view: MatchView;
}

/**
 * A contiguous run of what happened, already filtered for this viewer. A client applies it
 * only if `fromSeq` is the position it holds; otherwise it asks to resync.
 */
export interface EventsMessage {
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly events: readonly ClientEnvelope[];
}

/**
 * `malformed` is a message that does not parse as an intent at all; it is the sender's bug, not a
 * rules question, and is answered rather than punished (Colyseus would otherwise drop the
 * connection, which for a seated player means conceding).
 */
export type RejectionCode = RejectionReason | 'notSeated' | 'noMatch' | 'malformed';

export interface RejectedMessage {
  readonly code: RejectionCode;
  /** The prompt the rejected answer quoted, so the UI can clear its pending state. */
  readonly promptId: number | null;
}

/**
 * Chat is a side channel. It never enters the rules log, and the table and the gallery are
 * kept apart so a spectator who can see a hand cannot talk a player through it.
 */
export type ChatChannel = 'table' | 'spectators';

export interface ChatAuthor {
  readonly userId: string;
  readonly displayName: string;
  readonly seat: Seat | null;
}

export interface ChatLine {
  readonly id: number;
  readonly channel: ChatChannel;
  readonly author: ChatAuthor;
  readonly text: string;
  /** Server clock, epoch milliseconds. */
  readonly at: number;
}

export interface ChatHistoryMessage {
  readonly lines: readonly ChatLine[];
}

/** Everything the server can send to a match client, keyed by message name. */
export interface MatchServerMessages {
  [MatchMessage.snapshot]: SnapshotMessage;
  [MatchMessage.events]: EventsMessage;
  [MatchMessage.rejected]: RejectedMessage;
  [MatchMessage.chatMessage]: ChatLine;
  [MatchMessage.chatHistory]: ChatHistoryMessage;
}
