import type { CardCatalog, CardDefinition, CardScript } from '@sve/rules';
import { scriptFor } from './registry';

export { ALL_SCRIPTS, scriptFor, scriptDrift } from './registry';
export { defineCard, printed, EVOLVE_1, FEED_1 } from './define';
export { deckListOf, fixtureCatalog, uniqueFixtureCards } from './fixture-data';
export {
  buildCatalog,
  canonicalText,
  catalogCard,
  catalogIndex,
  fullCatalog,
  serializeCatalog,
  type CatalogCard,
  type CatalogInput,
  type CatalogPrinting,
} from './catalog';
export { CRAFT_DIRS, type CraftDir } from './crafts';
export {
  ATOMS,
  ENGINE_READY,
  abilitiesOf,
  atomsOfText,
  census,
  censusCard,
  isKeywordOnly,
  type Atom,
  type CardAtoms,
  type CensusReport,
} from './atoms';

/** Mark catalog entries so the playmat can show the "text not automated" badge. */
export function withScriptedFlag(catalog: CardCatalog): CardCatalog {
  return (id) => {
    const def = catalog(id);
    if (!def) return undefined;
    const script = scriptFor(def);
    return {
      ...def,
      scripted: script !== null,
      ...(script?.copyLimit !== undefined ? { copyLimit: script.copyLimit } : {}),
    };
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
