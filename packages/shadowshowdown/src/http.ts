import type { z } from 'zod';
import { createCatalogCache } from './catalog-cache';
import {
  cardsResponse,
  deckResponse,
  decksResponse,
  toCard,
  toDeck,
  toUser,
  userResponse,
} from './contract';
import { GatewayError } from './errors';
import { pickTokens } from './tokens';
import type { ShadowShowdownGateway, SsDeck, SsUser } from './types';

export interface HttpGatewayOptions {
  /** Origin of the API, e.g. `https://shadowshowdown.com`. */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  /** Per-request timeout. A slow upstream must not hold a match hostage. */
  readonly timeoutMs?: number;
  /** How long a fetched catalog is served before it is refreshed. */
  readonly catalogTtlMs?: number;
  /** Injected for tests. */
  readonly now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CATALOG_TTL_MS = 10 * 60_000;

/** The production gateway: talks to shadowshowdown.com over HTTPS with the user's own token. */
export function createHttpGateway(options: HttpGatewayOptions): ShadowShowdownGateway {
  const {
    baseUrl,
    fetch: doFetch = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    catalogTtlMs = DEFAULT_CATALOG_TTL_MS,
    now = Date.now,
  } = options;
  const origin = baseUrl.replace(/\/+$/, '');

  async function request<S extends z.ZodType>(
    path: string,
    schema: S,
    token?: string,
  ): Promise<{ status: number; body: z.output<S> | null }> {
    let response: Response;
    try {
      response = await doFetch(`${origin}${path}`, {
        headers: {
          accept: 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new GatewayError('unavailable', `shadowshowdown.com unreachable: ${path}`, { cause });
    }

    if (response.status === 401 || response.status === 403) return { status: 401, body: null };
    if (response.status === 404) return { status: 404, body: null };
    if (!response.ok) {
      throw new GatewayError(
        'unavailable',
        `shadowshowdown.com answered ${response.status} for ${path}`,
      );
    }

    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      throw new GatewayError('badResponse', `Unexpected response shape for ${path}`, {
        cause: parsed.error,
      });
    }
    return { status: response.status, body: parsed.data };
  }

  const catalog = createCatalogCache({
    ttlMs: catalogTtlMs,
    now,
    load: async () => {
      const { body } = await request('/api/v1/cards?game=sve', cardsResponse);
      if (!body) throw new GatewayError('badResponse', 'The card catalog is not available');
      return body.cards.map(toCard);
    },
  });

  return {
    async authenticate(token): Promise<SsUser | null> {
      const { body } = await request('/api/v1/me', userResponse, token);
      return body ? toUser(body) : null;
    },

    async listDecks(token): Promise<readonly SsDeck[]> {
      const { body } = await request('/api/v1/decks?game=sve', decksResponse, token);
      if (!body)
        throw new GatewayError('unauthorized', 'The shadowshowdown.com session has expired');
      return body.decks.map(toDeck);
    },

    async getDeck(token, deckId): Promise<SsDeck | null> {
      const { status, body } = await request(
        `/api/v1/decks/${encodeURIComponent(deckId)}`,
        deckResponse,
        token,
      );
      if (status === 401)
        throw new GatewayError('unauthorized', 'The shadowshowdown.com session has expired');
      return body ? toDeck(body) : null;
    },

    catalog,

    async tokens() {
      const { body } = await request('/api/v1/cards?game=sve', cardsResponse);
      if (!body) throw new GatewayError('badResponse', 'The card catalog is not available');
      return pickTokens(body.cards.map(toCard));
    },
  };
}
