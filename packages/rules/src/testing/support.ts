import type { Action, Intent } from '../actions/intents';
import { createMatch, type CreatedMatch } from '../engine/create';
import { reduce } from '../engine/reduce';
import type { EngineEvent } from '../events/events';
import { cardKey, type CardCatalog, type CardDefinition } from '../model/cards';
import type { DeckList } from '../model/deck';
import { asCardDefId, type CardDefId, type Seat } from '../model/ids';
import type { MatchState, Prompt } from '../state/state';

/** Test-only helpers. Not exported from the package. */

const FOLLOWER_COUNT = 14;

const def = (
  partial: Partial<CardDefinition> & Pick<CardDefinition, 'id' | 'name'>,
): CardDefinition => {
  const special = partial.special ?? null;
  return {
    kind: 'follower',
    special: null,
    cardClass: 'neutral',
    universe: null,
    traits: [],
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: [],
    text: '',
    artUrl: null,
    ...partial,
    key: partial.key ?? cardKey(partial.name, special),
  };
};

const followerId = (n: number): CardDefId => asCardDefId(`test-follower-${n}`);
const evolvedId = (n: number): CardDefId => asCardDefId(`test-evolved-${n}`);

export const LEADER = asCardDefId('test-leader-sword');
export const OTHER_LEADER = asCardDefId('test-leader-forest');
export const WARD_FOLLOWER = asCardDefId('test-ward-follower');

const DEFINITIONS: readonly CardDefinition[] = [
  def({
    id: LEADER,
    name: 'Test Swordsman',
    kind: 'leader',
    cardClass: 'swordcraft',
    cost: 0,
    attack: null,
    defense: null,
  }),
  def({
    id: OTHER_LEADER,
    name: 'Test Ranger',
    kind: 'leader',
    cardClass: 'forestcraft',
    cost: 0,
    attack: null,
    defense: null,
  }),
  ...Array.from({ length: FOLLOWER_COUNT }, (_, n) =>
    def({
      id: followerId(n),
      name: `Test Follower ${n}`,
      cost: (n % 6) + 1,
      attack: (n % 4) + 1,
      defense: (n % 5) + 1,
      text: n < 3 ? '[evolve] [cost01]: Evolve this follower.' : '',
    }),
  ),
  ...Array.from({ length: 3 }, (_, n) =>
    def({
      id: evolvedId(n),
      name: `Test Follower ${n}`,
      special: 'evolved',
      cost: 0,
      attack: n + 3,
      defense: n + 3,
    }),
  ),
  def({ id: WARD_FOLLOWER, name: 'Test Warden', keywords: ['ward'], attack: 1, defense: 3 }),
  def({ id: asCardDefId('test-sword-only'), name: 'Test Blade', cardClass: 'swordcraft' }),
  def({ id: asCardDefId('test-forest-only'), name: 'Test Thorn', cardClass: 'forestcraft' }),
];

export const testCatalog: CardCatalog = (id) =>
  DEFINITIONS.find((candidate) => candidate.id === id);

/** A legal 42-card swordcraft/neutral deck: 14 followers x3, with 3 evolved cards. */
export function legalDeck(leader: CardDefId = LEADER): DeckList {
  return {
    leader,
    main: Array.from({ length: FOLLOWER_COUNT }, (_, n) => ({ card: followerId(n), count: 3 })),
    evolve: Array.from({ length: 3 }, (_, n) => ({ card: evolvedId(n), count: 1 })),
  };
}

export function newMatch(
  seed = 'test-seed',
  decks: readonly [DeckList, DeckList] = [legalDeck(), legalDeck(OTHER_LEADER)],
): CreatedMatch {
  return createMatch({
    seed,
    catalog: testCatalog,
    players: [{ deck: decks[0] }, { deck: decks[1] }],
  });
}

/**
 * The default answer to each prompt: take the first seat's choice, keep opening hands,
 * discard the first cards offered, end the main phase.
 */
export function defaultAnswer(prompt: Prompt): Action {
  const base = { seat: prompt.seat };
  switch (prompt.kind) {
    case 'turnOrder':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'turnOrder', goFirst: true },
        },
      };
    case 'mulligan':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'mulligan', redraw: false },
        },
      };
    case 'main':
    case 'quickWindow':
      return { ...base, intent: { type: 'pass', promptId: prompt.id } };
    case 'engageWards':
      return {
        ...base,
        intent: { type: 'engageWards', promptId: prompt.id, cards: prompt.candidates },
      };
    case 'discard':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'discard', cards: prompt.candidates.slice(0, prompt.count) },
        },
      };
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
      };
    case 'chooseMode':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'mode', id: prompt.modes[0]?.id ?? '' },
        },
      };
    case 'confirmOptional':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'confirm', yes: false },
        },
      };
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
      };
    case 'orderPending':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'orderPending', id: prompt.pending[0]?.id ?? 0 },
        },
      };
    case 'chooseNumber':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'number', value: prompt.min },
        },
      };
    case 'declareName':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'name', value: '' },
        },
      };
    case 'orderCards':
      return {
        ...base,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'order', cards: prompt.candidates },
        },
      };
  }
}

export interface Run {
  state: MatchState;
  events: EngineEvent[];
}

/** Apply an action that must be legal. */
export function must(run: Run, action: Action): Run {
  const result = reduce(run.state, action);
  if (!result.ok)
    throw new Error(`Expected ${JSON.stringify(action)} to be legal, got ${result.reason}`);
  return { state: result.state, events: [...run.events, ...result.events] };
}

export const intent = (seat: Seat, value: Intent): Action => ({ seat, intent: value });

/** Answer prompts with `answer` until `stop` says so (or the match ends). */
export function playUntil(
  start: Run,
  stop: (state: MatchState) => boolean,
  answer: (prompt: Prompt) => Action = defaultAnswer,
  limit = 500,
): Run {
  let run = start;
  for (let i = 0; i < limit; i++) {
    if (stop(run.state) || run.state.outcome || run.state.prompt === null) return run;
    run = must(run, answer(run.state.prompt));
  }
  throw new Error(`Match did not reach the stop condition within ${limit} answers`);
}

export const started = (seed?: string): Run => {
  const created = newMatch(seed);
  return { state: created.state, events: [...created.events] };
};

/** Run setup to the first main-phase prompt. */
export const atFirstMainPhase = (seed?: string): Run =>
  playUntil(started(seed), (state) => state.prompt?.kind === 'main');
