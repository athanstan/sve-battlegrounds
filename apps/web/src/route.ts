import { useSyncExternalStore } from 'react';

/**
 * Where the user is, kept in the address fragment (`#/match/abc`). A fragment needs no server
 * rewrite rules, survives a reload, and a match address is something one player can send another.
 */
export type Route =
  | { readonly name: 'lobby' }
  | { readonly name: 'match'; readonly roomId: string }
  | { readonly name: 'lab' };

export function parseRoute(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (first === 'match' && second) return { name: 'match', roomId: decodeURIComponent(second) };
  if (first === 'lab') return { name: 'lab' };
  return { name: 'lobby' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'lobby':
      return '#/';
    case 'match':
      return `#/match/${encodeURIComponent(route.roomId)}`;
    case 'lab':
      return '#/lab';
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const href = hrefFor(route);
  if (options.replace) location.replace(href);
  else location.hash = href;
}

const subscribe = (listener: () => void): (() => void) => {
  addEventListener('hashchange', listener);
  return () => removeEventListener('hashchange', listener);
};

/** The current route. Re-renders on navigation; returns a stable object between changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseRoute(hash);
}
