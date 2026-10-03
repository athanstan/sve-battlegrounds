import type { EngineEvent, SeatSetup } from '../events/events';
import type { CardCatalog, CardDefinition } from '../model/cards';
import { validateDeck, type DeckIssue, type DeckList } from '../model/deck';
import { SEATS, asCardId, type CardDefId, type CardRef, type Seat } from '../model/ids';
import { STARTING_LEADER_DEFENSE } from '../model/limits';
import { nextInt, seedRng, shuffle } from '../rng';
import type { MatchState } from '../state/state';
import { settle } from './run';
import { Transcript } from './transcript';
import type { CardScript } from '../abilities/spec';
import { DEFAULT_TOKENS } from '../abilities/tokens';

export interface PlayerSetup {
  readonly deck: DeckList;
}

export interface MatchSetup {
  /** Stored on the match; the only source of randomness. Keep it server-side until the match ends. */
  readonly seed: string;
  readonly catalog: CardCatalog;
  readonly players: readonly [PlayerSetup, PlayerSetup];
  readonly scripts?: (def: CardDefinition) => CardScript | null;
  readonly tokens?: Readonly<Record<string, CardDefinition>>;
}

/** Thrown when a presented deck breaks 6.1. Callers should run `validateDeck` first to give feedback. */
export class InvalidDeckError extends Error {
  constructor(
    readonly seat: Seat,
    readonly issues: readonly DeckIssue[],
  ) {
    super(
      `Seat ${seat} presented an illegal deck: ${issues.map((issue) => issue.code).join(', ')}`,
    );
    this.name = 'InvalidDeckError';
  }
}

export interface CreatedMatch {
  readonly state: MatchState;
  /** The complete log so far, starting with `matchCreated`. */
  readonly events: readonly EngineEvent[];
}

function definitionFor(catalog: CardCatalog, id: CardDefId): CardDefinition {
  const def = catalog(id);
  if (!def) throw new Error(`Card ${id} vanished from the catalog after validation`);
  return def;
}

/**
 * Give every physical card an id that says nothing about the card.
 *
 * Ids are public: a card the opponent has seen is named by its id forever after. If they were
 * numbered in deck-list order, seeing `0:4` would hint that `0:3` and `0:5` are copies of the
 * same card, and numbering after the real shuffle would reveal deck position. So the copies
 * are shuffled once, with a stream derived from the seed but separate from the match's own,
 * and numbered in that order. The real deck order comes later from `deckShuffled`.
 */
function seatSetupFor(seat: Seat, deck: DeckList, seed: string): SeatSetup {
  const label = (entries: DeckList['main'], zone: 'main' | 'evolve', prefix: string): CardRef[] => {
    const copies = entries.flatMap((entry) =>
      Array.from({ length: entry.count }, () => entry.card),
    );
    const [shuffled] = shuffle(copies, seedRng(`${seed}/ids/${seat}/${zone}`));
    return shuffled.map((def, n) => ({ id: asCardId(`${seat}:${prefix}${n}`), def }));
  };
  return {
    leader: { id: asCardId(`${seat}:L`), def: deck.leader },
    leaderDefense: STARTING_LEADER_DEFENSE,
    deck: label(deck.main, 'main', ''),
    evolve: label(deck.evolve, 'evolve', 'E'),
  };
}

/**
 * Prepare a match (6.2.1): present leaders and decks, shuffle, randomly pick the seat that
 * chooses turn order, then run until that seat must answer.
 */
export function createMatch(setup: MatchSetup): CreatedMatch {
  setup.players.forEach((player, index) => {
    const issues = validateDeck(player.deck, setup.catalog);
    if (issues.length > 0) throw new InvalidDeckError(index === 0 ? 0 : 1, issues);
  });

  const seats = [
    seatSetupFor(0, setup.players[0].deck, setup.seed),
    seatSetupFor(1, setup.players[1].deck, setup.seed),
  ] as const;

  const defIds = new Set<CardDefId>(
    seats.flatMap((seat) => [seat.leader, ...seat.deck, ...seat.evolve].map((ref) => ref.def)),
  );
  const defs = [...defIds].map((id) => definitionFor(setup.catalog, id));
  const tokens = Object.values(setup.tokens ?? DEFAULT_TOKENS);
  const scripts = [...defs, ...tokens].flatMap((def) => {
    const script = setup.scripts?.(def);
    return script ? [script] : [];
  });

  const t = Transcript.begin({
    type: 'matchCreated',
    seed: setup.seed,
    defs,
    seats,
    scripts,
    tokens,
  });

  for (const seat of SEATS) {
    const order = t.random((rng) => shuffle(t.state.seats[seat].deck, rng)); // 6.2.1.4
    t.emit({ type: 'deckShuffled', seat, order });
  }

  const chooser = t.random((rng) => nextInt(rng, 2)); // 6.2.1.6
  t.emit({ type: 'turnOrderChooserPicked', seat: chooser === 0 ? 0 : 1 });

  settle(t);
  return { state: t.state, events: t.events };
}
