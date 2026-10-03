import { createEndpoint, createMiddleware, createRouter, matchMaker } from '@colyseus/core';
import {
  API,
  MATCH_ROOM,
  MAX_CARD_LOOKUP,
  type AuthConfig,
  type CardsResponse,
  type DeckSummaryDto,
  type DecksResponse,
  type LoginResponse,
  type MatchListing,
  type MatchesResponse,
  type MeResponse,
  type UserDto,
} from '@sve/protocol';
import { asCardDefId, sizeOf, validateDeck, type CardCatalog, type DeckList } from '@sve/rules';
import { withScriptedFlag } from '@sve/cards';
import {
  GatewayError,
  type ShadowShowdownGateway,
  type SsDeck,
  type SsUser,
} from '@sve/shadowshowdown';
import { z } from 'zod';
import { ART_FILE, type ArtSource } from './art';

export interface HttpDeps {
  readonly gateway: ShadowShowdownGateway;
  readonly authConfig: AuthConfig;
  /**
   * Fixture sign-in: turns an account id into a login. `null` outside development, where the
   * only way in is shadowshowdown.com and this route does not exist.
   */
  readonly devLogin: ((accountId: string) => Promise<LoginResponse | null>) | null;
  /** Where card art comes from. `null` when the cards carry no art. */
  readonly art: ArtSource | null;
}

export interface RouteDeps extends HttpDeps {
  /** Art is loaded into a WebGL canvas, so the browser needs explicit CORS permission. */
  readonly webOrigin: string;
}

const toUserDto = (user: SsUser): UserDto => ({
  id: user.id,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
});

function toDeckSummary(deck: SsDeck, catalog: CardCatalog): DeckSummaryDto {
  const { list } = deck;
  const leader = catalog(list.leader);
  const issues = validateDeck(list, catalog);
  return {
    id: deck.id,
    name: deck.name,
    leader: { name: leader?.name ?? 'Unknown leader', cardClass: leader?.cardClass ?? 'neutral' },
    mainCount: sizeOf(list.main),
    evolveCount: sizeOf((list satisfies DeckList).evolve),
    legal: issues.length === 0,
    issues,
  };
}

const listingMetadata = z.object({
  title: z.string(),
  status: z.enum(['waiting', 'playing', 'finished']),
  players: z.array(z.string()),
  spectators: z.number(),
});

export function createRoutes(deps: RouteDeps) {
  const { gateway } = deps;

  /** Resolves the bearer token once per request; every private route builds on this. */
  const requireSession = createMiddleware(async (ctx) => {
    const token = /^Bearer (.+)$/i.exec(ctx.headers?.get('authorization') ?? '')?.[1];
    if (!token) throw ctx.error('UNAUTHORIZED', { message: 'Sign in to continue' });

    let user: SsUser | null;
    try {
      user = await gateway.authenticate(token);
    } catch (error) {
      if (error instanceof GatewayError && error.code !== 'unauthorized') {
        throw ctx.error('BAD_GATEWAY', { message: 'shadowshowdown.com is unavailable' });
      }
      throw error;
    }
    if (!user) throw ctx.error('UNAUTHORIZED', { message: 'Your session has expired' });
    return { token, user };
  });

  const authConfig = createEndpoint(API.authConfig, { method: 'GET' }, () =>
    Promise.resolve(deps.authConfig),
  );

  const devLogin = createEndpoint(
    API.devLogin,
    { method: 'POST', body: z.object({ account: z.string().min(1).max(64) }) },
    async (ctx): Promise<LoginResponse> => {
      const login = (await deps.devLogin?.(ctx.body.account)) ?? null;
      if (!login) throw ctx.error('NOT_FOUND', { message: 'No such account' });
      return login;
    },
  );

  const me = createEndpoint(
    API.me,
    { method: 'GET', use: [requireSession] },
    (ctx): Promise<MeResponse> => Promise.resolve({ user: toUserDto(ctx.context.user) }),
  );

  const decks = createEndpoint(
    API.decks,
    { method: 'GET', use: [requireSession] },
    async (ctx): Promise<DecksResponse> => {
      try {
        const [owned, catalog] = await Promise.all([
          gateway.listDecks(ctx.context.token),
          gateway.catalog(),
        ]);
        return { decks: owned.map((deck) => toDeckSummary(deck, catalog)) };
      } catch (error) {
        if (error instanceof GatewayError) {
          throw ctx.error(error.code === 'unauthorized' ? 'UNAUTHORIZED' : 'BAD_GATEWAY', {
            message: error.message,
          });
        }
        throw error;
      }
    },
  );

  const cards = createEndpoint(
    API.cards,
    {
      method: 'GET',
      use: [requireSession],
      // `?ids=a,b,c`: card definition ids never contain a comma.
      query: z.object({
        ids: z
          .string()
          .max(4000)
          .transform((list) => [...new Set(list.split(',').filter((id) => id.length > 0))])
          .refine(
            (ids) => ids.length <= MAX_CARD_LOOKUP,
            `Ask for at most ${MAX_CARD_LOOKUP} cards`,
          ),
      }),
    },
    async (ctx): Promise<CardsResponse> => {
      try {
        const catalog = withScriptedFlag(await gateway.catalog());
        const found = ctx.query.ids.flatMap((id) => catalog(asCardDefId(id)) ?? []);
        return { cards: found };
      } catch (error) {
        if (error instanceof GatewayError) {
          throw ctx.error('BAD_GATEWAY', { message: error.message });
        }
        throw error;
      }
    },
  );

  const matches = createEndpoint(
    API.matches,
    { method: 'GET', use: [requireSession] },
    async (): Promise<MatchesResponse> => {
      const rooms = await matchMaker.query({ name: MATCH_ROOM });
      const listings = rooms.flatMap((room): MatchListing[] => {
        const metadata = listingMetadata.safeParse(room.metadata);
        return metadata.success ? [{ roomId: room.roomId, ...metadata.data }] : [];
      });
      return { matches: listings };
    },
  );

  const art = createEndpoint(
    `${API.art}/:file`,
    { method: 'GET' },
    async (ctx): Promise<Response> => {
      const file = ctx.params.file;
      if (!deps.art || !ART_FILE.test(file))
        throw ctx.error('NOT_FOUND', { message: 'No such art' });

      let image;
      try {
        image = await deps.art.get(file);
      } catch {
        throw ctx.error('BAD_GATEWAY', { message: 'The card art is unavailable' });
      }
      if (!image) throw ctx.error('NOT_FOUND', { message: 'No such art' });

      return new Response(image.body as ConstructorParameters<typeof Response>[0], {
        headers: {
          'content-type': image.contentType,
          // Art for a given file never changes.
          'cache-control': 'public, max-age=604800, immutable',
          'access-control-allow-origin': deps.webOrigin,
          'cross-origin-resource-policy': 'cross-origin',
        },
      });
    },
  );

  return createRouter({ authConfig, devLogin, me, decks, cards, matches, art });
}
