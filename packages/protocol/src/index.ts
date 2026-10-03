/**
 * @sve/protocol - the wire contract between the game server and the browser.
 *
 * Zod schemas for everything a client may send; plain types for everything the server sends.
 * No framework code: the Colyseus presence schema is data description only.
 */
export { intentSchema } from './intent';
export {
  JoinError,
  MATCH_ROOM,
  MAX_SPECTATORS,
  MatchMessage,
  RECONNECT_WINDOW_SECONDS,
  chatSendSchema,
  matchJoinOptionsSchema,
  type ChatAuthor,
  type ChatChannel,
  type ChatHistoryMessage,
  type ChatLine,
  type ChatSend,
  type EventsMessage,
  type JoinErrorCode,
  type MatchJoinOptions,
  type MatchServerMessages,
  type ParsedMatchJoinOptions,
  type RejectedMessage,
  type RejectionCode,
  type SnapshotMessage,
} from './match';
export { MatchPresence, SeatPresence } from './presence';
export {
  API,
  MAX_CARD_LOOKUP,
  type ApiError,
  type AuthConfig,
  type CardsResponse,
  type DeckSummaryDto,
  type DecksResponse,
  type DevAccount,
  type LoginResponse,
  type MatchListing,
  type MatchStatus,
  type MatchesResponse,
  type MeResponse,
  type UserDto,
} from './api';
