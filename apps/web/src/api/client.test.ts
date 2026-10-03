import { MAX_CARD_LOOKUP } from '@sve/protocol';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiFailure } from './client';

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

function clientWith(
  respond: (url: string, init: RequestInit) => Response | Promise<Response>,
  token: string | null = 't0k',
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    calls.push({ url, init: init ?? {} });
    return Promise.resolve(respond(url, init ?? {}));
  }) as unknown as typeof fetch;
  return { client: new ApiClient('https://game.test', () => token, fetchImpl), calls };
}

describe('ApiClient', () => {
  it('sends the session token as a bearer credential', async () => {
    const { client, calls } = clientWith(() =>
      reply({ user: { id: 'a', displayName: 'A', avatarUrl: null } }),
    );
    await client.me();
    expect(calls[0]?.url).toBe('https://game.test/api/me');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer t0k');
  });

  it('sends nothing secret when signed out', async () => {
    const { client, calls } = clientWith(() => reply({ mode: 'fixture', accounts: [] }), null);
    await client.authConfig();
    expect(new Headers(calls[0]?.init.headers).has('authorization')).toBe(false);
  });

  it('turns an error body into a failure carrying the status and the server’s words', async () => {
    const { client } = clientWith(() => reply({ message: 'Your session has expired' }, 401));
    const failure = await client.me().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({
      status: 401,
      message: 'Your session has expired',
      unauthorized: true,
    });
  });

  it('copes with an error that has no readable body', async () => {
    const { client } = clientWith(() => new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(client.decks()).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    });
  });

  it('reports an unreachable server as status 0', async () => {
    const client = new ApiClient(
      'https://game.test',
      () => null,
      () => Promise.reject(new TypeError('network')),
    );
    await expect(client.matches()).rejects.toMatchObject({
      status: 0,
      message: 'The game server is unreachable',
    });
  });

  it('posts a dev login as JSON', async () => {
    const { client, calls } = clientWith(() =>
      reply({ token: 'dev:alice', user: { id: 'alice', displayName: 'Alice', avatarUrl: null } }),
    );
    await client.devLogin('alice');
    expect(calls[0]?.init).toMatchObject({ method: 'POST', body: '{"account":"alice"}' });
  });

  it('looks cards up in batches the server will accept', async () => {
    const ids = Array.from({ length: MAX_CARD_LOOKUP * 2 + 5 }, (_, i) => `c${i}`);
    const { client, calls } = clientWith((url) => {
      const asked = decodeURIComponent(url.split('ids=')[1] ?? '').split(',');
      return reply({ cards: asked.map((id) => ({ id })) });
    });
    const cards = await client.cards(ids);
    expect(calls).toHaveLength(3);
    expect(cards).toHaveLength(ids.length);
    expect(await client.cards([])).toEqual([]);
  });

  it('turns the server art paths into URLs the canvas can load', async () => {
    const { client } = clientWith(() =>
      reply({
        cards: [
          { id: 'a', artUrl: '/api/art/a.webp' },
          { id: 'b', artUrl: 'https://cdn.example/b.webp' },
          { id: 'c', artUrl: null },
        ],
      }),
    );
    const cards = await client.cards(['a', 'b', 'c']);
    expect(cards.map((card) => card.artUrl)).toEqual([
      'https://game.test/api/art/a.webp',
      'https://cdn.example/b.webp',
      null,
    ]);
  });
});
