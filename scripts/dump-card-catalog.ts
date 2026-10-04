/**
 * Caches every card of the shadowrates database as packages/cards/fixtures/cards.json, the
 * deck-independent catalog scripts are written against. Read-only; never prints the connection
 * string.
 *
 *   pnpm dump:cards
 *
 * The source is a `CatalogSource`: today the shadowrates Postgres, tomorrow
 * `GET /api/v1/cards?game=sve` on shadowshowdown.com (see ROADMAP). Only `postgresSource` changes.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadOnlyPool, toCardDefinition, type CardRow } from '@sve/shadowshowdown/postgres';
import {
  buildCatalog,
  divergentPrintings,
  serializeCatalog,
  type CatalogInput,
} from '../packages/cards/src/catalog';

interface CatalogSource {
  readonly name: string;
  load(): Promise<{ inputs: CatalogInput[]; unsupported: string[] }>;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages/cards/fixtures/cards.json');

function connectionString(): string {
  if (process.env.SHADOWRATES_DATABASE_URL) return process.env.SHADOWRATES_DATABASE_URL;
  const user = process.env.SHADOWRATES_DB_USER ?? 'sail';
  const password = process.env.SHADOWRATES_DB_PASSWORD ?? 'secret';
  const name = process.env.SHADOWRATES_DB_NAME ?? 'shadowrates';
  const host = process.env.SHADOWRATES_DB_HOST ?? '127.0.0.1';
  const port = process.env.SHADOWRATES_DB_PORT ?? '5432';
  return `postgres://${user}:${password}@${host}:${port}/${name}`;
}

const postgresSource: CatalogSource = {
  name: 'shadowrates',
  async load() {
    const pool = createReadOnlyPool(connectionString());
    try {
      const result = await pool.query<CardRow>(
        `select c.id::text as id, c.name, c.original_card_id, cr.name as craft, c.main_type, c.sub_type,
                c.cost, c.atk, c.health, c.traits, c.abilities, c.effects, c.image, c.deck_restriction
           from cards c
           join crafts cr on cr.id = c.craft_id
          order by c.id`,
      );
      const inputs: CatalogInput[] = [];
      const unsupported: string[] = [];
      for (const row of result.rows) {
        const definition = toCardDefinition(row, { artUrlFor: () => '' });
        if (!definition) {
          unsupported.push(`${row.main_type}/${row.sub_type ?? '-'}`);
          continue;
        }
        inputs.push({ definition, originalCardId: row.original_card_id });
      }
      return { inputs, unsupported };
    } finally {
      await pool.close();
    }
  },
};

async function main(): Promise<void> {
  const source = postgresSource;
  const { inputs, unsupported } = await source.load();
  if (inputs.length === 0) throw new Error(`${source.name} returned no supported cards`);

  const cards = buildCatalog(inputs);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, serializeCatalog({ source: source.name, cards }));

  const byCraft = new Map<string, number>();
  for (const card of cards) byCraft.set(card.cardClass, (byCraft.get(card.cardClass) ?? 0) + 1);
  const skipped = new Map<string, number>();
  for (const kind of unsupported) skipped.set(kind, (skipped.get(kind) ?? 0) + 1);
  const overridden = cards.filter((card) =>
    card.printings.some((printing) => printing.facts !== undefined),
  ).length;
  const divergent = cards.filter((card) => divergentPrintings(card).length > 0).length;

  const out = (line: string) => process.stderr.write(`${line}\n`);
  out(
    `Wrote ${cards.length} cards (${inputs.length} printings) to packages/cards/fixtures/cards.json`,
  );
  out(`  by craft: ${[...byCraft].map(([craft, n]) => `${craft} ${n}`).join(', ')}`);
  out(`  printings with differing facts: ${overridden} cards; differing text: ${divergent} cards`);
  out(`  not modelled yet (skipped): ${[...skipped].map(([k, n]) => `${k} x${n}`).join(', ')}`);
}

await main();
