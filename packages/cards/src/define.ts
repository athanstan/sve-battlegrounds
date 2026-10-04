import { cardKey, textHash, type Ability, type CardScript, type SpecialType } from '@sve/rules';
import { catalogCard, equivalentTexts, primaryText } from './catalog';

export const EVOLVE_1 = '[evolve] [cost01]: Evolve this follower.';
export const FEED_1 = '[feed] [cost01]: Race this follower.';

export function printed(...lines: string[]): string {
  return lines.filter((line) => line.length > 0).join('\n');
}

export function defineCard(spec: {
  readonly key?: string;
  readonly name: string;
  readonly text: string;
  readonly abilities: readonly Ability[];
  readonly alsoNamed?: readonly string[];
  readonly alsoHashes?: readonly string[];
  readonly copyLimit?: number;
  readonly special?: SpecialType;
}): CardScript {
  return {
    key: spec.key ?? cardKey(spec.name, spec.special ?? null),
    name: spec.name,
    textHash: textHash(spec.text),
    abilities: spec.abilities,
    ...(spec.alsoNamed ? { alsoNamed: spec.alsoNamed } : {}),
    ...(spec.alsoHashes && spec.alsoHashes.length > 0 ? { alsoHashes: spec.alsoHashes } : {}),
    ...(spec.copyLimit !== undefined ? { copyLimit: spec.copyLimit } : {}),
  };
}

/**
 * The script of a card in the catalog. Name, key and printed text come from the cached database
 * row, never from a deck, so a script cannot drift from the text it was written against and says
 * nothing about how many copies anyone plays.
 *
 * It covers every printing whose text means the same (reprints with other icon markup or
 * reminder text); a printing worded differently stays unscripted until it is reviewed.
 */
export function scriptOf(
  key: string,
  abilities: readonly Ability[],
  extra?: {
    readonly alsoNamed?: readonly string[];
    readonly copyLimit?: number;
    /**
     * A person compared every printing of this card against the primary one and found them to say
     * the same thing in different words (reordered lines, "Choose 1" for "Choose one", nested
     * reminder text). Without this, only printings that `canonicalText` proves equal are covered.
     */
    readonly allPrintings?: true;
  },
): CardScript {
  const card = catalogCard(key);
  if (!card) {
    throw new Error(`Card ${key} is not in the catalog; run \`pnpm dump:cards\` or fix the key`);
  }
  const text = primaryText(card);
  const { allPrintings, ...rest } = extra ?? {};
  const covered = allPrintings
    ? card.printings.map((printing) => printing.text)
    : equivalentTexts(card);
  const alsoHashes = covered
    .map((variant) => textHash(variant))
    .filter((hash) => hash !== textHash(text));
  return defineCard({
    key: card.key,
    name: card.name,
    text,
    abilities,
    ...(card.special ? { special: card.special } : {}),
    ...(alsoHashes.length > 0 ? { alsoHashes: [...new Set(alsoHashes)] } : {}),
    ...(card.copyLimit !== undefined ? { copyLimit: card.copyLimit } : {}),
    ...rest,
  });
}
