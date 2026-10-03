import { useEffect, useState, useSyncExternalStore } from 'react';
import { useServices } from '../app/Services';
import type { MatchSession, SessionState } from '../net/match-session';

export type Acquired =
  | { readonly status: 'finding' }
  | { readonly status: 'ready'; readonly session: MatchSession }
  /** There is no session for this address: a shared link, or a reload after the seat was lost. */
  | { readonly status: 'needsJoin' };

/** The open session for a match address: already open, resumed after a reload, or none. */
export function useMatchSession(
  roomId: string,
): Acquired & { readonly adopt: (session: MatchSession) => void } {
  const { matches } = useServices();
  const [found, setFound] = useState<{ roomId: string; result: Acquired }>(() => {
    const open = matches.session(roomId);
    return { roomId, result: open ? { status: 'ready', session: open } : { status: 'finding' } };
  });

  useEffect(() => {
    let cancelled = false;
    void matches.resume(roomId).then((session) => {
      if (!cancelled)
        setFound({
          roomId,
          result: session ? { status: 'ready', session } : { status: 'needsJoin' },
        });
    });
    return () => {
      cancelled = true;
    };
  }, [matches, roomId]);

  // A different match address starts over rather than showing the previous match for a moment.
  const result: Acquired = found.roomId === roomId ? found.result : { status: 'finding' };
  return {
    ...result,
    adopt: (session) => setFound({ roomId, result: { status: 'ready', session } }),
  };
}

/** Subscribe a component to a session's state. */
export function useSessionState(session: MatchSession): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}
