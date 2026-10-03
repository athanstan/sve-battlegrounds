import type { CardCatalog, CardDefinition, DeckList } from '@sve/rules';

/** A person, as shadowshowdown.com knows them. Shadow Showdown owns identity; we only ever read it. */
export interface SsUser {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

/** A saved deck, as its owner built it there. Legality is judged by the rules, not trusted. */
export interface SsDeck {
  readonly id: string;
  readonly name: string;
  readonly list: DeckList;
}

/**
 * Everything the game needs from shadowshowdown.com, and nothing more.
 *
 * The server holds one of these. Where it comes from (HTTP, a fixture) is decided at startup;
 * no other code knows what the remote API looks like. Tokens are the user's own: a deck is only
 * ever fetched with the token of the person who owns it, so we never read someone else's deck.
 */
export interface ShadowShowdownGateway {
  /** Resolve a bearer token to its user, or `null` when the token is not valid. */
  authenticate(token: string): Promise<SsUser | null>;

  /** The caller's decks. Throws `GatewayError('unauthorized')` if the token has expired. */
  listDecks(token: string): Promise<readonly SsDeck[]>;

  /** One of the caller's decks, or `null` when it does not exist or is not theirs. */
  getDeck(token: string, deckId: string): Promise<SsDeck | null>;

  /** The card catalog. Cheap to call repeatedly; implementations cache and refresh. */
  catalog(): Promise<CardCatalog>;

  /**
   * Token prototypes keyed by printed name (Appendix A). Lowest id that has art wins when
   * several printings share a name.
   */
  tokens(): Promise<ReadonlyMap<string, CardDefinition>>;
}
