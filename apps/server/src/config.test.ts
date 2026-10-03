import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('defaults to a local fixture-backed development server', () => {
    expect(loadConfig({})).toEqual({
      env: 'development',
      port: 2567,
      webOrigin: 'http://localhost:5173',
      shadowShowdown: { mode: 'fixture' },
      cardImagesUrl: null,
    });
  });

  it('talks to shadowshowdown.com when told where it is', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      SHADOWSHOWDOWN_URL: 'https://shadowshowdown.com/',
      WEB_ORIGIN: 'https://battle.shadowshowdown.com/',
      PORT: '8080',
    });
    expect(config).toMatchObject({
      port: 8080,
      webOrigin: 'https://battle.shadowshowdown.com',
      shadowShowdown: {
        mode: 'http',
        baseUrl: 'https://shadowshowdown.com',
        loginUrl: 'https://shadowshowdown.com/login',
      },
    });
  });

  it('lets the login page be somewhere else', () => {
    const config = loadConfig({
      SHADOWSHOWDOWN_URL: 'https://api.example.com',
      SHADOWSHOWDOWN_LOGIN_URL: 'https://example.com/signin',
    });
    expect(config.shadowShowdown).toMatchObject({ loginUrl: 'https://example.com/signin' });
  });

  it('reads from the shadowrates database when given its URL', () => {
    const config = loadConfig({
      SHADOWRATES_DATABASE_URL: 'postgres://sail:secret@pgsql:5432/shadowrates',
      CARD_IMAGES_URL: 'https://images.example/cards/',
    });
    expect(config.shadowShowdown).toEqual({
      mode: 'postgres',
      databaseUrl: 'postgres://sail:secret@pgsql:5432/shadowrates',
      loginUrl: null,
    });
    expect(config.cardImagesUrl).toBe('https://images.example/cards');
  });

  it('needs a login page for the database in production', () => {
    const env = { SHADOWRATES_DATABASE_URL: 'postgres://db/x', NODE_ENV: 'production' };
    expect(() => loadConfig(env)).toThrow(/SHADOWSHOWDOWN_LOGIN_URL is required/);
    expect(
      loadConfig({ ...env, SHADOWSHOWDOWN_URL: 'https://shadowshowdown.com' }).shadowShowdown,
    ).toMatchObject({ mode: 'postgres', loginUrl: 'https://shadowshowdown.com/login' });
  });

  it('refuses to run the fixture in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SHADOWSHOWDOWN_URL is required/);
  });

  it('reports every bad variable at once', () => {
    expect(() =>
      loadConfig({ PORT: 'eighty', WEB_ORIGIN: 'not a url', NODE_ENV: 'staging' }),
    ).toThrow(/PORT[\s\S]*WEB_ORIGIN|NODE_ENV[\s\S]*PORT/);
  });
});
