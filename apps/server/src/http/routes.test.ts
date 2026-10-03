import type { ColyseusTestServer } from '@colyseus/testing';
import {
  MAX_CARD_LOOKUP,
  type AuthConfig,
  type CardsResponse,
  type DecksResponse,
  type LoginResponse,
  type MatchesResponse,
  type MeResponse,
} from '@sve/protocol';
import { GatewayError, type ShadowShowdownGateway } from '@sve/shadowshowdown';
import { fixtureTokenFor } from '@sve/shadowshowdown/fixture';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { integrationFor } from '../integration';
import { createServer } from '../server';
import type { ArtSource } from './art';
import { TestUser, listenOn } from '../testing/test-player';

const PORT = 2571;
const WEB_ORIGIN = 'https://battle.example.test';

let colyseus: ColyseusTestServer;
let outage = false;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
/** Real card images run past 64 KB, where a socket pushes back on a single write. */
const BIG = Uint8Array.from({ length: 300_000 }, (_, index) => index % 251);
/** Knows two files: one that exists and one the bucket cannot reach. */
const fakeArt: ArtSource = {
  get: (file) => {
    if (file === 'BP01-001EN.webp')
      return Promise.resolve({ body: PNG, contentType: 'image/webp' });
    if (file === 'BP01-003EN.webp')
      return Promise.resolve({ body: BIG, contentType: 'image/webp' });
    if (file === 'BP01-002EN.webp') return Promise.reject(new Error('bucket down'));
    return Promise.resolve(null);
  },
};

/** The fixture gateway, a deck that cannot be played, and a switch that takes the site down. */
function flakyGateway(inner: ShadowShowdownGateway): ShadowShowdownGateway {
  const guard = <T>(work: () => Promise<T>): Promise<T> =>
    outage ? Promise.reject(new GatewayError('unavailable', 'shadowshowdown.com is down')) : work();
  return {
    authenticate: (token) => guard(() => inner.authenticate(token)),
    catalog: () => guard(() => inner.catalog()),
    tokens: () => guard(() => inner.tokens()),
    getDeck: (token, id) => guard(() => inner.getDeck(token, id)),
    async listDecks(token) {
      const decks = await guard(() => inner.listDecks(token));
      const [first] = decks;
      return first
        ? [
            ...decks,
            {
              ...first,
              id: `${first.id}-short`,
              name: 'Half a deck',
              list: { ...first.list, main: first.list.main.slice(0, 5) },
            },
          ]
        : decks;
    },
  };
}

beforeAll(async () => {
  const integration = await integrationFor(loadConfig({}));
  colyseus = await listenOn(
    createServer({
      ...integration,
      gateway: flakyGateway(integration.gateway),
      art: fakeArt,
      webOrigin: WEB_ORIGIN,
      gracefullyShutdown: false,
    }),
    PORT,
  );
});

afterEach(async () => {
  outage = false;
  await colyseus.cleanup();
});
afterAll(() => colyseus.shutdown());

const url = (path: string) => `http://127.0.0.1:${PORT}${path}`;

/** Call the API as a signed-in fixture account (or anonymously). */
function api(path: string, options: { as?: string; authorization?: string; body?: unknown } = {}) {
  const authorization =
    options.authorization ?? (options.as ? `Bearer ${fixtureTokenFor(options.as)}` : undefined);
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  if (options.body === undefined) return fetch(url(path), { headers });

  headers['content-type'] = 'application/json';
  return fetch(url(path), { method: 'POST', headers, body: JSON.stringify(options.body) });
}

/** The body of a successful response, typed by the caller (the shapes come from `@sve/protocol`). */
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.url} answered ${response.status}`);
  return (await response.json()) as T;
}

const statusOf = async (response: Promise<Response>): Promise<number> => (await response).status;

describe('signing in', () => {
  it('tells the browser how this deployment signs people in', async () => {
    const data = await json<AuthConfig>(await api('/api/auth/config'));
    expect(data.mode).toBe('fixture');
    if (data.mode === 'fixture')
      expect(data.accounts.map((account) => account.id)).toEqual(['alice', 'bob', 'carol']);
  });

  it('offers a fixture login that yields a token the rest of the API accepts', async () => {
    const data = await json<LoginResponse>(
      await api('/api/auth/dev-login', { body: { account: 'alice' } }),
    );
    expect(data.user).toEqual({ id: 'alice', displayName: 'Alice', avatarUrl: null });

    const me = await json<MeResponse>(
      await api('/api/me', { authorization: `Bearer ${data.token}` }),
    );
    expect(me.user.id).toBe('alice');
  });

  it('has no fixture login for an account that does not exist', async () => {
    expect(await statusOf(api('/api/auth/dev-login', { body: { account: 'mallory' } }))).toBe(404);
  });

  it('is shut for everyone without a valid token', async () => {
    expect(await statusOf(api('/api/me'))).toBe(401);
    expect(await statusOf(api('/api/me', { authorization: 'Basic abc' }))).toBe(401);
    expect(await statusOf(api('/api/me', { authorization: 'Bearer dev:mallory' }))).toBe(401);
    expect(await statusOf(api('/api/decks'))).toBe(401);
    expect(await statusOf(api('/api/matches'))).toBe(401);
  });

  it('says so when shadowshowdown.com is unreachable, rather than that you are signed out', async () => {
    outage = true;
    expect(await statusOf(api('/api/me', { as: 'alice' }))).toBe(502);
  });

  it('only advertises itself to the configured web origin', async () => {
    const response = await api('/api/auth/config');
    expect(response.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
  });
});

describe('decks', () => {
  it('lists the user’s decks with the rules’ verdict on each', async () => {
    const data = await json<DecksResponse>(await api('/api/decks', { as: 'alice' }));
    expect(data.decks.map((deck) => [deck.id, deck.legal])).toEqual([
      ['alice-sword', true],
      ['alice-forest', true],
      ['alice-sword-short', false],
    ]);

    const [legal] = data.decks;
    expect(legal).toMatchObject({
      name: 'Swordcraft Starter',
      mainCount: 40,
      evolveCount: 5,
      issues: [],
      leader: { cardClass: 'swordcraft' },
    });

    const short = data.decks.at(-1);
    expect(short?.issues.length).toBeGreaterThan(0);
    expect(short?.mainCount).toBe(10);
  });

  it('never lists a deck that is not the caller’s', async () => {
    const data = await json<DecksResponse>(await api('/api/decks', { as: 'bob' }));
    expect(data.decks.every((deck) => deck.id.startsWith('bob-'))).toBe(true);
  });

  it('reports an outage as one', async () => {
    outage = true;
    expect(await statusOf(api('/api/decks', { as: 'alice' }))).toBe(502);
  });
});

describe('cards', () => {
  const lookup = (ids: string) => api(`/api/cards?ids=${encodeURIComponent(ids)}`, { as: 'alice' });

  it('returns the definitions asked for, and leaves out ids the catalog does not know', async () => {
    const data = await json<CardsResponse>(await lookup('fx-ashen-squire,fx-moss-fawn,nope'));
    expect(data.cards.map((card) => card.id).sort()).toEqual(['fx-ashen-squire', 'fx-moss-fawn']);
    expect(data.cards[0]).toMatchObject({
      name: expect.any(String),
      cardClass: expect.any(String),
    });
  });

  it('ignores repeats and stray commas', async () => {
    const data = await json<CardsResponse>(await lookup(',fx-ashen-squire,,fx-ashen-squire,'));
    expect(data.cards).toHaveLength(1);
  });

  it('refuses a lookup of an unreasonable size, or none at all', async () => {
    const many = Array.from({ length: MAX_CARD_LOOKUP + 1 }, (_, i) => `c${i}`).join(',');
    expect(await statusOf(lookup(many))).toBe(400);
    expect(await statusOf(api('/api/cards', { as: 'alice' }))).toBe(400);
  });

  it('is for signed-in users, and reports an outage as one', async () => {
    expect(await statusOf(api('/api/cards?ids=fx-moss-fawn'))).toBe(401);
    outage = true;
    expect(await statusOf(lookup('fx-moss-fawn'))).toBe(502);
  });
});

describe('open matches', () => {
  const listed = async () =>
    (await json<MatchesResponse>(await api('/api/matches', { as: 'carol' }))).matches;

  it('lists tables with who is seated, and only what a lobby may show', async () => {
    expect(await listed()).toEqual([]);

    const alice = await new TestUser('alice', PORT).create({
      role: 'player',
      deckId: 'alice-sword',
    });
    await vi.waitFor(async () => {
      expect(await listed()).toEqual([
        {
          roomId: alice.room.roomId,
          title: "Alice's match",
          status: 'waiting',
          players: ['Alice'],
          spectators: 0,
        },
      ]);
    });

    await new TestUser('bob', PORT).join(alice.room.roomId, {
      role: 'player',
      deckId: 'bob-forest',
    });
    await vi.waitFor(async () => {
      const [match] = await listed();
      expect(match).toMatchObject({ status: 'playing', players: ['Alice', 'Bob'] });
    });
    expect(JSON.stringify(await listed())).not.toMatch(/dev:|token|deck/i);
  });
});

describe('card art', () => {
  it('serves art to anyone, cacheable, to the web origin only', async () => {
    const response = await api('/api/art/BP01-001EN.webp');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toMatch(/immutable/);
    expect(response.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('finishes serving an image too large for one socket write', async () => {
    // Without the better-call patch (patches/), the response never ended and the browser hung.
    const response = await api('/api/art/BP01-003EN.webp');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBe(BIG.byteLength);
    expect(body).toEqual(BIG);
  }, 5000);

  it('refuses names that are not card art, without asking upstream', async () => {
    expect(await statusOf(api('/api/art/BP01-999EN.webp'))).toBe(404);
    expect(await statusOf(api('/api/art/secret.txt'))).toBe(404);
    expect(await statusOf(api('/api/art/..%2Fetc%2Fpasswd'))).toBe(404);
  });

  it('says the art is unavailable when the bucket is down', async () => {
    expect(await statusOf(api('/api/art/BP01-002EN.webp'))).toBe(502);
  });
});
