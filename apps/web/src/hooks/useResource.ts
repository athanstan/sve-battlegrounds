import { useCallback, useEffect, useRef, useState } from 'react';

export type Resource<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'failed'; readonly error: unknown; readonly stale: T | null };

/**
 * Load something from the server, optionally keep it fresh, and let the caller retry.
 * A refresh that fails keeps the last good data in `stale` rather than blanking the screen.
 *
 * `load` must be stable (wrap it in `useCallback`): a new function means a new request.
 */
export function useResource<T>(load: () => Promise<T>, options: { pollMs?: number } = {}) {
  const [resource, setResource] = useState<Resource<T>>({ status: 'loading' });
  const lastGood = useRef<T | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    load().then(
      (data) => {
        lastGood.current = data;
        if (!cancelled) setResource({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!cancelled) setResource({ status: 'failed', error, stale: lastGood.current });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  const { pollMs } = options;
  useEffect(() => {
    let cancel = reload();
    if (!pollMs) return cancel;
    const timer = setInterval(() => {
      cancel();
      cancel = reload();
    }, pollMs);
    return () => {
      clearInterval(timer);
      cancel();
    };
  }, [reload, pollMs]);

  return { resource, reload };
}
