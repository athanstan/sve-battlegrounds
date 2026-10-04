import type { Keyword } from '../model/cards';
import type { CardId } from '../model/ids';
import { definitionOf, type MatchState, type ShownStats } from './state';

/**
 * Printed stats plus instance modifiers and grants. Used for cards that are not on the
 * field (EX, and any other off-field buff): field cards keep their own `shown` snapshot
 * via `refreshDerived`, which also folds in damage, statics and evolve links.
 */
export function instanceShown(state: MatchState, id: CardId): ShownStats {
  const def = definitionOf(state, id);
  const inst = state.cards[id];
  const keywords = new Set<Keyword>(def.keywords);
  for (const grant of inst?.granted ?? []) keywords.add(grant.keyword);
  let attack = def.attack ?? 0;
  let defense = def.defense ?? 0;
  for (const mod of inst?.modifiers ?? []) {
    attack += mod.attack;
    defense += mod.defense;
  }
  return { attack, defense, keywords: [...keywords] };
}
