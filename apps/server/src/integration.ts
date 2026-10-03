import type { AuthConfig, LoginResponse } from '@sve/protocol';
import { API } from '@sve/protocol';
import { createHttpGateway, type ShadowShowdownGateway } from '@sve/shadowshowdown';
import {
  FIXTURE_ACCOUNTS,
  createFixtureGateway,
  fixtureTokenFor,
} from '@sve/shadowshowdown/fixture';
import {
  createPostgresGateway,
  createReadOnlyPool,
  devTokenFor,
  type SqlClient,
} from '@sve/shadowshowdown/postgres';
import type { Config } from './config';
import { createArtProxy } from './http/art';
import type { HttpDeps } from './http/routes';

/** Everything that differs between talking to shadowshowdown.com, shadowrates and fixtures. */
export interface Integration extends HttpDeps {
  readonly gateway: ShadowShowdownGateway;
  readonly authConfig: AuthConfig;
  /** Releases database connections. */
  readonly close: () => Promise<void>;
}

/** How many accounts the development sign-in offers. */
const DEV_ACCOUNT_LIMIT = 8;

export interface IntegrationOverrides {
  /** Tests hand in a fake database instead of opening a pool. */
  readonly db?: SqlClient;
}

export async function integrationFor(
  config: Config,
  overrides: IntegrationOverrides = {},
): Promise<Integration> {
  const { shadowShowdown } = config;
  const art = config.cardImagesUrl ? createArtProxy({ baseUrl: config.cardImagesUrl }) : null;
  const noop = () => Promise.resolve();

  if (shadowShowdown.mode === 'http') {
    return {
      gateway: createHttpGateway({ baseUrl: shadowShowdown.baseUrl }),
      authConfig: { mode: 'shadowshowdown', loginUrl: shadowShowdown.loginUrl },
      devLogin: null,
      art,
      close: noop,
    };
  }

  if (shadowShowdown.mode === 'postgres') {
    const pool = overrides.db ? null : createReadOnlyPool(shadowShowdown.databaseUrl);
    const db = overrides.db ?? pool;
    if (!db) throw new Error('unreachable: no database');

    // Without a login page (development) a picker of real accounts stands in; its tokens only
    // exist when the picker does.
    const { loginUrl } = shadowShowdown;
    const gateway = createPostgresGateway({
      db,
      allowDevTokens: loginUrl === null,
      artPath: API.art,
    });
    const close = pool ? () => pool.close() : noop;

    if (loginUrl !== null) {
      return {
        gateway,
        authConfig: { mode: 'shadowshowdown', loginUrl },
        devLogin: null,
        art,
        close,
      };
    }

    const players = await gateway.playableAccounts(DEV_ACCOUNT_LIMIT);
    // Playing alone needs a second seat: a sparring partner who plays the first account's decks.
    const [first] = players;
    const accounts = first ? [...players, gateway.sparringPartnerFor(first)] : players;
    return {
      gateway,
      authConfig: {
        mode: 'fixture',
        accounts: accounts.map(({ id, displayName }) => ({ id, displayName })),
      },
      devLogin: (accountId): Promise<LoginResponse | null> => {
        const account = accounts.find((candidate) => candidate.id === accountId);
        return Promise.resolve(
          account
            ? {
                token: devTokenFor(account.id),
                user: {
                  id: account.id,
                  displayName: account.displayName,
                  avatarUrl: account.avatarUrl,
                },
              }
            : null,
        );
      },
      art,
      close,
    };
  }

  const gateway = createFixtureGateway();
  return {
    gateway,
    authConfig: {
      mode: 'fixture',
      accounts: FIXTURE_ACCOUNTS.map(({ id, displayName }) => ({ id, displayName })),
    },
    devLogin: async (accountId): Promise<LoginResponse | null> => {
      const token = fixtureTokenFor(accountId);
      const user = await gateway.authenticate(token);
      return user
        ? { token, user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl } }
        : null;
    },
    art,
    close: noop,
  };
}
