import { validateDeck } from '@sve/rules';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError, createHttpGateway } from './index';
import { FIXTURE_ACCOUNTS, createFixtureGateway, fixtureTokenFor } from './fixture';

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

describe('fixture gateway', () => {
  const gateway = createFixtureGateway();

  it('authenticates dev tokens and nothing else', async () => {
    expect(await gateway.authenticate(fixtureTokenFor('alice'))).toEqual({
      id: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    });
    expect(await gateway.authenticate('dev:mallory')).toBeNull();
    expect(await gateway.authenticate('alice')).toBeNull();
    expect(await gateway.authenticate('')).toBeNull();
  });

  it('gives every account decks the rules accept', async () => {
    const catalog = await gateway.catalog();
    for (const account of FIXTURE_ACCOUNTS) {
      const decks = await gateway.listDecks(fixtureTokenFor(account.id));
      expect(decks).toHaveLength(2);
      for (const deck of decks) {
        expect(validateDeck(deck.list, catalog), `${account.id}/${deck.name}`).toEqual([]);
      }
    }
  });

  it('only hands out a deck to its owner', async () => {
    const own = await gateway.getDeck(fixtureTokenFor('alice'), 'alice-sword');
    expect(own?.name).toBe('Swordcraft Starter');
    expect(await gateway.getDeck(fixtureTokenFor('bob'), 'alice-sword')).toBeNull();
    expect(await gateway.getDeck('dev:nobody', 'alice-sword')).toBeNull();
    expect(await gateway.listDecks('dev:nobody')).toEqual([]);
  });

  it('hands out Appendix A token prototypes', async () => {
    const tokens = await gateway.tokens();
    expect(tokens.get('Fairy')?.traits).toEqual(['Pixie']);
    expect(tokens.get('Fairy Wisp')?.traits).toEqual(['Pixie']);
  });
});

describe('HTTP gateway', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const wireCard = (id: string, extra: object = {}) => ({
    id,
    name: id.toUpperCase(),
    type: 'follower',
    class: 'swordcraft',
    cost: 2,
    attack: 2,
    defense: 3,
    ...extra,
  });

  const make = (
    handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
    options = {},
  ) => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(handler(new URL(urlOf(input)), init ?? {})),
    );
    const gateway = createHttpGateway({
      baseUrl: 'https://ss.example/',
      fetch: fetchMock,
      ...options,
    });
    return { gateway, fetchMock };
  };

  it('sends the user’s own token and maps the user', async () => {
    const { gateway, fetchMock } = make(() => json({ id: 'u1', username: 'Nyx', avatarUrl: null }));
    expect(await gateway.authenticate('tok')).toEqual({
      id: 'u1',
      displayName: 'Nyx',
      avatarUrl: null,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ss.example/api/v1/me');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('treats 401, 403 and 404 on /me as "not a valid token"', async () => {
    for (const status of [401, 403, 404]) {
      const { gateway } = make(() => new Response(null, { status }));
      expect(await gateway.authenticate('tok')).toBeNull();
    }
  });

  it('maps decks into rules deck lists', async () => {
    const { gateway } = make(() =>
      json({
        decks: [
          {
            id: 'd1',
            name: 'Mine',
            leader: 'L1',
            main: [{ card: 'c1', count: 3 }],
            evolve: [{ card: 'c1e', count: 1 }],
          },
        ],
      }),
    );
    expect(await gateway.listDecks('tok')).toEqual([
      {
        id: 'd1',
        name: 'Mine',
        list: {
          leader: 'L1',
          main: [{ card: 'c1', count: 3 }],
          evolve: [{ card: 'c1e', count: 1 }],
        },
      },
    ]);
  });

  it('escapes deck ids and returns null for a deck that is not theirs', async () => {
    const { gateway, fetchMock } = make(() => new Response(null, { status: 404 }));
    expect(await gateway.getDeck('tok', '../me')).toBeNull();
    expect(urlOf(fetchMock.mock.calls[0]?.[0] ?? '')).toBe(
      'https://ss.example/api/v1/decks/..%2Fme',
    );
  });

  it('reports an expired session as unauthorized', async () => {
    const { gateway } = make(() => new Response(null, { status: 401 }));
    await expect(gateway.listDecks('tok')).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(gateway.getDeck('tok', 'd1')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('distinguishes an unreachable upstream from a malformed one', async () => {
    const down = createHttpGateway({
      baseUrl: 'https://ss.example',
      fetch: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    await expect(down.authenticate('t')).rejects.toMatchObject({ code: 'unavailable' });

    const broken = make(() => new Response(null, { status: 502 }));
    await expect(broken.gateway.authenticate('t')).rejects.toBeInstanceOf(GatewayError);
    await expect(broken.gateway.authenticate('t')).rejects.toMatchObject({ code: 'unavailable' });

    const garbage = make(() => json({ nope: true }));
    await expect(garbage.gateway.authenticate('t')).rejects.toMatchObject({ code: 'badResponse' });
  });

  it('drops keywords it does not know and keeps the rest of the card', async () => {
    const { gateway } = make(() =>
      json({ cards: [wireCard('c1', { keywords: ['ward', 'time-travel'], text: 'Hi' })] }),
    );
    const card = (await gateway.catalog())('c1' as never);
    expect(card).toMatchObject({
      name: 'C1',
      keywords: ['ward'],
      text: 'Hi',
      special: null,
      artUrl: null,
    });
  });

  it('rejects a card it cannot trust rather than guessing', async () => {
    const { gateway } = make(() => json({ cards: [wireCard('c1', { class: 'cheatcraft' })] }));
    await expect(gateway.catalog()).rejects.toMatchObject({ code: 'badResponse' });
  });

  it('shares one catalog fetch between concurrent callers and caches it', async () => {
    let now = 0;
    const { gateway, fetchMock } = make(() => json({ cards: [wireCard('c1')] }), {
      catalogTtlMs: 1_000,
      now: () => now,
    });
    await Promise.all([gateway.catalog(), gateway.catalog(), gateway.catalog()]);
    await gateway.catalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = 1_500;
    await gateway.catalog();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps serving the old catalog when a refresh fails', async () => {
    let now = 0;
    let healthy = true;
    const { gateway } = make(
      () => (healthy ? json({ cards: [wireCard('c1')] }) : new Response(null, { status: 500 })),
      { catalogTtlMs: 1_000, now: () => now },
    );
    const first = await gateway.catalog();
    healthy = false;
    now = 5_000;
    const second = await gateway.catalog();
    expect(second('c1' as never)?.name).toBe('C1');
    expect(second).toBe(first);
  });

  it('builds token prototypes from catalog printings', async () => {
    const { gateway } = make(() =>
      json({
        cards: [
          wireCard('t1', {
            name: 'Fairy',
            special: 'token',
            traits: ['Pixie'],
            cost: 1,
            attack: 1,
            defense: 1,
            artUrl: 'https://example/fairy.webp',
          }),
        ],
      }),
    );
    const tokens = await gateway.tokens();
    expect(tokens.get('Fairy')).toMatchObject({
      name: 'Fairy',
      special: 'token',
      traits: ['Pixie'],
      artUrl: 'https://example/fairy.webp',
    });
    expect(tokens.get('Fairy Wisp')?.traits).toEqual(['Pixie']);
  });
});
