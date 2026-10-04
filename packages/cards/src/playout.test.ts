import {
  applyEvent,
  createMatch,
  foldView,
  opponentOf,
  project,
  projectEvent,
  reduce,
  seatViewer,
  spectatorViewer,
  stateFromCreation,
  type Action,
  type EngineEvent,
  type MatchState,
  type Prompt,
  type Seat,
} from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { deckListOf, fixtureCatalog } from './fixture-data';
import { scriptFor } from './registry';

const catalog = fixtureCatalog();

function start(seed: string) {
  return createMatch({
    seed,
    catalog,
    scripts: scriptFor,
    players: [{ deck: deckListOf('940') }, { deck: deckListOf('909') }],
  });
}

function pick(n: number, max: number): number {
  return max <= 0 ? 0 : n % max;
}

function randomAnswer(prompt: Prompt, n: number): Action {
  const seat = prompt.seat;
  switch (prompt.kind) {
    case 'turnOrder':
      return {
        seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'turnOrder', goFirst: n % 2 === 0 },
        },
      };
    case 'mulligan':
      return {
        seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'mulligan', redraw: n % 2 === 0 },
        },
      };
    case 'main': {
      const options = prompt.options;
      if (options.length === 0 || n % 3 === 0) {
        return { seat, intent: { type: 'pass', promptId: prompt.id } };
      }
      const option = options[pick(n, options.length)]!;
      if (option.type === 'play')
        return { seat, intent: { type: 'play', promptId: prompt.id, card: option.card } };
      if (option.type === 'activate') {
        return {
          seat,
          intent: {
            type: 'activate',
            promptId: prompt.id,
            card: option.card,
            ability: option.ability,
          },
        };
      }
      if (option.type === 'evolve') {
        return {
          seat,
          intent: {
            type: 'evolve',
            promptId: prompt.id,
            card: option.card,
            superEvolve: option.superEvolve,
            useEvolutionPoint: option.useEvolutionPoint,
          },
        };
      }
      return {
        seat,
        intent: {
          type: 'attack',
          promptId: prompt.id,
          attacker: option.attacker,
          target: option.target,
        },
      };
    }
    case 'quickWindow':
      return { seat, intent: { type: 'pass', promptId: prompt.id } };
    case 'engageWards':
      return { seat, intent: { type: 'engageWards', promptId: prompt.id, cards: [] } };
    case 'discard':
      return {
        seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'discard', cards: prompt.candidates.slice(0, prompt.count) },
        },
      };
    case 'selectCards':
    case 'keepOnField':
    case 'keepInEx': {
      const count = prompt.kind === 'selectCards' ? prompt.min : prompt.keep;
      return {
        seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'selectCards', cards: prompt.candidates.slice(0, count) },
        },
      };
    }
    case 'chooseMode':
      return {
        seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'mode', id: prompt.modes[0]?.id ?? '0' },
        },
      };
    case 'confirmOptional':
      return {
        seat,
        intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'confirm', yes: false } },
      };
    case 'allocate':
      return {
        seat,
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
        seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'orderPending', id: prompt.pending[0]?.id ?? 0 },
        },
      };
    case 'chooseNumber':
      return {
        seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'number', value: prompt.min },
        },
      };
    case 'declareName':
      return {
        seat,
        intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'name', value: '' } },
      };
    case 'orderCards':
      return {
        seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'order', cards: prompt.candidates },
        },
      };
  }
}

function playout(seed: string, answers = 80): { events: EngineEvent[]; state: MatchState } {
  const created = start(seed);
  let state = created.state;
  const events: EngineEvent[] = [...created.events];
  for (let n = 0; n < answers; n++) {
    if (!state.prompt || state.outcome) break;
    const result = reduce(state, randomAnswer(state.prompt, n + seed.length));
    if (!result.ok) throw new Error(result.reason);
    events.push(...result.events);
    state = result.state;
  }
  return { events, state };
}

const mentions = (payload: unknown, id: string) => JSON.stringify(payload).includes(`"${id}"`);

describe('random playouts of the two real decks', () => {
  it('keeps fold(projectEvent) equal to project, and hides the other seat’s private ids', () => {
    for (const seed of ['p1', 'p2', 'p3']) {
      const { events, state } = playout(seed);
      expect(state.seq).toBeGreaterThan(10);
      const created = events[0];
      if (created?.type !== 'matchCreated') throw new Error('missing matchCreated');
      let folded = foldView(null, projectEvent(created, seatViewer(0), state)!);
      let rebuilt = stateFromCreation(created);
      for (const event of events.slice(1)) {
        rebuilt = applyEvent(rebuilt, event);
        const projected = projectEvent(event, seatViewer(0), rebuilt);
        if (projected) folded = foldView(folded, projected);
      }
      expect(folded).toEqual(project(rebuilt, seatViewer(0)));

      const hidden = (viewerSeat: Seat) => {
        const other = opponentOf(viewerSeat);
        return [
          ...state.seats[other].deck,
          ...state.seats[other].hand,
          ...state.seats[other].evolveDeck,
        ];
      };
      for (const viewer of [seatViewer(0), seatViewer(1), spectatorViewer()] as const) {
        const view = project(state, viewer);
        const seat: Seat | null = viewer.kind === 'seat' ? viewer.seat : null;
        const secret = seat === null ? [...hidden(0), ...hidden(1)] : hidden(seat);
        for (const id of secret) {
          expect(mentions(view, id), `id ${id} leaked to ${JSON.stringify(viewer)}`).toBe(false);
        }
      }
    }
  });
});
