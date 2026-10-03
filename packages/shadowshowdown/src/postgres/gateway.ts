import { createHash, timingSafeEqual } from 'node:crypto';
import { createCatalogCache } from '../catalog-cache';
import { GatewayError } from '../errors';
import type { ShadowShowdownGateway, SsDeck, SsUser } from '../types';
import { pickTokens } from '../tokens';
import {
  toCardDefinition,
  toDeckList,
  type CardMapping,
  type CardRow,
  type DeckCardRow,
} from './rows';

/** The one slice of `pg.Pool` this gateway needs, so tests can hand it canned rows. */
export interface SqlClient {
  query<Row>(text: string, values?: readonly unknown[]): Promise<{ readonly rows: Row[] }>;
}

export interface PostgresGatewayOptions {
  readonly db: SqlClient;
  /**
   * Accept `dev:<userId>` tokens (see `devTokenFor`). They skip Sanctum entirely, so they exist
   * for local development only and the server never enables them in production.
   */
  readonly allowDevTokens?: boolean;
  /** Path the server serves card art from. */
  readonly artPath?: string;
  /** Decks listed per player, newest first. Some accounts own hundreds. */
  readonly deckLimit?: number;
  readonly catalogTtlMs?: number;
  /** Injected for tests. */
  readonly now?: () => number;
}

export interface PostgresGateway extends ShadowShowdownGateway {
  /** Accounts that own at least one deck the rules would accept, for the dev sign-in picker. */
  playableAccounts(limit: number): Promise<readonly SsUser[]>;
  /**
   * A second seat for developing alone: a stand-in account that plays `owner`'s decks. It only
   * authenticates when dev tokens are on.
   */
  sparringPartnerFor(owner: SsUser): SsUser;
}

export const devTokenFor = (userId: string): string => `dev:${userId}`;

const DEFAULT_ART_PATH = '/api/art';
const DEFAULT_DECK_LIMIT = 60;
const DEFAULT_CATALOG_TTL_MS = 10 * 60_000;

/** Laravel Sanctum issues `<token id>|<40 random chars>` and stores only the sha256 of the latter. */
const SPARRING_PREFIX = 'sparring:';
const SANCTUM_TOKEN = /^(\d{1,18})\|([A-Za-z0-9]{20,80})$/;
const USER_ID = /^\d{1,18}$/;

interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
}

interface TokenRow {
  readonly token: string;
  readonly tokenable_id: string;
  readonly tokenable_type: string;
  readonly expires_at: Date | string | null;
}

interface DeckRow {
  readonly id: string;
  readonly name: string;
}

const SPARRING_NAME = 'Sparring partner';

const toUser = (row: UserRow): SsUser => ({
  id: row.id,
  displayName: row.name,
  avatarUrl: row.avatar && /^https?:\/\//.test(row.avatar) ? row.avatar : null,
});

const sha256 = (plain: string): Buffer => createHash('sha256').update(plain).digest();

/** A deck is a legal *shape* when it has one leader and a 40-50 card main deck (2.4). */
const PLAYABLE_DECK = `
  exists (
    select 1 from decks d
    where d.user_id = u.id
      and (select count(*) from deck_cards dc join cards c on c.id = dc.card_id
           where dc.deck_id = d.id and c.main_type = 'Leader') = 1
      and (select coalesce(sum(dc.quantity), 0) from deck_cards dc join cards c on c.id = dc.card_id
           where dc.deck_id = d.id and c.main_type <> 'Leader'
             and coalesce(c.sub_type, '') <> 'Evolved') between 40 and 50
  )`;

/**
 * Reads identity, decks and cards straight from the shadowrates database. Strictly read-only:
 * it never writes, and the pool the server hands it is opened with a read-only session.
 */
export function createPostgresGateway(options: PostgresGatewayOptions): PostgresGateway {
  const {
    db,
    allowDevTokens = false,
    artPath = DEFAULT_ART_PATH,
    deckLimit = DEFAULT_DECK_LIMIT,
    catalogTtlMs = DEFAULT_CATALOG_TTL_MS,
    now = Date.now,
  } = options;

  const mapping: CardMapping = {
    artUrlFor: (image) => `${artPath.replace(/\/+$/, '')}/${encodeURIComponent(image)}`,
  };

  async function query<Row>(text: string, values: readonly unknown[] = []): Promise<Row[]> {
    try {
      return (await db.query<Row>(text, values)).rows;
    } catch (cause) {
      throw new GatewayError('unavailable', 'The shadowrates database could not be read', {
        cause,
      });
    }
  }

  async function userById(id: string): Promise<SsUser | null> {
    if (allowDevTokens && id.startsWith(SPARRING_PREFIX)) {
      const owner = await userById(id.slice(SPARRING_PREFIX.length));
      return owner && !owner.id.startsWith(SPARRING_PREFIX) ? sparringPartnerFor(owner) : null;
    }
    if (!USER_ID.test(id)) return null;
    const [row] = await query<UserRow>('select id, name, avatar from users where id = $1', [id]);
    return row ? toUser(row) : null;
  }

  async function sanctumUser(token: string): Promise<SsUser | null> {
    const match = SANCTUM_TOKEN.exec(token);
    if (!match) return null;
    const [, tokenId = '', plain = ''] = match;
    const [row] = await query<TokenRow>(
      `select token, tokenable_id, tokenable_type, expires_at
         from personal_access_tokens where id = $1`,
      [tokenId],
    );
    if (!row?.tokenable_type.endsWith('User')) return null;

    const expected = Buffer.from(row.token, 'hex');
    const actual = sha256(plain);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() <= now()) return null;
    return userById(row.tokenable_id);
  }

  async function authenticate(token: string): Promise<SsUser | null> {
    if (allowDevTokens && token.startsWith('dev:')) return userById(token.slice(4));
    return sanctumUser(token);
  }

  function sparringPartnerFor(owner: SsUser): SsUser {
    return { id: `${SPARRING_PREFIX}${owner.id}`, displayName: SPARRING_NAME, avatarUrl: null };
  }

  /** Whose decks an account plays: its own, or the owner's for a sparring partner. */
  const deckOwnerOf = (user: SsUser): string =>
    user.id.startsWith(SPARRING_PREFIX) ? user.id.slice(SPARRING_PREFIX.length) : user.id;

  async function decksOf(deckRows: readonly DeckRow[]): Promise<SsDeck[]> {
    if (deckRows.length === 0) return [];
    const cardRows = await query<DeckCardRow>(
      `select dc.deck_id, dc.card_id, dc.quantity, c.main_type, c.sub_type
         from deck_cards dc join cards c on c.id = dc.card_id
        where dc.deck_id = any($1::bigint[])`,
      [deckRows.map((deck) => deck.id)],
    );
    return deckRows.map((deck) => ({
      id: deck.id,
      name: deck.name,
      list: toDeckList(cardRows.filter((row) => row.deck_id === deck.id)),
    }));
  }

  async function requireUser(token: string): Promise<SsUser> {
    const user = await authenticate(token);
    if (!user) throw new GatewayError('unauthorized', 'The shadowshowdown.com session has expired');
    return user;
  }

  return {
    authenticate,

    async listDecks(token): Promise<readonly SsDeck[]> {
      const user = await requireUser(token);
      const rows = await query<DeckRow>(
        `select id, name from decks where user_id = $1
          order by updated_at desc nulls last, id desc limit $2`,
        [deckOwnerOf(user), deckLimit],
      );
      return decksOf(rows);
    },

    async getDeck(token, deckId): Promise<SsDeck | null> {
      const user = await requireUser(token);
      if (!USER_ID.test(deckId)) return null;
      const rows = await query<DeckRow>(
        'select id, name from decks where id = $1 and user_id = $2',
        [deckId, deckOwnerOf(user)],
      );
      return (await decksOf(rows))[0] ?? null;
    },

    catalog: createCatalogCache({
      ttlMs: catalogTtlMs,
      now,
      load: async () => {
        const rows = await query<CardRow>(
          `select c.id, c.name, c.original_card_id, cr.name as craft, c.main_type, c.sub_type, c.cost,
                  c.atk, c.health, c.traits, c.abilities, c.effects, c.image
             from cards c join crafts cr on cr.id = c.craft_id`,
        );
        return rows.flatMap((row) => toCardDefinition(row, mapping) ?? []);
      },
    }),

    async tokens() {
      const rows = await query<CardRow>(
        `select c.id, c.name, c.original_card_id, cr.name as craft, c.main_type, c.sub_type, c.cost,
                c.atk, c.health, c.traits, c.abilities, c.effects, c.image
           from cards c join crafts cr on cr.id = c.craft_id
          where c.sub_type = 'Token'
          order by c.name, (c.image is null), c.id::bigint`,
      );
      return pickTokens(rows.flatMap((row) => toCardDefinition(row, mapping) ?? []));
    },

    sparringPartnerFor,

    async playableAccounts(limit): Promise<readonly SsUser[]> {
      const rows = await query<UserRow>(
        `select u.id, u.name, u.avatar from users u where ${PLAYABLE_DECK} order by u.id limit $1`,
        [limit],
      );
      return rows.map(toUser);
    },
  };
}
