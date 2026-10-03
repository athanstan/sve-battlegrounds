import { describe, expect, it } from 'vitest';
import { loginRedirectUrl, tabTokenStore, takeReturnedToken } from './token';

class MemoryStorage {
  readonly #items = new Map<string, string>();
  getItem = (key: string) => this.#items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.#items.set(key, value);
  removeItem = (key: string) => void this.#items.delete(key);
}

describe('token store', () => {
  it('keeps, returns and forgets a token', () => {
    const store = tabTokenStore(new MemoryStorage());
    expect(store.read()).toBeNull();
    store.write('abc');
    expect(store.read()).toBe('abc');
    store.clear();
    expect(store.read()).toBeNull();
  });
});

describe('signing in at shadowshowdown.com', () => {
  it('sends the browser to the site’s login with a way back', () => {
    const url = new URL(
      loginRedirectUrl('https://shadowshowdown.com/login?lang=en', 'https://battle.test/'),
    );
    expect(url.origin + url.pathname).toBe('https://shadowshowdown.com/login');
    expect(url.searchParams.get('lang')).toBe('en');
    expect(url.searchParams.get('redirect')).toBe('https://battle.test/');
  });

  it('takes the token out of the fragment it came back in, and leaves the rest of the address alone', () => {
    const { token, cleanHref } = takeReturnedToken('https://battle.test/#access_token=s3cret');
    expect(token).toBe('s3cret');
    expect(cleanHref).toBe('https://battle.test/');

    const keeps = takeReturnedToken('https://battle.test/#access_token=s3cret&state=lobby');
    expect(keeps.cleanHref).toBe('https://battle.test/#state=lobby');
  });

  it('reads nothing from an ordinary address, including a route', () => {
    expect(takeReturnedToken('https://battle.test/#/match/abc')).toEqual({
      token: null,
      cleanHref: 'https://battle.test/#/match/abc',
    });
    expect(takeReturnedToken('https://battle.test/?access_token=nope').token).toBeNull();
  });
});
