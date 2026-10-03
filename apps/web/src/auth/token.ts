/**
 * Where the session token lives and how it arrives.
 *
 * The token is kept per browser tab (`sessionStorage`), on purpose: one person can sit in two
 * tabs as two different accounts, which is how a match is tried out on one machine, and a token
 * never outlives the tab that holds it. Signing in again from shadowshowdown.com is one redirect.
 */

const KEY = 'sve.session-token';

export interface TokenStore {
  read(): string | null;
  write(token: string): void;
  clear(): void;
}

export const tabTokenStore = (
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = sessionStorage,
): TokenStore => ({
  read: () => storage.getItem(KEY),
  write: (token) => storage.setItem(KEY, token),
  clear: () => storage.removeItem(KEY),
});

/**
 * Where to send the browser to sign in at shadowshowdown.com, and where it should come back to.
 *
 * ASSUMPTION (the site's login is not built yet): it takes a `redirect` query parameter, and
 * returns the browser to that address with the session token in the URL fragment as
 * `#access_token=...`. A fragment never reaches a server log. If the real contract differs, this
 * function and `takeReturnedToken` are the only code that has to change.
 */
export function loginRedirectUrl(loginUrl: string, returnTo: string): string {
  const url = new URL(loginUrl);
  url.searchParams.set('redirect', returnTo);
  return url.toString();
}

/** A token handed back in the fragment, plus the address with it removed so it is not left in history. */
export function takeReturnedToken(href: string): { token: string | null; cleanHref: string } {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.replace(/^#\/?/, ''));
  const token = params.get('access_token');
  if (!token) return { token: null, cleanHref: href };

  params.delete('access_token');
  const rest = params.toString();
  url.hash = rest ? `#${rest}` : '';
  return { token, cleanHref: url.toString() };
}
