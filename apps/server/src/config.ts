import { z } from 'zod';

/**
 * Environment, parsed once at startup. Everything else receives a `Config` and never reads
 * `process.env`, so a typo in a variable name fails loudly at boot, not mid-match.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(2567),
  /** Origin of the web app: the only origin allowed to call the HTTP API from a browser. */
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** Base URL of the shadowshowdown.com API. Unset in development to use the fixture gateway. */
  SHADOWSHOWDOWN_URL: z.url().optional(),
  /** Where the browser is sent to sign in. Defaults to `${SHADOWSHOWDOWN_URL}/login`. */
  SHADOWSHOWDOWN_LOGIN_URL: z.url().optional(),
  /**
   * Connection string of the shadowrates Postgres database (the data behind shadowshowdown.com).
   * When set, cards, decks and accounts are read from it, read-only.
   */
  SHADOWRATES_DATABASE_URL: z.string().startsWith('postgres').optional(),
  /** Public bucket the card art lives in (`<base>/<file>.webp`). The server proxies it. */
  CARD_IMAGES_URL: z
    .url()
    .default('https://shadowshowdown-card-images-ddrngr.s3.eu-north-1.amazonaws.com/cards'),
});

export type ShadowShowdownConfig =
  | { readonly mode: 'http'; readonly baseUrl: string; readonly loginUrl: string }
  | {
      readonly mode: 'postgres';
      readonly databaseUrl: string;
      /** Where players sign in. `null` in development, where an account picker stands in. */
      readonly loginUrl: string | null;
    }
  | { readonly mode: 'fixture' };

export interface Config {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly webOrigin: string;
  readonly shadowShowdown: ShadowShowdownConfig;
  /** Where card art is fetched from; `null` serves no art (fixture cards have none). */
  readonly cardImagesUrl: string | null;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
  }
  const vars = parsed.data;

  let shadowShowdown: ShadowShowdownConfig;
  if (vars.SHADOWRATES_DATABASE_URL) {
    const loginUrl =
      vars.SHADOWSHOWDOWN_LOGIN_URL ??
      (vars.SHADOWSHOWDOWN_URL ? `${vars.SHADOWSHOWDOWN_URL.replace(/\/+$/, '')}/login` : null);
    if (vars.NODE_ENV === 'production' && !loginUrl) {
      // Without a login page the only way in would be the dev account picker.
      throw new Error('SHADOWSHOWDOWN_LOGIN_URL is required in production.');
    }
    shadowShowdown = { mode: 'postgres', databaseUrl: vars.SHADOWRATES_DATABASE_URL, loginUrl };
  } else if (vars.SHADOWSHOWDOWN_URL) {
    const baseUrl = vars.SHADOWSHOWDOWN_URL.replace(/\/+$/, '');
    shadowShowdown = {
      mode: 'http',
      baseUrl,
      loginUrl: vars.SHADOWSHOWDOWN_LOGIN_URL ?? `${baseUrl}/login`,
    };
  } else if (vars.NODE_ENV === 'production') {
    // The fixture accepts a guessable token. It must never face the internet.
    throw new Error(
      'SHADOWSHOWDOWN_URL is required in production; the fixture gateway is dev-only.',
    );
  } else {
    shadowShowdown = { mode: 'fixture' };
  }

  return {
    env: vars.NODE_ENV,
    port: vars.PORT,
    webOrigin: vars.WEB_ORIGIN.replace(/\/+$/, ''),
    shadowShowdown,
    cardImagesUrl:
      shadowShowdown.mode === 'fixture' ? null : vars.CARD_IMAGES_URL.replace(/\/+$/, ''),
  };
}
