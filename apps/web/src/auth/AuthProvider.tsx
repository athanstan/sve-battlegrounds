import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiClient } from '../api/client';
import { SERVER_URL } from '../config';
import { describe, resolveSession, type AuthState } from './resolve';
import { tabTokenStore, takeReturnedToken } from './token';

interface Auth {
  readonly state: AuthState;
  /** An API client that carries the current session's token. */
  readonly api: ApiClient;
  /** Development only: sign in as one of the server's fixture accounts. */
  readonly signInAs: (accountId: string) => Promise<void>;
  readonly signOut: () => void;
  /** Look again, after the server could not be reached. */
  readonly retry: () => void;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const tokens = useMemo(() => tabTokenStore(), []);
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // The token is read from the tab's store at the moment of each request, so a call never
  // carries a token the user has since signed out of.
  const api = useMemo(() => new ApiClient(SERVER_URL, () => tokens.read()), [tokens]);

  useEffect(() => {
    let cancelled = false;
    // A token coming back from the sign-in redirect is taken out of the address bar at once.
    const returned = takeReturnedToken(location.href);
    if (returned.token) history.replaceState(null, '', returned.cleanHref);

    void resolveSession(api, tokens, returned.token).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [api, tokens, attempt]);

  const signInAs = useCallback(
    async (accountId: string) => {
      try {
        const { token } = await api.devLogin(accountId);
        tokens.write(token);
        setAttempt((n) => n + 1);
      } catch (error) {
        setState((previous) =>
          previous.status === 'signedOut' ? { ...previous, problem: describe(error) } : previous,
        );
      }
    },
    [api, tokens],
  );

  const signOut = useCallback(() => {
    tokens.clear();
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, [tokens]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<Auth>(
    () => ({ state, api, signInAs, signOut, retry }),
    [state, api, signInAs, signOut, retry],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth needs an AuthProvider above it');
  return auth;
}
