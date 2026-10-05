/**
 * Writes the card ids and counts of the live fixture decks to packages/cards/fixtures/decks.json.
 * Uses the read-only shadowrates connection and never prints the connection string.
 *
 *   pnpm dump:decks
 *
 * A deck fixture is only a list of printing ids: every fact about a card lives in the catalog
 * (`pnpm dump:cards`). Decks are the part that will later come from the player's own account on
 * shadowshowdown.com (`GET /api/v1/decks`) instead of from this file.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadOnlyPool } from '@sve/shadowshowdown/postgres';

const DECK_IDS = ['761', '784', '827', '909', '920', '940', '956'] as const;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages/cards/fixtures/decks.json');

interface DeckRow {
  readonly id: string;
  readonly name: string;
}

interface DeckCardRow {
  readonly deck_id: string;
  readonly card_id: string;
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

async function main(): Promise<void> {
  const pool = createReadOnlyPool(connectionString());
  try {
    const decks = await pool.query<DeckRow>(
      'select id::text as id, name from decks where id = any($1::bigint[]) order by id',
      [DECK_IDS],
    );
    if (decks.rows.length === 0) {
      throw new Error(`Decks ${DECK_IDS.join(', ')} were not in the shadowrates database`);
    }
    const cards = await pool.query<DeckCardRow>(
      `select dc.deck_id::text as deck_id, dc.card_id::text as card_id, dc.quantity
         from deck_cards dc
         join cards c on c.id = dc.card_id
        where dc.deck_id = any($1::bigint[])
        order by dc.deck_id, c.main_type, c.name, c.id`,
      [DECK_IDS],
    );

    const payload = {
      source: 'shadowrates',
      decks: decks.rows.map((deck) => ({
        id: deck.id,
        name: deck.name,
        cards: cards.rows
          .filter((row) => row.deck_id === deck.id)
          .map((row) => ({ id: row.card_id, count: row.quantity })),
      })),
    };

    await mkdir(dirname(OUT), { recursive: true });
    const lines = payload.decks.map(
      (deck) =>
        `    {\n      "id": ${JSON.stringify(deck.id)},\n      "name": ${JSON.stringify(deck.name)},\n      "cards": [\n${deck.cards
          .map((card) => `        ${JSON.stringify(card)}`)
          .join(',\n')}\n      ]\n    }`,
    );
    await writeFile(
      OUT,
      `{\n  "source": ${JSON.stringify(payload.source)},\n  "decks": [\n${lines.join(',\n')}\n  ]\n}\n`,
    );
    process.stderr.write(
      `Wrote ${payload.decks.length} decks to packages/cards/fixtures/decks.json\n`,
    );
  } finally {
    await pool.close();
  }
}

await main();
