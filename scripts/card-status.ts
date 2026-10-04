/**
 * How much of the catalog has a script, and which mechanic atoms the remainder uses.
 *
 *   pnpm cards:status                 # summary
 *   pnpm cards:status forestcraft     # unscripted cards of one craft, by name
 *   pnpm cards:status --atoms         # atom counts and unmatched residue
 */
/// <reference types="node" />
import { catalogIndex } from '../packages/cards/src/catalog';
import { CRAFT_DIRS } from '../packages/cards/src/crafts';
import { ALL_SCRIPTS } from '../packages/cards/src/registry';
import { census, censusCard, isKeywordOnly } from '../packages/cards/src/atoms';
import { primaryText } from '../packages/cards/src/catalog';

const scripted = new Set(ALL_SCRIPTS.map((script) => script.key));
const { cards } = catalogIndex();
const args = process.argv.slice(2);
const atomsFlag = args.includes('--atoms');
const craft = args.find((arg) => arg !== '--atoms');

const out = (line: string) => process.stdout.write(`${line}\n`);
const err = (line: string) => process.stderr.write(`${line}\n`);

if (atomsFlag && !craft) {
  const report = census(cards);
  out(`cards ${report.cards}  keyword-only ${report.keywordOnly}  abilities ${report.abilities}`);
  out(`unmatched abilities ${report.unmatchedAbilities}`);
  out(`unsupported atoms ${report.unsupportedAtoms.length}`);
  const ranked = Object.entries(report.byAtom).sort((a, b) => b[1] - a[1]);
  for (const [id, n] of ranked) out(`${String(n).padStart(5)}  ${id}`);
} else if (craft) {
  const todo = cards.filter((card) => card.cardClass === craft && !scripted.has(card.key));
  for (const card of todo) {
    const row = censusCard(card);
    const tag = row.keywordOnly ? 'keyword' : row.atoms.join(',') || 'plain';
    out(`${card.key}\t${card.name}\t${tag}`);
  }
  err(`${todo.length} unscripted ${craft} cards`);
} else {
  for (const name of CRAFT_DIRS) {
    const own = cards.filter((card) => card.cardClass === name);
    const done = own.filter((card) => scripted.has(card.key)).length;
    const keyword = own.filter(
      (card) => !scripted.has(card.key) && isKeywordOnly(primaryText(card)),
    ).length;
    out(
      `${name.padEnd(12)} ${String(done).padStart(4)} / ${String(own.length).padStart(4)}  keyword-only ${keyword}`,
    );
  }
  const keyword = cards.filter(
    (card) => !scripted.has(card.key) && isKeywordOnly(primaryText(card)),
  ).length;
  out(
    `${'total'.padEnd(12)} ${String(scripted.size).padStart(4)} / ${String(cards.length).padStart(4)}  keyword-only ${keyword}`,
  );
}
