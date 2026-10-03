import {
  CARD_CLASSES,
  KEYWORDS,
  asCardDefId,
  type CardClass,
  type CardDefinition,
  type DeckList,
  type Keyword,
} from '@sve/rules';
import { z } from 'zod';
import type { SsDeck, SsUser } from './types';

/**
 * THE ASSUMED SHADOWSHOWDOWN.COM API. The real one is not finished, so this file is the single
 * place that says what we expect of it. When it ships, this and `http.ts` are the only files
 * that change; the server, the rules and the browser never see a wire shape.
 *
 *   GET /api/v1/me                 -> WireUser            (Authorization: Bearer <token>)
 *   GET /api/v1/decks?game=sve     -> { decks: WireDeck[] }   the caller's own decks
 *   GET /api/v1/decks/:id          -> WireDeck                404 when absent or not theirs
 *   GET /api/v1/cards?game=sve     -> { cards: WireCard[] }   public
 *
 * Decoding is tolerant where it is safe to be (unknown keywords are dropped, optional fields may
 * be missing) and strict where a wrong guess would corrupt a match (ids, counts, classes).
 */

const wireUser = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  avatarUrl: z.string().nullish(),
});

const wireEntry = z.object({ card: z.string().min(1), count: z.int().min(1) });

const wireDeck = z.object({
  id: z.string().min(1),
  name: z.string(),
  leader: z.string().min(1),
  main: z.array(wireEntry),
  evolve: z.array(wireEntry),
});

const wireCard = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['leader', 'follower', 'spell', 'amulet']),
  special: z.enum(['evolved', 'token']).nullish(),
  class: z.enum(CARD_CLASSES),
  universe: z.string().nullish(),
  traits: z.array(z.string()).nullish(),
  cost: z.int().min(0),
  attack: z.int().nullish(),
  defense: z.int().nullish(),
  keywords: z.array(z.string()).nullish(),
  text: z.string().nullish(),
  artUrl: z.string().nullish(),
});

export const userResponse = wireUser;
export const decksResponse = z.object({ decks: z.array(wireDeck) });
export const deckResponse = wireDeck;
export const cardsResponse = z.object({ cards: z.array(wireCard) });

export type WireUser = z.infer<typeof wireUser>;
export type WireDeck = z.infer<typeof wireDeck>;
export type WireCard = z.infer<typeof wireCard>;

const KNOWN_KEYWORDS: ReadonlySet<string> = new Set(KEYWORDS);

export function toUser(wire: WireUser): SsUser {
  return { id: wire.id, displayName: wire.username, avatarUrl: wire.avatarUrl ?? null };
}

export function toDeck(wire: WireDeck): SsDeck {
  const list: DeckList = {
    leader: asCardDefId(wire.leader),
    main: wire.main.map((entry) => ({ card: asCardDefId(entry.card), count: entry.count })),
    evolve: wire.evolve.map((entry) => ({ card: asCardDefId(entry.card), count: entry.count })),
  };
  return { id: wire.id, name: wire.name, list };
}

export function toCard(wire: WireCard): CardDefinition {
  return {
    id: asCardDefId(wire.id),
    name: wire.name,
    kind: wire.type,
    special: wire.special ?? null,
    cardClass: wire.class satisfies CardClass,
    universe: wire.universe ?? null,
    traits: wire.traits ?? [],
    cost: wire.cost,
    attack: wire.attack ?? null,
    defense: wire.defense ?? null,
    keywords: (wire.keywords ?? []).filter((keyword): keyword is Keyword =>
      KNOWN_KEYWORDS.has(keyword),
    ),
    text: wire.text ?? '',
    artUrl: wire.artUrl ?? null,
  };
}
