import { describe, expect, it } from 'vitest';
import { hrefFor, parseRoute } from './route';

describe('routes', () => {
  it('opens the lobby by default, however the address is empty or odd', () => {
    for (const hash of ['', '#', '#/', '#/nowhere', '#/match'])
      expect(parseRoute(hash)).toEqual({ name: 'lobby' });
  });

  it('knows a match by its room id', () => {
    expect(parseRoute('#/match/abc123')).toEqual({ name: 'match', roomId: 'abc123' });
    expect(parseRoute('#/match/abc123/')).toEqual({ name: 'match', roomId: 'abc123' });
  });

  it('round-trips every route, including an id that needs escaping', () => {
    for (const route of [
      { name: 'lobby' },
      { name: 'lab' },
      { name: 'match', roomId: 'a/b c' },
    ] as const) {
      expect(parseRoute(hrefFor(route))).toEqual(route);
    }
  });
});
