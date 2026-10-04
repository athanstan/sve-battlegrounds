/**
 * Scaffolds the script file of a card from the cached catalog (no database needed):
 *
 *   pnpm new:card "Aurelia, Blooming Blade"     # by printed name (exact, then substring)
 *   pnpm new:card vodka@evolved                 # by key
 *
 * Writes `packages/cards/src/<craft>/<slug>.ts` with an empty script for the card and every other
 * face of the same name in that craft (evolved, token, leader), the printed text as a comment,
 * and refreshes the script index.
 */
/// <reference types="node" />
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogIndex, primaryText, type CatalogCard } from '../packages/cards/src/catalog';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../packages/cards/src');
const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  process.stderr.write('Usage: pnpm new:card "<card name or key>"\n');
  process.exit(1);
}

const { cards } = catalogIndex();
const lower = query.toLowerCase();
const exact = cards.filter((card) => card.key === query || card.name.toLowerCase() === lower);
const matches =
  exact.length > 0 ? exact : cards.filter((card) => card.name.toLowerCase().includes(lower));
const [first] = matches;
if (!first) {
  process.stderr.write(`No card matches "${query}"\n`);
  process.exit(1);
}

const slugOf = (card: CatalogCard) => card.key.replace(/[@#].*$/, '');
const names = new Set(matches.map((card) => `${card.cardClass}/${slugOf(card)}`));
if (names.size > 1) {
  process.stderr.write(
    `"${query}" matches several cards, be more specific:\n${matches
      .map((card) => `  ${card.key}  ${card.name} (${card.cardClass})`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

const faces = cards.filter(
  (card) => slugOf(card) === slugOf(first) && card.cardClass === first.cardClass,
);
const file = join(SRC, first.cardClass, `${slugOf(first)}.ts`);
if (existsSync(file)) {
  process.stderr.write(`${first.cardClass}/${slugOf(first)}.ts already exists\n`);
  process.exit(1);
}

const identifier = (card: CatalogCard) => {
  const words = card.key.replace(/#/g, '-').replace(/@/g, '-').split('-').filter(Boolean);
  const camel = words
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
  return /^[0-9]/.test(camel) ? `_${camel}` : camel;
};

const describe = (card: CatalogCard) => {
  const stats = card.kind === 'follower' ? `, ${card.attack}/${card.defense}` : '';
  const text = primaryText(card)
    .replace(/\*\//g, '*\\/')
    .split('\n')
    .map((line) => ` *   ${line}`);
  return [
    '/**',
    ` * ${card.name} - ${card.special ?? ''} ${card.kind}, cost ${card.cost}${stats}`.replace(
      '  ',
      ' ',
    ),
    ` * ${card.printings.length} printing(s), primary ${card.printings[0]?.originalCardId ?? '?'}:`,
    ...text,
    ' */',
    `export const ${identifier(card)} = scriptOf('${card.key}', []);`,
  ].join('\n');
};

mkdirSync(join(SRC, first.cardClass), { recursive: true });
writeFileSync(
  file,
  `import { scriptOf } from '../define';\n\n${faces.map(describe).join('\n\n')}\n`,
);
process.stderr.write(
  `Wrote ${first.cardClass}/${slugOf(first)}.ts (${faces.length} face(s)); run pnpm gen:scripts\n`,
);
