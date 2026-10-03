import type { AuthConfig, UserDto } from '@sve/protocol';
import { describe, expect, it, vi } from 'vitest';
import { ApiFailure } from '../api/client';
import { resolveSession } from './resolve';
import type { TokenStore } from './token';

const alice: UserDto = { id: 'alice', displayName: 'Alice', avatarUrl: null };
const config: AuthConfig = { mode: 'shadowshowdown', loginUrl: 'https://shadowshowdown.com/login' };

function memoryTokens(initial: string | null = null): TokenStore & { current: string | null } {
  const store = {
    current: initial,
    read: () => store.current,
    write: (token: string) => void (store.current = token),
    clear: () => void (store.current = null),
  };
  return store;
}

const api = (me: () => Promise<{ user: UserDto }>) => ({
  me,
  authConfig: () => Promise.resolve(config),
});

describe('resolveSession', () => {
  it('is signed out, with the way to sign in, when there is no token', async () => {
    const me = vi.fn();
    expect(await resolveSession(api(me), memoryTokens(), null)).toEqual({
      status: 'signedOut',
      config,
      problem: null,
    });
    expect(me).not.toHaveBeenCalled();
  });

  it('signs in with the token this tab already holds', async () => {
    const state = await resolveSession(
      api(() => Promise.resolve({ user: alice })),
      memoryTokens('held'),
      null,
    );
    expect(state).toEqual({ status: 'signedIn', token: 'held', user: alice });
  });

  it('prefers a token that just came back from the sign-in redirect, and keeps it', async () => {
    const tokens = memoryTokens('old');
    const state = await resolveSession(
      api(() => Promise.resolve({ user: alice })),
      tokens,
      'fresh',
    );
    expect(state).toMatchObject({ status: 'signedIn', token: 'fresh' });
    expect(tokens.current).toBe('fresh');
  });

  it('forgets a token the server rejects', async () => {
    const tokens = memoryTokens('expired');
    const state = await resolveSession(
      api(() => Promise.reject(new ApiFailure(401, 'Your session has expired'))),
      tokens,
      null,
    );
    expect(state).toEqual({ status: 'signedOut', config, problem: null });
    expect(tokens.current).toBeNull();
  });

  it('keeps the token, and says why, when the server cannot be reached', async () => {
    const tokens = memoryTokens('held');
    const state = await resolveSession(
      api(() => Promise.reject(new ApiFailure(0, 'The game server is unreachable'))),
      tokens,
      null,
    );
    expect(state).toMatchObject({ status: 'signedOut', problem: 'The game server is unreachable' });
    expect(tokens.current).toBe('held');
  });
});
