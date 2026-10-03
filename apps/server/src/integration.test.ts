import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { integrationFor } from './integration';
import type { SqlClient } from '@sve/shadowshowdown/postgres';

describe('integrationFor', () => {
  it('stands in with fixture accounts when no shadowshowdown.com is configured', async () => {
    const integration = await integrationFor(loadConfig({}));
    expect(integration.authConfig.mode).toBe('fixture');
    expect(integration.art).toBeNull();

    const login = await integration.devLogin?.('alice');
    expect(login?.user).toEqual({ id: 'alice', displayName: 'Alice', avatarUrl: null });
    expect(await integration.gateway.authenticate(login?.token ?? '')).toMatchObject({
      id: 'alice',
    });
    expect(await integration.devLogin?.('mallory')).toBeNull();
  });

  it('sends people to shadowshowdown.com, with no back door, when it is configured', async () => {
    const integration = await integrationFor(
      loadConfig({ NODE_ENV: 'production', SHADOWSHOWDOWN_URL: 'https://shadowshowdown.com' }),
    );
    expect(integration.authConfig).toEqual({
      mode: 'shadowshowdown',
      loginUrl: 'https://shadowshowdown.com/login',
    });
    expect(integration.devLogin).toBeNull();
  });

  describe('with the shadowrates database', () => {
    const db: SqlClient = {
      query: <Row>(text: string, values: readonly unknown[] = []) => {
        const rows: unknown[] = text.includes('from users u')
          ? [{ id: '7', name: 'Ada', avatar: null }]
          : text.includes('from users where id')
            ? values[0] === '7'
              ? [{ id: '7', name: 'Ada', avatar: null }]
              : []
            : [];
        return Promise.resolve({ rows: rows as Row[] });
      },
    };
    const env = { SHADOWRATES_DATABASE_URL: 'postgres://db/shadowrates' };

    it('offers real accounts in development and signs them in with a dev token', async () => {
      const integration = await integrationFor(loadConfig(env), { db });
      expect(integration.authConfig).toEqual({
        mode: 'fixture',
        accounts: [
          { id: '7', displayName: 'Ada' },
          { id: 'sparring:7', displayName: 'Sparring partner' },
        ],
      });
      expect(integration.art).not.toBeNull();

      const login = await integration.devLogin?.('7');
      expect(login?.user.displayName).toBe('Ada');
      expect(await integration.gateway.authenticate(login?.token ?? '')).toMatchObject({ id: '7' });
      expect(await integration.devLogin?.('8')).toBeNull();
    });

    it('closes the door on dev tokens once a login page is configured', async () => {
      const integration = await integrationFor(
        loadConfig({ ...env, SHADOWSHOWDOWN_LOGIN_URL: 'https://shadowshowdown.com/login' }),
        { db },
      );
      expect(integration.authConfig).toEqual({
        mode: 'shadowshowdown',
        loginUrl: 'https://shadowshowdown.com/login',
      });
      expect(integration.devLogin).toBeNull();
      expect(await integration.gateway.authenticate('dev:7')).toBeNull();
    });
  });
});
