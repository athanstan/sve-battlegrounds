import { createHash } from 'node:crypto';
import { asCardDefId, validateDeck } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { GatewayError } from '../errors';
import { createPostgresGateway, devTokenFor, type SqlClient } from './gateway';
import {
  keywordsOf,
  plainText,
  splitTraits,
  toCardDefinition,
  toDeckList,
  type CardRow,
  type DeckCardRow,
} from './rows';

const mapping = { artUrlFor: (image: string) => `/api/art/${image}` };

const cardRow = (extra: Partial<CardRow> = {}): CardRow => ({
  id: '1',
  name: 'Fairy',
  original_card_id: 'BP01-001EN',
  craft: 'Forestcraft',
  main_type: 'Follower',
  sub_type: null,
  cost: 1,
  atk: 1,
  health: 1,
  traits: 'Pixie',
  abilities: null,
  effects: null,
  image: 'BP01-001EN.webp',
  ...extra,
});

describe('universe', () => {
  it('recognises Umamusume by its trait or by the product a printing came from', () => {
    const universe = (extra: Partial<CardRow>) =>
      toCardDefinition(cardRow(extra), mapping)?.universe;
    expect(universe({})).toBeNull();
    expect(universe({ traits: 'Umamusume, Mejiro Family' })).toBe('Umamusume');
    // Leaders, tokens and evolved spells carry no trait, only their product's id prefix.
    expect(universe({ traits: '-', original_card_id: 'CSD01-LD01EN' })).toBe('Umamusume');
    expect(universe({ traits: null, original_card_id: 'ECP01-SL27EN' })).toBe('Umamusume');
    expect(universe({ original_card_id: 'SD01-LD01EN' })).toBeNull();
    expect(universe({ original_card_id: null })).toBeNull();
  });
});

describe('plainText', () => {
  it('turns shadowrates effect HTML into prose', () => {
    const html =
      '<p>On Evolve - Give it <span><img class="x" src="/a.png" alt="[attack]"/>-3</span> &amp; draw.<br/>' +
      '                    Last Words - Banish it.</p>';
    expect(plainText(html)).toBe('On Evolve - Give it [attack]-3 & draw.\nLast Words - Banish it.');
  });

  it('treats the literal placeholder and empty values as no text', () => {
    expect(plainText('None')).toBe('');
    expect(plainText(null)).toBe('');
    expect(plainText('   ')).toBe('');
  });
});

describe('field decoding', () => {
  it('splits both trait separators and drops the dash placeholder', () => {
    expect(splitTraits('Officer / Commander')).toEqual(['Officer', 'Commander']);
    expect(splitTraits('Princess, Fable')).toEqual(['Princess', 'Fable']);
    expect(splitTraits('-')).toEqual([]);
    expect(splitTraits(null)).toEqual([]);
  });

  it('keeps only the keywords the engine models', () => {
    expect(keywordsOf(['Last Words', 'Earth Rite', 'On Evolve', 'Drain', 'Drain'])).toEqual([
      'lastWords',
      'onEvolve',
      'drain',
    ]);
    expect(keywordsOf(null)).toEqual([]);
    expect(keywordsOf('Fanfare')).toEqual([]);
  });
});

describe('toCardDefinition', () => {
  it('maps a follower with art served by the proxy', () => {
    expect(toCardDefinition(cardRow({ abilities: ['Fanfare'] }), mapping)).toMatchObject({
      id: '1',
      kind: 'follower',
      special: null,
      cardClass: 'forestcraft',
      cost: 1,
      attack: 1,
      defense: 1,
      traits: ['Pixie'],
      keywords: ['fanfare'],
      artUrl: '/api/art/BP01-001EN.webp',
    });
  });

  it('keeps evolved cards and tokens, and gives non-followers no stats', () => {
    expect(toCardDefinition(cardRow({ sub_type: 'Evolved' }), mapping)?.special).toBe('evolved');
    expect(toCardDefinition(cardRow({ sub_type: 'Token' }), mapping)?.special).toBe('token');
    const spell = toCardDefinition(cardRow({ main_type: 'Spell', atk: 0, health: 0 }), mapping);
    expect(spell).toMatchObject({ kind: 'spell', attack: null, defense: null });
  });

  it('leaves out printings the first slice does not model', () => {
    for (const extra of [
      { main_type: 'Equipment', sub_type: 'Token' },
      { main_type: 'Crest', sub_type: 'Token' },
      { main_type: 'Evolution Point', sub_type: null },
      { sub_type: 'Advanced' },
    ]) {
      expect(toCardDefinition(cardRow(extra), mapping), JSON.stringify(extra)).toBeUndefined();
    }
  });
});

describe('toDeckList', () => {
  const line = (card_id: string, quantity: number, main_type: string, sub_type: string | null) =>
    ({ deck_id: '9', card_id, quantity, main_type, sub_type }) satisfies DeckCardRow;

  it('sorts the leader, main and evolve piles', () => {
    const list = toDeckList([
      line('10', 1, 'Leader', null),
      line('11', 3, 'Follower', null),
      line('12', 2, 'Follower', 'Evolved'),
    ]);
    expect(list).toEqual({
      leader: '10',
      main: [{ card: '11', count: 3 }],
      evolve: [{ card: '12', count: 2 }],
    });
  });

  it('leaves the leader blank when a deck has none, so validation names the problem', () => {
    expect(toDeckList([line('11', 3, 'Follower', null)]).leader).toBe('');
  });
});

/** A fake database that answers by the table a query mentions. */
function fakeDb() {
  const sanctumPlain = 'a'.repeat(40);
  const sanctumHash = createHash('sha256').update(sanctumPlain).digest('hex');
  const users = new Map([
    ['7', { id: '7', name: 'Ada', avatar: 'https://cdn.example/ada.png' }],
    ['8', { id: '8', name: 'Bo', avatar: 'avatars/bo.png' }],
  ]);
  const tokens = new Map([
    [
      '1',
      {
        token: sanctumHash,
        tokenable_id: '7',
        tokenable_type: 'App\\Models\\User',
        expires_at: null,
      },
    ],
    [
      '2',
      {
        token: sanctumHash,
        tokenable_id: '7',
        tokenable_type: 'App\\Models\\User',
        expires_at: '2000-01-01T00:00:00Z',
      },
    ],
  ]);
  const queries: { text: string; values: readonly unknown[] }[] = [];

  const db: SqlClient = {
    query: <Row>(text: string, values: readonly unknown[] = []) => {
      queries.push({ text, values });
      const rows: unknown[] = (() => {
        if (text.includes('from users u')) return [users.get('7')];
        if (text.includes('from personal_access_tokens')) {
          return [tokens.get(String(values[0]))].filter(Boolean);
        }
        if (text.includes('from users where id'))
          return [users.get(String(values[0]))].filter(Boolean);
        if (text.includes('from decks where user_id')) return [{ id: '100', name: 'Mine' }];
        if (text.includes('from decks where id')) {
          return values[1] === '7' && values[0] === '100' ? [{ id: '100', name: 'Mine' }] : [];
        }
        if (text.includes('from deck_cards')) {
          return [
            { deck_id: '100', card_id: '1', quantity: 3, main_type: 'Follower', sub_type: null },
          ];
        }
        if (text.includes("sub_type = 'Token'")) {
          return [
            cardRow({
              id: '3',
              name: 'Fairy',
              sub_type: 'Token',
              traits: 'Pixie',
              image: 'token.webp',
            }),
          ];
        }
        if (text.includes('from cards c join crafts')) {
          return [cardRow(), cardRow({ id: '2', main_type: 'Equipment', sub_type: 'Token' })];
        }
        return [];
      })();
      return Promise.resolve({ rows: rows as Row[] });
    },
  };
  return { db, queries, sanctumToken: (id: string) => `${id}|${sanctumPlain}` };
}

describe('postgres gateway', () => {
  it('authenticates a Sanctum token by its hash and honours expiry', async () => {
    const { db, sanctumToken } = fakeDb();
    const gateway = createPostgresGateway({ db, now: () => Date.parse('2026-10-03T00:00:00Z') });

    expect(await gateway.authenticate(sanctumToken('1'))).toEqual({
      id: '7',
      displayName: 'Ada',
      avatarUrl: 'https://cdn.example/ada.png',
    });
    expect(await gateway.authenticate(sanctumToken('2'))).toBeNull(); // expired
    expect(await gateway.authenticate(sanctumToken('3'))).toBeNull(); // unknown id
    expect(await gateway.authenticate(`1|${'b'.repeat(40)}`)).toBeNull(); // wrong secret
    expect(await gateway.authenticate('garbage')).toBeNull();
    expect(await gateway.authenticate('')).toBeNull();
  });

  it('only accepts dev tokens when asked to', async () => {
    const { db } = fakeDb();
    expect(await createPostgresGateway({ db }).authenticate(devTokenFor('8'))).toBeNull();

    const dev = createPostgresGateway({ db, allowDevTokens: true });
    expect(await dev.authenticate(devTokenFor('8'))).toEqual({
      id: '8',
      displayName: 'Bo',
      avatarUrl: null, // a relative avatar path is not something a browser can load
    });
    expect(await dev.authenticate(devTokenFor('8; drop table users'))).toBeNull();
    expect(await dev.authenticate(devTokenFor('999'))).toBeNull();
  });

  it('gives a developer playing alone a sparring partner who plays their decks', async () => {
    const { db } = fakeDb();
    const dev = createPostgresGateway({ db, allowDevTokens: true });
    const ada = await dev.authenticate(devTokenFor('7'));
    const partner = dev.sparringPartnerFor(ada!);

    expect(partner).toEqual({ id: 'sparring:7', displayName: 'Sparring partner', avatarUrl: null });
    expect(await dev.authenticate(devTokenFor(partner.id))).toEqual(partner);
    expect((await dev.listDecks(devTokenFor(partner.id))).map((deck) => deck.id)).toEqual(['100']);
    expect((await dev.getDeck(devTokenFor(partner.id), '100'))?.name).toBe('Mine');

    // Not an account that exists, nor a way to be someone else, nor available without dev tokens.
    expect(await dev.authenticate(devTokenFor('sparring:999'))).toBeNull();
    expect(await dev.authenticate(devTokenFor('sparring:sparring:7'))).toBeNull();
    const production = createPostgresGateway({ db });
    expect(await production.authenticate(devTokenFor(partner.id))).toBeNull();
  });

  it('lists the caller’s decks and hands a deck only to its owner', async () => {
    const { db } = fakeDb();
    const gateway = createPostgresGateway({ db, allowDevTokens: true });

    const decks = await gateway.listDecks(devTokenFor('7'));
    expect(decks).toEqual([
      {
        id: '100',
        name: 'Mine',
        list: { leader: '', main: [{ card: '1', count: 3 }], evolve: [] },
      },
    ]);
    expect((await gateway.getDeck(devTokenFor('7'), '100'))?.name).toBe('Mine');
    expect(await gateway.getDeck(devTokenFor('8'), '100')).toBeNull();
    expect(await gateway.getDeck(devTokenFor('7'), 'x')).toBeNull();
    await expect(gateway.listDecks('nope')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('builds the catalog once and drops unmodelled printings', async () => {
    const { db, queries } = fakeDb();
    const gateway = createPostgresGateway({ db });

    const catalog = await gateway.catalog();
    expect(catalog(asCardDefId('1'))?.name).toBe('Fairy');
    expect(catalog(asCardDefId('2'))).toBeUndefined();
    await gateway.catalog();
    expect(queries.filter((q) => q.text.includes('from cards c join crafts'))).toHaveLength(1);
  });

  it('picks the lowest token printing that has art (CR 9.1.2.3)', async () => {
    const { db } = fakeDb();
    const tokens = await createPostgresGateway({ db }).tokens();
    expect(tokens.get('Fairy')).toMatchObject({
      name: 'Fairy',
      special: 'token',
      traits: ['Pixie'],
      artUrl: '/api/art/token.webp',
    });
    expect(tokens.get('Fairy Wisp')?.traits).toEqual(['Pixie']);
  });

  it('reports a database failure as unavailable, not as a bad login', async () => {
    const broken: SqlClient = { query: () => Promise.reject(new Error('connection refused')) };
    const gateway = createPostgresGateway({ db: broken, allowDevTokens: true });
    await expect(gateway.authenticate(devTokenFor('7'))).rejects.toBeInstanceOf(GatewayError);
    await expect(gateway.authenticate(devTokenFor('7'))).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('lists accounts that own a playable deck', async () => {
    const { db } = fakeDb();
    const accounts = await createPostgresGateway({ db }).playableAccounts(5);
    expect(accounts.map((a) => a.displayName)).toEqual(['Ada']);
  });

  it('flags a deck the rules reject instead of crashing', async () => {
    const { db } = fakeDb();
    const gateway = createPostgresGateway({ db, allowDevTokens: true });
    const [deck] = await gateway.listDecks(devTokenFor('7'));
    const issues = validateDeck(deck!.list, await gateway.catalog());
    expect(issues.length).toBeGreaterThan(0);
  });
});
