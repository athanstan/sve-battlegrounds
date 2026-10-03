import type { CardCatalog, CardClass, CardDefinition } from './cards';
import type { CardDefId } from './ids';
import { DECK_RULES } from './limits';

export interface DeckEntry {
  readonly card: CardDefId;
  readonly count: number;
}

/** A deck as a player presents it before the game (6.2.1.1). */
export interface DeckList {
  readonly leader: CardDefId;
  readonly main: readonly DeckEntry[];
  readonly evolve: readonly DeckEntry[];
}

export type DeckIssue =
  | { readonly code: 'unknownCard'; readonly card: CardDefId }
  | { readonly code: 'invalidCount'; readonly card: CardDefId; readonly count: number }
  | { readonly code: 'leaderNotLeader'; readonly card: CardDefId }
  | { readonly code: 'mainSize'; readonly size: number; readonly min: number; readonly max: number }
  | { readonly code: 'evolveSize'; readonly size: number; readonly max: number }
  | {
      readonly code: 'notMainDeckCard';
      readonly card: CardDefId;
      readonly reason: 'leader' | 'evolved' | 'token';
    }
  | { readonly code: 'notEvolveDeckCard'; readonly card: CardDefId }
  | {
      readonly code: 'tooManyCopies';
      readonly name: string;
      readonly count: number;
      readonly limit: number;
    }
  | {
      readonly code: 'wrongClass';
      readonly card: CardDefId;
      readonly cardClass: CardClass;
      readonly leaderClass: CardClass;
    }
  | {
      /** A card outside the deck's universe: a universe deck holds one universe and nothing else. */
      readonly code: 'wrongUniverse';
      readonly card: CardDefId;
      readonly universe: string | null;
      readonly leaderUniverse: string | null;
    }
  | { readonly code: 'universeUnsupported'; readonly card: CardDefId; readonly universe: string };

/**
 * Universes the engine can run. Umamusume needs nothing before the game starts (14.2); its serve
 * and race abilities arrive with the ability system. Others (Vanguard's Starting Amulet and drive
 * zone, for one) are rejected until their setup exists.
 */
export const SUPPORTED_UNIVERSES: ReadonlySet<string> = new Set(['Umamusume']);

export const sizeOf = (entries: readonly DeckEntry[]): number =>
  entries.reduce((total, entry) => total + entry.count, 0);

/**
 * Deck construction rules (6.1). Returns every problem found so a deck builder can show them all
 * at once; an empty array means the deck may be presented.
 *
 * A deck is based on one class or one universe (6.1.1.5). A leader with a universe makes a
 * universe deck: every card must share it, and classes do not apply (6.1.1.5.2). Otherwise every
 * card must be the leader's class or Neutral (6.1.1.5.1).
 */
export function validateDeck(deck: DeckList, catalog: CardCatalog): DeckIssue[] {
  const issues: DeckIssue[] = [];

  const leader = catalog(deck.leader);
  if (!leader) {
    issues.push({ code: 'unknownCard', card: deck.leader });
  } else if (leader.kind !== 'leader') {
    issues.push({ code: 'leaderNotLeader', card: leader.id });
  }
  const leaderClass = leader?.cardClass;
  const leaderUniverse = leader?.universe ?? null;

  const copiesByName = new Map<string, { main: number; evolve: number }>();
  const note = (def: CardDefinition, zone: 'main' | 'evolve', count: number) => {
    const entry = copiesByName.get(def.name) ?? { main: 0, evolve: 0 };
    entry[zone] += count;
    copiesByName.set(def.name, entry);
  };

  const inspect = (entries: readonly DeckEntry[], zone: 'main' | 'evolve') => {
    for (const entry of entries) {
      if (!Number.isInteger(entry.count) || entry.count < 1) {
        issues.push({ code: 'invalidCount', card: entry.card, count: entry.count });
        continue;
      }
      const def = catalog(entry.card);
      if (!def) {
        issues.push({ code: 'unknownCard', card: entry.card });
        continue;
      }
      if (zone === 'main') {
        const reason = def.kind === 'leader' ? 'leader' : def.special;
        if (reason) issues.push({ code: 'notMainDeckCard', card: def.id, reason });
      } else if (def.special !== 'evolved') {
        issues.push({ code: 'notEvolveDeckCard', card: def.id });
      }
      if (leaderUniverse !== null || def.universe !== null) {
        if (def.universe !== leaderUniverse) {
          issues.push({
            code: 'wrongUniverse',
            card: def.id,
            universe: def.universe,
            leaderUniverse,
          });
        }
      } else if (leaderClass && def.cardClass !== 'neutral' && def.cardClass !== leaderClass) {
        issues.push({ code: 'wrongClass', card: def.id, cardClass: def.cardClass, leaderClass });
      }
      note(def, zone, entry.count);
    }
  };

  inspect(deck.main, 'main');
  inspect(deck.evolve, 'evolve');

  if (leader?.universe && !SUPPORTED_UNIVERSES.has(leader.universe)) {
    issues.push({ code: 'universeUnsupported', card: leader.id, universe: leader.universe });
  }

  const mainSize = sizeOf(deck.main);
  if (mainSize < DECK_RULES.mainMin || mainSize > DECK_RULES.mainMax) {
    issues.push({
      code: 'mainSize',
      size: mainSize,
      min: DECK_RULES.mainMin,
      max: DECK_RULES.mainMax,
    });
  }
  const evolveSize = sizeOf(deck.evolve);
  if (evolveSize > DECK_RULES.evolveMax) {
    issues.push({ code: 'evolveSize', size: evolveSize, max: DECK_RULES.evolveMax });
  }

  // 6.1.1.4: up to three copies of a name in the main deck, and up to three in the evolve deck.
  for (const [name, copies] of copiesByName) {
    for (const count of [copies.main, copies.evolve]) {
      if (count > DECK_RULES.copiesPerName) {
        issues.push({ code: 'tooManyCopies', name, count, limit: DECK_RULES.copiesPerName });
      }
    }
  }

  return issues;
}
