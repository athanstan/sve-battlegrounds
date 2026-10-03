import {
  API,
  MAX_CARD_LOOKUP,
  type ApiError,
  type AuthConfig,
  type CardsResponse,
  type DecksResponse,
  type LoginResponse,
  type MatchesResponse,
  type MeResponse,
} from '@sve/protocol';
import type { CardDefinition } from '@sve/rules';

/** The game server answered with an error, or could not be reached (`status` 0). */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }

  get unauthorized(): boolean {
    return this.status === 401;
  }
}

/**
 * The game server's HTTP API, typed from `@sve/protocol`. The one place that knows paths, headers
 * and how an error body looks; everything else asks it for data.
 */
export class ApiClient {
  readonly #base: string;
  readonly #token: () => string | null;
  readonly #fetch: typeof fetch;

  constructor(
    base: string,
    token: () => string | null,
    fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    this.#base = base;
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const token = this.#token();
    if (token) headers.set('authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await this.#fetch(`${this.#base}${path}`, { ...init, headers });
    } catch {
      throw new ApiFailure(0, 'The game server is unreachable');
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        (Partial<ApiError> & { message?: string }) | null;
      throw new ApiFailure(
        response.status,
        body?.message ?? body?.error ?? `Request failed (${response.status})`,
      );
    }
    return (await response.json()) as T;
  }

  authConfig(): Promise<AuthConfig> {
    return this.#request(API.authConfig);
  }

  devLogin(account: string): Promise<LoginResponse> {
    return this.#request(API.devLogin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account }),
    });
  }

  me(): Promise<MeResponse> {
    return this.#request(API.me);
  }

  decks(): Promise<DecksResponse> {
    return this.#request(API.decks);
  }

  matches(): Promise<MatchesResponse> {
    return this.#request(API.matches);
  }

  /** The server names art by path (`/api/art/x.webp`); the canvas needs a full URL. */
  #withAbsoluteArt(card: CardDefinition): CardDefinition {
    return card.artUrl?.startsWith('/') ? { ...card, artUrl: `${this.#base}${card.artUrl}` } : card;
  }

  /** Definitions for the given ids, in as many requests as the server's limit needs. */
  async cards(ids: readonly string[]): Promise<CardDefinition[]> {
    const found: CardDefinition[] = [];
    for (let from = 0; from < ids.length; from += MAX_CARD_LOOKUP) {
      const batch = ids.slice(from, from + MAX_CARD_LOOKUP);
      const response = await this.#request<CardsResponse>(
        `${API.cards}?ids=${encodeURIComponent(batch.join(','))}`,
      );
      found.push(...response.cards.map((card) => this.#withAbsoluteArt(card)));
    }
    return found;
  }
}
