import type { CardClass, CardDefinition, DeckIssue } from '@sve/rules';

/** HTTP routes of the game server. Paths live here so the web app never hard-codes one. */
export const API = {
  authConfig: '/api/auth/config',
  devLogin: '/api/auth/dev-login',
  me: '/api/me',
  decks: '/api/decks',
  cards: '/api/cards',
  matches: '/api/matches',
  /** `GET /api/art/<file>`: card art, public, proxied from the image bucket. */
  art: '/api/art',
} as const;

export interface UserDto {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export interface DevAccount {
  readonly id: string;
  readonly displayName: string;
}

/**
 * How this deployment signs people in. With shadowshowdown.com wired up, the browser is sent to
 * `loginUrl` and comes back with a token; without it (local development) a fixture account
 * picker stands in.
 */
export type AuthConfig =
  | { readonly mode: 'shadowshowdown'; readonly loginUrl: string }
  | { readonly mode: 'fixture'; readonly accounts: readonly DevAccount[] };

export interface LoginResponse {
  readonly token: string;
  readonly user: UserDto;
}

export interface MeResponse {
  readonly user: UserDto;
}

/** A deck as the picker shows it, with the rules' verdict so an illegal deck is never offered. */
export interface DeckSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly leader: { readonly name: string; readonly cardClass: CardClass };
  readonly mainCount: number;
  readonly evolveCount: number;
  readonly legal: boolean;
  readonly issues: readonly DeckIssue[];
}

export interface DecksResponse {
  readonly decks: readonly DeckSummaryDto[];
}

/** The most card definitions one lookup may ask for: a match involves well under this many. */
export const MAX_CARD_LOOKUP = 120;

/**
 * Card definitions by id, for drawing cards. Match events carry ids only - shipping definitions
 * with them would hand each player the other's deck list - so the browser asks for the cards it
 * is about to draw. Ids the catalog does not know are left out.
 */
export interface CardsResponse {
  readonly cards: readonly CardDefinition[];
}

export type MatchStatus = 'waiting' | 'playing' | 'finished';

/** One row of the open-matches list. */
export interface MatchListing {
  readonly roomId: string;
  readonly title: string;
  readonly status: MatchStatus;
  readonly players: readonly string[];
  readonly spectators: number;
}

export interface MatchesResponse {
  readonly matches: readonly MatchListing[];
}

/** Error body shared by every route. */
export interface ApiError {
  readonly error: string;
}
