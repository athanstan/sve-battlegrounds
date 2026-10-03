import type { DeckList } from '@sve/rules';
import type { ShadowShowdownGateway, SsDeck, SsUser } from '../types';
import { pickTokens } from '../tokens';
import {
  evolvedIdOf,
  fixtureCatalog,
  fixtureDefinitions,
  fixtureLeaders,
  fixturePools,
} from './cards';

export { fixtureCatalog, fixtureDefinitions };

/**
 * A stand-in for shadowshowdown.com, for development and tests. Tokens are `dev:<account id>`,
 * which is exactly as secure as it sounds: the server refuses to use this gateway in production.
 */

export interface FixtureAccount {
  readonly id: string;
  readonly displayName: string;
}

export const FIXTURE_ACCOUNTS: readonly FixtureAccount[] = [
  { id: 'alice', displayName: 'Alice' },
  { id: 'bob', displayName: 'Bob' },
  { id: 'carol', displayName: 'Carol' },
];

const TOKEN_PREFIX = 'dev:';

export const fixtureTokenFor = (accountId: string): string => `${TOKEN_PREFIX}${accountId}`;

/** The starter deck the fixture accounts own, for tests and the dev lab. */
export function fixtureDeck(cardClass: 'swordcraft' | 'forestcraft'): DeckList {
  const pool = fixturePools[cardClass];
  // Every name twice: 20 names -> 40 cards. Five evolved cards from the cheaper half.
  return {
    leader: fixtureLeaders[cardClass],
    main: pool.map((card) => ({ card: card.id, count: 2 })),
    evolve: pool.slice(4, 9).map((card) => ({ card: evolvedIdOf(card), count: 1 })),
  };
}

function decksFor(account: FixtureAccount): readonly SsDeck[] {
  return [
    { id: `${account.id}-sword`, name: 'Swordcraft Starter', list: fixtureDeck('swordcraft') },
    { id: `${account.id}-forest`, name: 'Forestcraft Starter', list: fixtureDeck('forestcraft') },
  ];
}

export function createFixtureGateway(
  accounts: readonly FixtureAccount[] = FIXTURE_ACCOUNTS,
): ShadowShowdownGateway {
  const byToken = new Map(accounts.map((account) => [fixtureTokenFor(account.id), account]));

  const userOf = (token: string): SsUser | null => {
    const account = byToken.get(token);
    return account ? { id: account.id, displayName: account.displayName, avatarUrl: null } : null;
  };

  return {
    authenticate: (token) => Promise.resolve(userOf(token)),

    listDecks(token) {
      const account = byToken.get(token);
      return Promise.resolve(account ? decksFor(account) : []);
    },

    getDeck(token, deckId) {
      const account = byToken.get(token);
      return Promise.resolve(
        account ? (decksFor(account).find((deck) => deck.id === deckId) ?? null) : null,
      );
    },

    catalog: () => Promise.resolve(fixtureCatalog),
    tokens: () => Promise.resolve(pickTokens(fixtureDefinitions)),
  };
}
