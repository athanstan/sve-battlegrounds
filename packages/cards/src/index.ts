import type { CardCatalog, CardDefinition, CardScript } from '@sve/rules';
import { scriptFor } from './registry';

export { ALL_SCRIPTS, scriptFor } from './registry';
export { defineCard, printed, EVOLVE_1, FEED_1 } from './define';
export { deckListOf, fixtureCatalog, uniqueFixtureCards } from './fixture-data';

/** Mark catalog entries so the playmat can show the "text not automated" badge. */
export function withScriptedFlag(catalog: CardCatalog): CardCatalog {
  return (id) => {
    const def = catalog(id);
    if (!def) return undefined;
    return { ...def, scripted: scriptFor(def) !== null };
  };
}

export function logUnscripted(
  defs: readonly CardDefinition[],
  lookup: (def: CardDefinition) => CardScript | null = scriptFor,
): void {
  const names = [
    ...new Set(
      defs.filter((def) => def.text.length > 0 && lookup(def) === null).map((def) => def.name),
    ),
  ].sort();
  if (names.length > 0) console.warn(`Unscripted cards: ${names.join(', ')}`);
}
