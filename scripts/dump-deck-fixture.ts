/**
 * Writes names, types and normalized text of decks 940 and 909 to
 * packages/cards/fixtures/decks.json. Uses the read-only shadowrates connection.
 *
 *   pnpm dump:decks
 *
 * Never prints the connection string.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadOnlyPool, toCardDefinition, type CardRow } from '@sve/shadowshowdown/postgres';

const DECK_IDS = ['940', '909'] as const;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages/cards/fixtures/decks.json');

interface DeckRow {
  readonly id: string;
  readonly name: string;
}

interface DeckCardDumpRow extends CardRow {
  readonly deck_id: string;
  readonly quantity: number;
}

function connectionString(): string {
  if (process.env.SHADOWRATES_DATABASE_URL) return process.env.SHADOWRATES_DATABASE_URL;
  const user = process.env.SHADOWRATES_DB_USER ?? 'sail';
  const password = process.env.SHADOWRATES_DB_PASSWORD ?? 'secret';
  const name = process.env.SHADOWRATES_DB_NAME ?? 'shadowrates';
  const host = process.env.SHADOWRATES_DB_HOST ?? '127.0.0.1';
  const port = process.env.SHADOWRATES_DB_PORT ?? '5432';
  return `postgres://${user}:${password}@${host}:${port}/${name}`;
}

function toFixtureCard(row: DeckCardDumpRow) {
  const def = toCardDefinition(row, { artUrlFor: () => '' });
  if (!def) {
    return {
      id: row.id,
      name: row.name,
      kind: row.main_type.toLowerCase(),
      special: row.sub_type === 'Evolved' ? 'evolved' : row.sub_type === 'Token' ? 'token' : null,
      cardClass: row.craft.toLowerCase(),
      universe: null,
      traits: [],
      cost: row.cost,
      attack: row.atk,
      defense: row.health,
      keywords: [],
      text: '',
      count: row.quantity,
      skipped: true as const,
    };
  }
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    special: def.special,
    cardClass: def.cardClass,
    universe: def.universe,
    traits: [...def.traits],
    cost: def.cost,
    attack: def.attack,
    defense: def.defense,
    keywords: [...def.keywords],
    text: def.text,
    count: row.quantity,
  };
}

async function main(): Promise<void> {
  const pool = createReadOnlyPool(connectionString());
  try {
    const decks = await pool.query<DeckRow>(
      'select id::text as id, name from decks where id = any($1::bigint[]) order by id',
      [DECK_IDS],
    );
    if (decks.rows.length === 0) {
      throw new Error('Decks 940 and 909 were not in the shadowrates database');
    }
    const cards = await pool.query<DeckCardDumpRow>(
      `select dc.deck_id::text as deck_id, dc.quantity,
              c.id::text as id, c.name, c.original_card_id, cr.name as craft, c.main_type, c.sub_type,
              c.cost, c.atk, c.health, c.traits, c.abilities, c.effects, c.image
         from deck_cards dc
         join cards c on c.id = dc.card_id
         join crafts cr on cr.id = c.craft_id
        where dc.deck_id = any($1::bigint[])
        order by dc.deck_id, c.main_type, c.name, c.id`,
      [DECK_IDS],
    );

    const payload = {
      generatedAt: 'dump-deck-fixture',
      decks: decks.rows.map((deck) => ({
        id: deck.id,
        name: deck.name,
        cards: cards.rows.filter((row) => row.deck_id === deck.id).map(toFixtureCard),
      })),
    };

    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);
    process.stderr.write(
      `Wrote ${payload.decks.length} decks to packages/cards/fixtures/decks.json\n`,
    );
  } finally {
    await pool.close();
  }
}

await main();
