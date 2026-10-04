import {
  createMatch,
  opponentOf,
  project,
  reduce,
  seatViewer,
  spectatorViewer,
  asCardId,
  type CardDefId,
  type CardRef,
  type MatchState,
  type MatchView,
  type Prompt,
  type Seat,
  type SeatView,
} from '@sve/rules';
import { fixtureCatalog, fixtureDeck } from '@sve/shadowshowdown/fixture';

/**
 * Real matches and synthetic boards for the playmat's tests and the dev lab.
 *
 * Views come from the actual rules engine, so the lab and the tests draw what a server would
 * send. The play pipeline, attacks and prompts all come from the engine; `populate` still
 * dresses a view with a mid-game board for the lab.
 */

export const catalog = fixtureCatalog;

const answer = (prompt: Prompt) => {
  const base = { seat: prompt.seat } as const;
  switch (prompt.kind) {
    case 'turnOrder':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'turnOrder', goFirst: true },
        },
      } as const;
    case 'mulligan':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'mulligan', redraw: false },
        },
      } as const;
    case 'main':
    case 'quickWindow':
      return { ...base, intent: { type: 'pass', promptId: prompt.id } } as const;
    case 'engageWards':
      return { ...base, intent: { type: 'engageWards', promptId: prompt.id, cards: [] } } as const;
    case 'discard':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'discard', cards: prompt.candidates.slice(0, prompt.count) },
        },
      } as const;
    case 'selectCards':
    case 'keepOnField':
    case 'keepInEx':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: {
            kind: 'selectCards',
            cards: prompt.candidates.slice(
              0,
              prompt.kind === 'selectCards' ? prompt.min : prompt.keep,
            ),
          },
        },
      } as const;
    case 'chooseMode':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'mode', id: prompt.modes[0]?.id ?? '' },
        },
      } as const;
    case 'confirmOptional':
      return {
        ...base,
        intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'confirm', yes: false } },
      } as const;
    case 'allocate':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: {
            kind: 'allocate',
            amounts: prompt.targets.map((_, i) => (i === 0 ? prompt.total : 0)),
          },
        },
      } as const;
    case 'orderPending':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'orderPending', id: prompt.pending[0]?.id ?? 0 },
        },
      } as const;
    case 'chooseNumber':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'number', value: prompt.min },
        },
      } as const;
    case 'declareName':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'name', value: '' },
        },
      } as const;
    case 'orderCards':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'order', cards: prompt.candidates },
        },
      } as const;
  }
};

/** A fresh match: swordcraft against forestcraft, sitting at the turn-order prompt. */
export const newMatch = (seed = 'playmat') =>
  createMatch({
    seed,
    catalog,
    players: [{ deck: fixtureDeck('swordcraft') }, { deck: fixtureDeck('forestcraft') }],
  });

export const newState = (seed?: string): MatchState => newMatch(seed).state;

/** Answer every prompt the default way until `done`, returning the state it stopped at. */
export function advance(
  state: MatchState,
  done: (state: MatchState) => boolean,
  limit = 400,
): MatchState {
  let current = state;
  for (let step = 0; step < limit; step++) {
    if (done(current) || current.outcome || !current.prompt) return current;
    const result = reduce(current, answer(current.prompt));
    if (!result.ok) throw new Error(`Default answer rejected: ${result.reason}`);
    current = result.state;
  }
  throw new Error('Match did not reach the goal');
}

export const atMainPhase = (seed?: string, turn = 1): MatchState =>
  advance(newState(seed), (state) => state.turn >= turn && state.prompt?.kind === 'main');

export const viewOf = (state: MatchState, seat: Seat): MatchView =>
  project(state, seatViewer(seat));
export const spectatorViewOf = (state: MatchState, handsVisible: readonly Seat[] = []): MatchView =>
  project(state, spectatorViewer(handsVisible));

const ref = (id: string, def: string): CardRef => ({ id: asCardId(id), def: def as CardDefId });

const FIELD_DEFS: Record<Seat, readonly string[]> = {
  0: ['ashen-squire', 'gatehouse-sentry', 'oathbound-knight', 'crimson-marshal'],
  1: ['moss-fawn', 'glade-warden', 'elder-treant'],
};

/**
 * Dress a view with a mid-game board: followers on the field (one engaged, one evolved), EX
 * cards, a cemetery and a banished card. Only the visible parts of the view are touched, so the
 * result still respects whatever hidden information the original had.
 */
export function populate(view: MatchView): MatchView {
  const seats = view.seats.map((seat): SeatView => {
    const defs = FIELD_DEFS[seat.seat];
    const field = defs.map((def, index) => ({
      card: ref(`lab:${seat.seat}:f${index}`, `fx-${def}`),
      placement: index === 1 ? ('engaged' as const) : ('reserved' as const),
      enteredTurn: 1,
      shown: { attack: 2, defense: 2, keywords: [] as const },
      racedTimes: 0,
      counters: {},
      equipped: [],
    }));
    const evolved = field[2];
    return {
      ...seat,
      field,
      ex: [
        {
          card: ref(`lab:${seat.seat}:x0`, 'fx-torch-bearer'),
          shown: { attack: 1, defense: 1, keywords: [] as const },
        },
        {
          card: ref(`lab:${seat.seat}:x1`, 'fx-stray-hound'),
          shown: { attack: 1, defense: 1, keywords: [] as const },
        },
      ],
      cemetery: [
        ref(`lab:${seat.seat}:c0`, 'fx-banner-bearer'),
        ref(`lab:${seat.seat}:c1`, 'fx-roadside-medic'),
        ref(`lab:${seat.seat}:c2`, 'fx-market-guard'),
      ],
      banished: [{ card: ref(`lab:${seat.seat}:b0`, 'fx-cave-troll'), faceDown: false }],
      evolveZone: evolved
        ? [
            {
              card: ref(`lab:${seat.seat}:e0`, `fx-${defs[2]}-evolved`),
              linkedTo: evolved.card.id,
              superEvolved: seat.seat === 0,
            },
          ]
        : [],
      raceZone: [],
      resources: {
        ...seat.resources,
        playPoints: 3,
        maxPlayPoints: 5,
        evolutionPoints: 3,
        superEvolutionPoints: 1,
      },
      leader: { ...seat.leader, defense: seat.seat === 0 ? 20 : 17 },
    };
  });
  return { ...view, seats: [seats[0]!, seats[1]!] };
}

export { opponentOf };
