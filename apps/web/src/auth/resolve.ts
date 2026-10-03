import type { AuthConfig, UserDto } from '@sve/protocol';
import { ApiFailure, type ApiClient } from '../api/client';
import type { TokenStore } from './token';

export type AuthState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'signedOut';
      readonly config: AuthConfig | null;
      readonly problem: string | null;
    }
  | { readonly status: 'signedIn'; readonly token: string; readonly user: UserDto };

/**
 * Work out who the visitor is when the page opens: the token that just came back from the
 * sign-in redirect, else the one this tab already holds, checked against the server. A token the
 * server rejects is forgotten; a server that cannot be reached is reported, not mistaken for
 * "signed out".
 */
export async function resolveSession(
  api: Pick<ApiClient, 'me' | 'authConfig'>,
  tokens: TokenStore,
  returned: string | null,
): Promise<AuthState> {
  if (returned) tokens.write(returned);

  if (tokens.read()) {
    try {
      const { user } = await api.me();
      const token = tokens.read();
      if (token) return { status: 'signedIn', token, user };
    } catch (error) {
      if (!(error instanceof ApiFailure && error.unauthorized))
        return signedOut(api, describe(error));
      tokens.clear();
    }
  }
  return signedOut(api, null);
}

async function signedOut(
  api: Pick<ApiClient, 'authConfig'>,
  problem: string | null,
): Promise<AuthState> {
  try {
    return { status: 'signedOut', config: await api.authConfig(), problem };
  } catch (error) {
    return { status: 'signedOut', config: null, problem: problem ?? describe(error) };
  }
}

export const describe = (error: unknown): string =>
  error instanceof ApiFailure ? error.message : 'Something went wrong. Try again.';
