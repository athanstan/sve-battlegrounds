/**
 * Print the catalog clause census (same atoms as `pnpm cards:status --atoms`).
 *
 *   pnpm cards:atoms
 */
/// <reference types="node" />
import { catalogIndex } from '../packages/cards/src/catalog';
import { census } from '../packages/cards/src/atoms';

const report = census(catalogIndex().cards);
process.stdout.write(
  `cards ${report.cards}  keyword-only ${report.keywordOnly}  abilities ${report.abilities}  unmatched ${report.unmatchedAbilities}  unsupported ${report.unsupportedAtoms.length}\n`,
);
for (const [id, n] of Object.entries(report.byAtom).sort((a, b) => b[1] - a[1])) {
  process.stdout.write(`${String(n).padStart(5)}  ${id}\n`);
}
